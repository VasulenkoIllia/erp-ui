/**
 * Перевірка запрошення з листа (ADR-0014, ADR-0032): `POST /auth/invite/check` { token } — токен у
 * тілі, тож його немає в адресі запиту, журналах сервера й проксі.
 *
 * Сервер без цього маршруту (404, 405) — ще на контракті до A2b2a: тоді старий
 * `GET /auth/invite?token=` (застарілий, прибрати в 2.0) і одне попередження в консолі для
 * розробника проекту. Спосіб запам'ятовує кожна перевірка, створена `inviteChecker`: після відповіді
 * самого маршруту (успіх, 410, 422) запасного шляху більше немає, після вдалого `GET` — одразу `GET`.
 * За контрактом невідомий, використаний чи прострочений токен — 410 `token_expired`, а не 404:
 * інакше перша перевірка повторить токен у `GET`.
 */
import { z } from "zod"

import { isApiError, type ApiClient } from "@/registry/lib/api"

/**
 * Хто відкрив запрошення (ADR-0040): `new` — адреса без облікового запису, ім'я й пароль; `existing`
 * — запис є, людина не ввійшла; `current` — увійшла цим записом; `other` — увійшла іншим.
 */
export const INVITE_ACCOUNTS = ["new", "existing", "current", "other"] as const
export type InviteAccount = (typeof INVITE_ACCOUNTS)[number]

export const inviteSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  companyName: z.string(),
  invitedBy: z.string().optional(),
  /** Немає поля (сервер до ADR-0040) чи значення новішого сервера — `new`. */
  account: z.enum(INVITE_ACCOUNTS).optional().catch(undefined),
})
export type Invite = z.infer<typeof inviteSchema>

/** Маршруту немає: бекенд ще не знає `POST /auth/invite/check`. */
function isMissingRoute(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 405)
}

/** Відповідь самого маршруту, а не мережі, шлюзу чи збою: токен прострочений чи невалідний. */
function answeredByRoute(error: unknown): boolean {
  return isApiError(error) && (error.status === 410 || error.status === 422)
}

export function inviteChecker<T>(
  client: ApiClient,
  schema: z.ZodType<T>,
): (token: string) => Promise<T> {
  let method: "post" | "legacy" | null = null
  let warned = false
  const legacyCheck = (token: string) =>
    client.get("/auth/invite", { query: { token }, schema })

  return async (token) => {
    if (method === "legacy") return legacyCheck(token)
    try {
      const invite = await client.post(
        "/auth/invite/check",
        { token },
        { schema },
      )
      method = "post"
      return invite
    } catch (error) {
      if (method === "post" || !isMissingRoute(error)) {
        if (answeredByRoute(error)) method = "post"
        throw error
      }
      // До запиту: токен іде в адресу, навіть якщо `GET` відмовить (прострочений).
      if (!warned)
        console.warn(
          "erp-ui: POST /auth/invite/check is missing on the server; using the deprecated GET /auth/invite?token= (removed in erp-ui 2.0, ADR-0032)",
        )
      warned = true
      const invite = await legacyCheck(token)
      method = "legacy"
      return invite
    }
  }
}
