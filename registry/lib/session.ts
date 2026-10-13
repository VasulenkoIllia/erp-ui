/**
 * Стан сесії в браузері (ADR-0010): коли вона закінчиться, остання активність користувача
 * і події входу/виходу між вкладками.
 *
 * - Термін сесії сервер повідомляє заголовком `X-Session-Expires-At` (ISO) на кожній відповіді
 *   (lib/api передає його сюди) і полем `sessionExpiresAt` у `/me`. Сесія ковзна: будь-який запит
 *   її продовжує.
 * - Активність (клавіатура, вказівник, прокрутка) записується в localStorage — так бездіяльність
 *   рахується по всіх вкладках разом, а не окремо.
 * - Вихід в одній вкладці виходить у всіх (BroadcastChannel); вхід — оновлює профіль в інших.
 */

export const SESSION_EXPIRES_HEADER = "X-Session-Expires-At"

type Listener = () => void

/* ---------------------------------- Термін ---------------------------------- */

let expiresAt: string | null = null
const expiryListeners = new Set<Listener>()

export function getSessionExpiresAt(): string | null {
  return expiresAt
}

export function setSessionExpiresAt(value: string | null): void {
  if (value === expiresAt) return
  expiresAt = value
  expiryListeners.forEach((listener) => {
    listener()
  })
}

export function subscribeSessionExpiry(listener: Listener): () => void {
  expiryListeners.add(listener)
  return () => {
    expiryListeners.delete(listener)
  }
}

/* -------------------------------- Активність -------------------------------- */

const ACTIVITY_KEY = "erp-ui:last-activity"
/** Частіше не записуємо: рух миші не має щосекунди писати в сховище. */
const ACTIVITY_THROTTLE_MS = 5_000
let lastWrite = 0

export function lastActivity(): number {
  try {
    const stored = Number(globalThis.localStorage?.getItem(ACTIVITY_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : Date.now()
  } catch {
    return Date.now()
  }
}

export function markActivity(now = Date.now()): void {
  if (now - lastWrite < ACTIVITY_THROTTLE_MS) return
  lastWrite = now
  try {
    globalThis.localStorage?.setItem(ACTIVITY_KEY, String(now))
  } catch {
    // Без сховища бездіяльність рахується лише в цій вкладці — через lastWrite.
  }
}

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const

/** Стежить за активністю в цьому вікні. Повертає функцію зупинки. */
export function trackActivity(target: Window = window): () => void {
  const onActivity = () => {
    markActivity()
  }
  markActivity(Date.now() + ACTIVITY_THROTTLE_MS)
  for (const event of ACTIVITY_EVENTS)
    target.addEventListener(event, onActivity, { passive: true })
  return () => {
    for (const event of ACTIVITY_EVENTS)
      target.removeEventListener(event, onActivity)
  }
}

/* ------------------------------ Між вкладками ------------------------------ */

export type AuthEvent = { type: "login" } | { type: "logout" }

const CHANNEL = "erp-ui:auth"
let channel: BroadcastChannel | null | undefined

function getChannel(): BroadcastChannel | null {
  if (channel === undefined)
    channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(CHANNEL)
  return channel
}

/** Повідомити інші вкладки (у своїй вкладці подія не приходить). */
export function broadcastAuthEvent(event: AuthEvent): void {
  getChannel()?.postMessage(event)
}

export function subscribeAuthEvents(
  listener: (event: AuthEvent) => void,
): () => void {
  const ch = getChannel()
  if (!ch) return () => undefined
  const onMessage = (message: MessageEvent<AuthEvent>) => {
    listener(message.data)
  }
  ch.addEventListener("message", onMessage)
  return () => {
    ch.removeEventListener("message", onMessage)
  }
}
