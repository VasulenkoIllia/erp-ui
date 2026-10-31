/**
 * Web push: контракт підписки пристрою (ADR-0046, PF19). Браузерна частина — `lib/push-device`.
 *
 * Контракт (під `/api/v1`, для користувача, що увійшов):
 * - `GET /me/push/public-key` → { publicKey } — відкритий ключ VAPID (base64url), закритий лише на
 *   сервері. Ключ приходить запитом, а не під час збірки: заміна ключа не потребує нової збірки.
 * - `POST /me/push/subscriptions` { endpoint, expirationTime, keys: { p256dh, auth } } → 204.
 *   Ключ запису — `endpoint`: повтор тієї самої адреси оновлює запис, а не дублює його. Клієнт
 *   надсилає його після ввімкнення й під час кожного запуску застосунку. Мову сповіщень сервер
 *   бере з `Accept-Language` цього запиту.
 * - `POST /me/push/subscriptions/remove` { endpoint } → 204, зокрема для невідомої адреси. Адреса в
 *   тілі, а не в шляху: це секрет пристрою, йому не місце в журналах запитів.
 * - `POST /me/push/test` { endpoint } → 204: перевірочний push на цей пристрій, в інбокс не йде,
 *   зі своїм `id` щоразу: інакше браузер тихо замінить попередній. Невідома адреса — 404.
 * - Під «Увійти як…» запис у `/me/push/*` — 403 `impersonation_forbidden`: пристрій адміністратора
 *   не стає пристроєм іншої людини.
 * - Немає адрес push: `GET /me/push/public-key` → 404, блоку push у налаштуваннях тоді немає.
 *
 * Що надсилає сервер (RFC 8291, шифрування `aes128gcm`, до 4 КБ): JSON
 * { id, title, body?, link?, icon? } мовою підписки. `id` — сповіщення центру, той самий `id` не
 * показується двічі; `link` — шлях застосунку, як в інбоксі.
 *
 * Повтори й термін — на сервері: `TTL` за подією; 404 і 410 від служби браузера — підписку
 * видалити (клієнт так само скасовує її під час явного виходу); 429 і 5xx — повтор із `Retry-After`.
 * Тихі години й вибір каналів сервер перевіряє перед надсиланням (`lib/notification-settings`).
 *
 * `endpoint` приходить від браузера, а сервер іде за ним сам, тому адреси лише служб браузера.
 * Обов'язкові перевірки (адреса, власник запису, ліміти, ключі VAPID): модуль N5, README,
 * «Що перевіряє сервер».
 */
import { z } from "zod"

import type { ApiClient } from "@/registry/lib/api"

const publicKeySchema = z.object({ publicKey: z.string().min(1) })

/** Підписка пристрою, як її описує `PushSubscription.toJSON()`. */
export interface DevicePushSubscription {
  endpoint: string
  expirationTime: number | null
  keys: { p256dh: string; auth: string }
}

export interface PushApi {
  publicKey: () => Promise<string>
  save: (subscription: DevicePushSubscription) => Promise<void>
  remove: (endpoint: string) => Promise<void>
  sendTest: (endpoint: string) => Promise<void>
}

export function createPushApi(client: ApiClient): PushApi {
  return {
    async publicKey() {
      const { publicKey } = await client.get("/me/push/public-key", {
        schema: publicKeySchema,
      })
      return publicKey
    },
    async save(subscription) {
      await client.post("/me/push/subscriptions", subscription)
    },
    async remove(endpoint) {
      await client.post("/me/push/subscriptions/remove", { endpoint })
    },
    async sendTest(endpoint) {
      await client.post("/me/push/test", { endpoint })
    },
  }
}
