/**
 * Запрошення колег (ADR-0014, PF01/A2): адміністратор запрошує за email із ролями; людина приймає
 * запрошення на екрані `AcceptInviteScreen` (ADR-0010) і задає ім'я та пароль.
 *
 * Контракт (під `/api/v1`, право `users:create` у компанії запиту, ADR-0033 і ADR-0035):
 * - `GET /invitations` → запрошення компанії запиту, що чекають (і прострочені), новіші першими;
 * - `POST /invitations` { email, name?, roles, message? } → запрошення; лист із посиланням
 *   `…/login/invite?token=…`, діє 7 днів. Токен — не менше 256 біт випадковості, сервер зберігає
 *   лише його хеш. Помилки — 422 `fieldErrors`: `email`: `required` / `invalid` / `taken` (людина вже
 *   в цій компанії) / `invited` (уже запрошено в цю компанію), `roles`: `required` / `invalid` (ролі
 *   немає в компанії); ролі з правами понад свої — 403 («стеля», ADR-0032); усе гаразд, а пароль не
 *   підтверджено — 403 `reauth_required`. Адреса з іншої компанії запрошується, як нова: відповідь не
 *   каже, чи є вона в застосунку (ADR-0040);
 * - `POST /invitations/:id/resend` → запрошення з новим терміном; автором стає той, хто повторив
 *   (його права перевіряться при прийнятті). Порядок відмов: чуже чи невідоме — 404, ролі
 *   понад свої права — 403, роль зникла з компанії — 422 `roles: invalid`, змінив інший — 409,
 *   частіше ніж раз на хвилину — 429 `rate_limited`, пароль не підтверджено — 403 `reauth_required`;
 * - `DELETE /invitations/:id` → 204: посилання більше не діє (410 на екрані прийняття); ролі понад
 *   свої права — 403, змінив інший — 409;
 * - під «Увійти як…» — лише `GET`, решта — 403 `impersonation_forbidden`;
 * - перевірка й прийняття (`POST /auth/invite/check`, `POST /auth/invite/accept`) — 410
 *   `token_expired`, коли термін минув або той, хто запросив, уже не може дати ці ролі в компанії
 *   запрошення (заблокований, не працює там, без `users:create` чи з меншими правами), або людина
 *   вже в цій компанії. Перевірка каже, хто відкрив посилання (`account`, `lib/invite-check`); адреса
 *   з обліковим записом приймає лише сесією цього запису, `{ token }` без імені й пароля, відповідь
 *   має `companyId`; гість чи інший запис — 409 `conflict`, під «Увійти як…» — 403 (ADR-0040).
 */
import { z } from "zod"

import type { ApiClient } from "@/registry/lib/api"

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  roles: z.array(z.string()),
  invitedBy: z.string(),
  createdAt: z.string(),
  lastSentAt: z.string(),
  expiresAt: z.string(),
  /** expired — термін минув: надіслати ще раз або відкликати. */
  status: z.enum(["pending", "expired"]),
})
export type Invitation = z.infer<typeof invitationSchema>

export interface InvitationInput {
  email: string
  name?: string
  roles: string[]
  /** Кілька слів від адміністратора в листі. */
  message?: string
}

export interface InvitationsApi {
  list: () => Promise<Invitation[]>
  create: (input: InvitationInput) => Promise<Invitation>
  resend: (id: string) => Promise<Invitation>
  revoke: (id: string) => Promise<void>
}

const encoded = (id: string) => encodeURIComponent(id)

export function createInvitationsApi(client: ApiClient): InvitationsApi {
  return {
    list: () =>
      client.get("/invitations", { schema: z.array(invitationSchema) }),
    create: (input) =>
      client.post("/invitations", input, { schema: invitationSchema }),
    resend: (id) =>
      client.post(`/invitations/${encoded(id)}/resend`, undefined, {
        schema: invitationSchema,
      }),
    async revoke(id) {
      await client.delete(`/invitations/${encoded(id)}`)
    },
  }
}

export const INVITATION_QUERY_KEYS = {
  list: ["erp-ui", "invitations"],
} as const

/** Термін дії запрошення, днів. */
export const INVITATION_DAYS = 7
