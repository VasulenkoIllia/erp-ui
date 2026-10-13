/**
 * Вхід і профіль (ADR-0003, PF01): httpOnly cookie-сесія + 2FA застосунком (TOTP).
 *
 * Контракт:
 * - `POST /auth/login` { email, password } → { status: "authenticated" | "two_factor_required" }.
 *   Сервер ставить cookie сесії (для 2FA — тимчасової, лише для кроку коду).
 * - `POST /auth/2fa` { code } → { status: "authenticated" }; хибний код — 422 з `fieldErrors.code`.
 * - `POST /auth/logout` → 204.
 * - `GET /me` → профіль, ролі, ефективні права, компанії; без сесії — 401.
 * Токенів у JS немає: їх неможливо вкрасти через XSS, а сесію сервер відкликає одним рядком.
 *
 * Права — рядки `<ресурс>:<дія>` ("invoices:approve"), `*` — будь-що. Перевірка на клієнті лише
 * ховає й вимикає дії; сервер (і MSW-моки) перевіряють ті самі права самі.
 */
import type { AuthProvider } from "ra-core"
import { z } from "zod"

import { ApiError, isApiError, type ApiClient } from "@/registry/lib/api"

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const twoFactorRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
})

export const loginResultSchema = z.object({
  status: z.enum(["authenticated", "two_factor_required"]),
})

export const companyRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
})

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().optional(),
  roles: z.array(z.string()),
  /** Ефективні права з усіх ролей: "invoices:read", "invoices:*", "*". */
  permissions: z.array(z.string()),
  companies: z.array(companyRefSchema),
  /** Компанія за замовчуванням для `X-Company-Id`. */
  companyId: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
})
export type Me = z.infer<typeof meSchema>

/** Ключ кешу профілю в TanStack Query (hooks/use-me); `onMe` провайдера оновлює його. */
export const ME_QUERY_KEY = ["erp-ui", "me"] as const

/** Дії ra-core (`useCanAccess`, вбудовані контролери) → дії прав erp-ui. */
const RA_ACTIONS: Record<string, string> = {
  list: "read",
  show: "read",
  export: "read",
  edit: "update",
}

/**
 * Чи дозволяє набір прав дію: точний збіг, `<ресурс>:*` або `*`.
 * Дії ra-core (`list`, `show`, `edit`) зводяться до `read` і `update`.
 */
export function hasPermission(
  permissions: readonly string[],
  resource: string,
  action: string,
): boolean {
  const normalized = RA_ACTIONS[action] ?? action
  return permissions.some(
    (p) =>
      p === "*" || p === `${resource}:*` || p === `${resource}:${normalized}`,
  )
}

/** Помилка входу, після якої UI просить код 2FA. */
export function isTwoFactorRequired(error: unknown): boolean {
  return isApiError(error) && error.code === "two_factor_required"
}

export interface ErpAuthProvider extends AuthProvider {
  /** Профіль поточного користувача (кешується до виходу чи нового входу). */
  getMe: () => Promise<Me>
}

export function createAuthProvider(
  client: ApiClient,
  { onMe }: { onMe?: (me: Me | null) => void } = {},
): ErpAuthProvider {
  let me: Promise<Me> | null = null

  const loadMe = () => {
    me ??= client.get("/me", { schema: meSchema }).then(
      (profile) => {
        onMe?.(profile)
        return profile
      },
      (error: unknown) => {
        me = null
        throw error
      },
    )
    return me
  }

  return {
    getMe: loadMe,

    async login(params: { email?: string; password?: string; code?: string }) {
      me = null
      if (params.code) {
        await client.post(
          "/auth/2fa",
          { code: params.code },
          { schema: loginResultSchema },
        )
      } else {
        const result = await client.post(
          "/auth/login",
          { email: params.email, password: params.password },
          { schema: loginResultSchema },
        )
        if (result.status === "two_factor_required") {
          throw new ApiError(401, {
            code: "two_factor_required",
            message: "Two-factor code required",
          })
        }
      }
      await loadMe()
    },

    async logout() {
      me = null
      onMe?.(null)
      try {
        await client.post("/auth/logout")
      } catch {
        // Сесія могла вже закінчитися — вихід однаково успішний.
      }
    },

    async checkAuth() {
      await loadMe()
    },

    checkError(error: unknown) {
      // 403 — це «немає прав» на конкретну дію, а не кінець сесії.
      if (isApiError(error) && error.status === 401) {
        me = null
        return Promise.reject(error)
      }
      return Promise.resolve()
    },

    async getIdentity() {
      const profile = await loadMe()
      return {
        id: profile.id,
        fullName: profile.name,
        avatar: profile.avatarUrl,
      }
    },

    async getPermissions() {
      return (await loadMe()).permissions
    },

    async canAccess({
      resource,
      action,
    }: {
      resource: string
      action: string
    }) {
      return hasPermission((await loadMe()).permissions, resource, action)
    },
  }
}
