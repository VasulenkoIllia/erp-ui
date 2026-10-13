/**
 * Запрошення колег (ADR-0014, PF01/A2): адміністратор запрошує за email із ролями; людина приймає
 * запрошення на екрані `AcceptInviteScreen` (ADR-0010) і задає ім'я та пароль.
 *
 * Контракт (під `/api/v1`, право `users:create`):
 * - `GET /invitations` → запрошення, що чекають (і прострочені), новіші першими;
 * - `POST /invitations` { email, name?, roles, message? } → запрошення; лист із посиланням
 *   `…/login/invite?token=…`, діє 7 днів. Помилки — 422 `fieldErrors`: `email`: `required` /
 *   `invalid` / `taken` (уже в компанії) / `invited` (уже запрошено), `roles`: `required`;
 * - `POST /invitations/:id/resend` → запрошення з новим терміном; частіше ніж раз на хвилину —
 *   429 `rate_limited`;
 * - `DELETE /invitations/:id` → 204: посилання більше не діє (410 на екрані прийняття).
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
