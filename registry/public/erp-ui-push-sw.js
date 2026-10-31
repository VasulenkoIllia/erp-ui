/*
 * erp-ui: фоновий файл web push (ADR-0046, PF19). Лежить у public/ проекту, не правте: оновлюється з
 * кітом. Контракт — lib/web-push, реєстрація — lib/push-device (область /erp-ui-push/, не заважає
 * MSW і PWA).
 *
 * Кілька вкладок дають одне сповіщення: його показує цей файл, а не вкладка. Показуємо завжди, навіть
 * коли застосунок відкрито: Safari скасовує підписку, якщо push нічого не показав.
 */
const RECEIVED_MESSAGE = "erp-ui:push-received"
const OPEN_MESSAGE = "erp-ui:push-open"

/** `/#` для застосунку з адресами в хеші. Інше значення відкидаємо: параметр не має вести назовні. */
const linkBase =
  new URL(self.location.href).searchParams.get("linkBase") === "/#" ? "/#" : ""

/**
 * Шлях цього застосунку або `null`. Розбираємо, а не шукаємо в рядку: браузер вирізає табуляцію й
 * перенос, тож `/\t/хост` стає `//хост`. Те саме робить `safeRedirectPath` у вкладці.
 */
function appPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return null
  try {
    const url = new URL(value, self.location.origin)
    const path = `${url.pathname}${url.search}${url.hash}`
    return url.origin === self.location.origin && !path.startsWith("//")
      ? path
      : null
  } catch {
    return null
  }
}

/** Сервер може надіслати `null`, а браузер показав би його словом «null». */
const text = (value) => (typeof value === "string" && value ? value : undefined)

function readPayload(data) {
  try {
    return data?.json() ?? {}
  } catch {
    return {}
  }
}

function appWindows() {
  // Сторінки не входять в область файла, тому `includeUncontrolled`.
  return self.clients.matchAll({ type: "window", includeUncontrolled: true })
}

async function showPush(data) {
  const { id, title, body, link, icon } = readPayload(data)
  try {
    // Без заголовка однаково щось показуємо: інакше браузер вважає push порожнім.
    await self.registration.showNotification(
      text(title) ?? self.location.hostname,
      {
        body: text(body),
        icon: appPath(icon) ?? undefined,
        tag: text(id),
        data: { id: text(id), link: appPath(link) },
      },
    )
  } finally {
    const windows = await appWindows()
    windows.forEach((client) => {
      client.postMessage({ type: RECEIVED_MESSAGE })
    })
  }
}

async function openNotification({ id, link }) {
  const windows = await appWindows()
  const target = windows.find((client) => client.focused) ?? windows[0]
  if (target) {
    // Браузер може не дати фокус, але перейти вкладка однаково має.
    await target.focus().catch(() => undefined)
    // Вкладка переходить сама: `client.navigate` не діє на сторінки поза областю файла.
    target.postMessage({ type: OPEN_MESSAGE, id, link })
    return
  }
  await self.clients.openWindow(`${linkBase}${link ?? "/"}`)
}

self.addEventListener("install", () => {
  void self.skipWaiting()
})

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event.data))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(openNotification(event.notification.data ?? {}))
})

// Браузер оновив підписку сам. Сесії тут немає, тож сервер дізнається під час наступного запуску.
// Без `oldSubscription` (Firefox, Safari) запуск застосунку підпише пристрій заново.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription?.options
  if (options) event.waitUntil(self.registration.pushManager.subscribe(options))
})
