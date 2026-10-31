/**
 * Web push на цьому пристрої (ADR-0046, PF19): дозвіл браузера, фоновий файл, підписка. Контракт
 * із сервером — `lib/web-push`.
 *
 * - Дозвіл просимо лише після натискання: браузери блокують запит під час завантаження сторінки.
 * - Фоновий файл `public/erp-ui-push-sw.js` має власну вузьку область: не заважає MSW і PWA, а push
 *   приходить незалежно від того, чи сторінка в його області.
 * - Застосунок стоїть у корені домену: адреса файла й область сталі.
 */
import type { DevicePushSubscription, PushApi } from "@/registry/lib/web-push"

export const PUSH_SW_URL = "/erp-ui-push-sw.js"
export const PUSH_SW_SCOPE = "/erp-ui-push/"

/** Повідомлення фонового файла вкладкам (ті самі назви — у `erp-ui-push-sw.js`). */
export const PUSH_RECEIVED_MESSAGE = "erp-ui:push-received"
export const PUSH_OPEN_MESSAGE = "erp-ui:push-open"

/** Чия підписка на цьому пристрої: push не має дістатися тому, хто ввійшов наступним. */
const OWNER_KEY = "erp-ui:push-owner"
/** Служба браузера може мовчати (Brave без служб Google): межа замість вічного спінера. */
const PUSH_TIMEOUT_MS = 15_000

export type DevicePushState = "unsupported" | "denied" | "off" | "on"

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

function withPushTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Push service timeout"))
    }, PUSH_TIMEOUT_MS)
  })
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer)
  })
}

function readOwner(): string | null {
  try {
    return globalThis.localStorage?.getItem(OWNER_KEY) ?? null
  } catch {
    return null
  }
}

function writeOwner(userId: string | null): boolean {
  try {
    if (userId) globalThis.localStorage?.setItem(OWNER_KEY, userId)
    else globalThis.localStorage?.removeItem(OWNER_KEY)
    return true
  } catch {
    return false
  }
}

/** Реєстрація нашого файла; без неї браузер віддав би найближчу ширшу (MSW, PWA). */
async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  const registration =
    await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE)
  return registration?.scope.endsWith(PUSH_SW_SCOPE) ? registration : null
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await pushRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

function activated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const onChange = () => {
      if (worker.state !== "activated" && worker.state !== "redundant") return
      worker.removeEventListener("statechange", onChange)
      if (worker.state === "activated") resolve()
      else reject(new Error("Push service worker failed to install"))
    }
    worker.addEventListener("statechange", onChange)
  })
}

/** Початок адрес застосунку: `/#`, якщо адреси в хеші. Посилання push завжди без нього. */
export function pushLinkBase(): string {
  return location.hash.startsWith("#/") ? "/#" : ""
}

/** Підписка потребує активного файла, а `serviceWorker.ready` чекає на файл цієї сторінки. */
async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const linkBase = pushLinkBase()
  const registration = await navigator.serviceWorker.register(
    linkBase
      ? `${PUSH_SW_URL}?linkBase=${encodeURIComponent(linkBase)}`
      : PUSH_SW_URL,
    { scope: PUSH_SW_SCOPE },
  )
  const worker = registration.installing ?? registration.waiting
  if (worker && !registration.active) await activated(worker)
  return registration
}

function keyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(publicKey.length / 4) * 4, "=")
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

function hasKey(
  subscription: PushSubscription,
  key: Uint8Array<ArrayBuffer>,
): boolean {
  const current = subscription.options.applicationServerKey
  return (
    current !== null &&
    current.byteLength === key.length &&
    new Uint8Array(current).every((byte, index) => byte === key[index])
  )
}

function toPayload(subscription: PushSubscription): DevicePushSubscription {
  const { endpoint, expirationTime = null, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth)
    throw new Error("Push subscription without keys")
  return {
    endpoint,
    expirationTime,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  }
}

/** Підписка з цим ключем: стару з іншим ключем браузер не замінить сам. */
async function subscribeWithKey(
  registration: ServiceWorkerRegistration,
  key: Uint8Array<ArrayBuffer>,
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription()
  if (existing && hasKey(existing, key)) return existing
  await existing?.unsubscribe()
  return withPushTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }),
  )
}

/**
 * Браузер перестає приймати push, показані сповіщення зникають: наступна людина на цьому пристрої їх
 * не бачить. `unsubscribe` може відмовити (`false`), тоді підписка жива й мовчати про це не можна.
 */
async function dropSubscription(
  registration: ServiceWorkerRegistration,
  subscription: PushSubscription,
): Promise<void> {
  const shown = await registration.getNotifications()
  shown.forEach((notification) => {
    notification.close()
  })
  if (!(await subscription.unsubscribe()))
    throw new Error("Push unsubscribe failed")
  writeOwner(null)
}

export async function devicePushState(): Promise<DevicePushState> {
  if (!isPushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  return (await currentSubscription()) ? "on" : "off"
}

/** Викликати лише з натискання. Сервер не прийняв підписку — вона скасовується й тут. */
export async function enableDevicePush(
  api: PushApi,
  userId: string,
): Promise<DevicePushState> {
  const permission = await Notification.requestPermission()
  if (permission === "denied") return "denied"
  if (permission !== "granted") return "off"
  const registration = await withPushTimeout(registerWorker())
  const subscription = await subscribeWithKey(
    registration,
    keyBytes(await api.publicKey()),
  )
  try {
    // Власник першим: друга вкладка може звірити підписку, поки йде запит.
    if (!writeOwner(userId)) throw new Error("Push owner not saved")
    await api.save(toPayload(subscription))
  } catch (error) {
    writeOwner(null)
    await subscription.unsubscribe().catch(() => false)
    throw error
  }
  return "on"
}

/** Браузер перестає приймати push одразу; решту сервер прибере за відповіддю 410 служби. */
export async function disableDevicePush(api: PushApi): Promise<void> {
  const registration = await pushRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!registration || !subscription) return
  const { endpoint } = subscription
  await dropSubscription(registration, subscription)
  await api.remove(endpoint).catch(() => undefined)
}

export async function sendDevicePushTest(api: PushApi): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) throw new Error("No push subscription on this device")
  await api.sendTest(subscription.endpoint)
}

/**
 * Запуск застосунку: сервер міг загубити підписку, браузер міг її оновити чи зняти сам, ключ міг
 * змінитись. Підписка іншої людини (закрили браузер, не вийшовши) скасовується, а не переходить
 * новій.
 */
export async function syncDevicePush(
  api: PushApi,
  userId: string,
): Promise<void> {
  const registration = await pushRegistration()
  if (!registration) return
  const subscription = await registration.pushManager.getSubscription()
  const isOwner = readOwner() === userId
  if (subscription && !isOwner) {
    await dropSubscription(registration, subscription)
    return
  }
  // Людина підписку не вимикала: власник лишився, тож браузер зняв її сам.
  if (!isOwner || Notification.permission !== "granted") return
  const current = await subscribeWithKey(
    registration,
    keyBytes(await api.publicKey()),
  )
  await api.save(toPayload(current))
}

/** Явний вихід: лише браузер, сервер прибере запис за відповіддю 410 служби. */
export async function forgetDevicePush(): Promise<void> {
  const registration = await pushRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (registration && subscription)
    await dropSubscription(registration, subscription)
}
