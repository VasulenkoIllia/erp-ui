/**
 * Мок акаунта (ADR-0011, ADR-0012): фактори з налаштуванням, резервні коди, сесії, довірені
 * пристрої, журнал входів, листи про новий вхід, «Увійти як…», профіль і фото, токени API.
 *
 * - Стан кожного користувача живе в localStorage (`erp-ui:mock-account:<id>`), як дані сервера:
 *   переживає перезавантаження демо. Початковий — з `MockUser.factors` і `seeds`.
 * - Місця входу й назви пристроїв мок перекладає за `Accept-Language`, як справжній сервер.
 * - Код застосунку, SMS і email під час налаштування — `sentCode`.
 * - Частини: стан і журнал входів — `lib/mock-account-state`, фактори й резервні коди —
 *   `lib/mock-factors`, «Увійти як…» — `lib/mock-impersonation`; тут — функції для моків входу й
 *   адміністрування, сесії, довірені пристрої, профіль і токени API. Старі імпорти з цього файлу
 *   працюють.
 */
import { http, type HttpHandler } from "msw/http"

import {
  API_TOKEN_EXPIRY_DAYS,
  SETUP_FACTORS,
  type ApiToken,
  type SetupFactor,
  type TrustedDevice,
} from "@/registry/lib/account"
import { API_PREFIX } from "@/registry/lib/api"
import { recordAudit } from "@/registry/lib/mock-audit"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import {
  AUTH_FACTORS,
  localizedText,
  type AuthFactor,
  type LocalizedText,
  type Me,
} from "@/registry/lib/auth"
import {
  accountChangeGuard,
  actorOf,
  languageOf,
  loadState,
  localize,
  mockUserSessions,
  NAME_MAX,
  notFound,
  recordSignIn,
  setMockAccountSeeds,
  update,
  validation,
  type AccountMockOptions,
  type MockAccountSeed,
  type MockApiToken,
  type MockSessionSeed,
  type MockSignInSeed,
  type MockTrustedDeviceSeed,
} from "@/registry/lib/mock-account-state"
import { createFactorHandlers } from "@/registry/lib/mock-factors"
import { createImpersonationHandlers } from "@/registry/lib/mock-impersonation"
import {
  CURRENT_IP,
  CURRENT_LOCATION,
  currentDevice,
  currentMockUser,
  getMockSession,
  impersonationForbidden,
  json,
  noContent,
  randomToken,
  unauthenticated,
  writeMockSession,
  type MockUser,
} from "@/registry/lib/mock-server"
import { ownedByMockCompany, withoutMockScope } from "@/registry/lib/mock-scope"
import { permissionScope } from "@/registry/lib/roles"

// erp-ui: окремі import + export, бо shadcn CLI хибно переписує шляхи в `export … from`.
export { CURRENT_IP, mockUserSessions, recordSignIn, setMockAccountSeeds }
export type {
  AccountMockOptions,
  MockAccountSeed,
  MockSessionSeed,
  MockSignInSeed,
  MockTrustedDeviceSeed,
}

/* ------------------------- Для мока входу (mock-auth) ------------------------- */

/** Увімкнені фактори в порядку контракту; резервні коди — поки лишились. */
export function mockFactorTypes(user: MockUser): AuthFactor[] {
  const state = loadState(user)
  const types = new Set<AuthFactor>(state.factors.map((f) => f.type))
  if (types.size && state.backupCodes?.length) types.add("backup_code")
  return AUTH_FACTORS.filter((f) => types.has(f))
}

/** Перевірити й погасити резервний код. */
export function consumeBackupCode(user: MockUser, code: string): boolean {
  const normalized = code.toLowerCase()
  const state = loadState(user)
  if (!state.backupCodes?.includes(normalized)) return false
  update(user, (s) => {
    s.backupCodes = s.backupCodes?.filter((c) => c !== normalized) ?? null
  })
  return true
}

export function isTrustedHere(user: MockUser): boolean {
  return (loadState(user).trustedHere?.until ?? 0) > Date.now()
}

export function trustHere(user: MockUser, days: number): void {
  update(user, (s) => {
    s.trustedHere = { since: Date.now(), until: Date.now() + days * 86_400_000 }
  })
}

/**
 * Новий пароль: сам пароль, дата зміни й історія для правила «не повторювати». Стан читається
 * до заміни пароля, тож у історії лишається й попередній.
 */
export function passwordChanged(user: MockUser, password: string): void {
  update(user, (s) => {
    s.passwordChangedAt = new Date().toISOString()
    s.passwordHistory = [password, ...s.passwordHistory].slice(0, 24)
  })
  user.password = password
  recordAudit({
    action: "auth.password_changed",
    category: "auth",
    accountId: user.id,
    actor: actorOf(user),
  })
}

/** Чи був пароль серед `count` останніх. */
export function passwordReused(
  user: MockUser,
  password: string,
  count: number,
): boolean {
  return (
    count > 0 &&
    loadState(user).passwordHistory.slice(0, count).includes(password)
  )
}

/** Коли востаннє змінено пароль (мс). */
export function passwordChangedAt(user: MockUser): number | null {
  const at = loadState(user).passwordChangedAt
  return at ? Date.parse(at) : null
}

/** Профіль поверх даних користувача — для `GET /me`. */
export function mockProfile(user: MockUser): Partial<Me> {
  const { avatarUrl, ...profile } = loadState(user).profile
  return {
    ...Object.fromEntries(
      Object.entries(profile).filter(([, value]) => value !== ""),
    ),
    ...(avatarUrl === null
      ? { avatarUrl: undefined }
      : avatarUrl
        ? { avatarUrl }
        : {}),
  }
}

/**
 * Адміністратор скинув другий крок: фактори, резервні коди, довірені пристрої й інші сесії
 * зникають — наступний вхід лише паролем (або налаштування, якщо політика вимагає).
 */
export function resetMockFactors(user: MockUser): void {
  update(user, (s) => {
    s.factors = []
    s.backupCodes = null
    s.trustedDevices = []
    delete s.trustedHere
    s.sessions = []
  })
}

/* --------------------------- Для адміністратора --------------------------- */

/** Заблоковано адміністратором: хто, коли, чому; null — активний. */
export function mockBlocked(
  user: MockUser,
): { at: string; by: string; reason: string } | null {
  return loadState(user).blocked ?? null
}

/** Заблокувати (сесії завершуються) або розблокувати (`null`). */
export function setMockBlocked(
  user: MockUser,
  value: { by: string; reason: string } | null,
): void {
  update(user, (s) => {
    if (value) {
      s.blocked = { at: new Date().toISOString(), ...value }
      s.sessions = []
      delete s.trustedHere
    } else delete s.blocked
  })
}

/** Людину вилучено з компанії (ADR-0041): її токени API там перестають діяти, в інших лишаються. */
export function revokeMockCompanyTokens(
  user: MockUser,
  companyId: string,
): void {
  update(user, (s) => {
    s.apiTokens = s.apiTokens.filter((token) => token.companyId !== companyId)
  })
}

/** Чи є в користувача сесія з таким `id` на іншому пристрої. */
export const hasMockUserSession = (user: MockUser, sessionId: string) =>
  loadState(user).sessions.some((s) => s.id === sessionId)

/** Завершити сесію іншого пристрою користувача; false — такої немає. */
export function endMockUserSession(user: MockUser, sessionId: string): boolean {
  if (!hasMockUserSession(user, sessionId)) return false
  update(user, (s) => {
    s.sessions = s.sessions.filter((item) => item.id !== sessionId)
  })
  return true
}

/** Завершити всі сесії користувача на інших пристроях. */
export function endAllMockUserSessions(user: MockUser): void {
  update(user, (s) => {
    s.sessions = []
  })
}

/** Налаштовані способи другого кроку й останній успішний вхід. */
export function mockAccessSummary(user: MockUser): {
  factors: SetupFactor[]
  lastSignInAt: string | null
} {
  const state = loadState(user)
  return {
    factors: [...new Set(state.factors.map((f) => f.type))],
    lastSignInAt: state.signIns.find((e) => e.result === "success")?.at ?? null,
  }
}

/* --------------------------------- Обробники --------------------------------- */

/** Фото профілю після обрізання — кілька десятків КБ; більше — щось пішло не так. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

const TOKEN_ACTIONS: { action: string; label: LocalizedText }[] = [
  { action: "read", label: { uk: "Перегляд", en: "Read" } },
  { action: "create", label: { uk: "Створення", en: "Create" } },
  { action: "update", label: { uk: "Зміна", en: "Update" } },
  { action: "delete", label: { uk: "Видалення", en: "Delete" } },
]
/** Позначка дії токена лише над своїми записами власника. */
const OWN_TOKEN_SCOPE: LocalizedText = { uk: "лише свої", en: "own only" }

/** Токен без секрету — те, що бачить список. */
const publicToken = (token: MockApiToken): ApiToken => {
  const { secret, ...item } = withoutMockScope(token)
  void secret
  return item
}

/** Токени компанії запиту (ADR-0036): токен діє лише там, де його створили. */
const tokenIn =
  (user: MockUser, companyId: string | null) => (token: MockApiToken) =>
    ownedByMockCompany(user, token.companyId, companyId)

export function createAccountHandlers({
  baseUrl = API_PREFIX,
  sentCode = "123456",
  available = () => [...SETUP_FACTORS],
  twoFactorRequired = () => false,
  issuer: issuerOf,
  reauthRequired,
  apiResources = {},
}: AccountMockOptions): HttpHandler[] {
  const issuer = () => issuerOf?.() ?? "erp-ui"
  const guardChange = () => accountChangeGuard(reauthRequired)

  /**
   * Права для токенів: з прав користувача в компанії запиту (A2c1), лише відомі ресурси
   * (`apiResources`).
   */
  const tokenScopes = (permissions: readonly string[], language: string) =>
    Object.entries(apiResources).flatMap(([resource, label]) =>
      // Токен не ширший за людину: на «Свої» — лише записи, де вона відповідальна (ADR-0039).
      TOKEN_ACTIONS.flatMap(({ action, label: actionLabel }) => {
        const scope = permissionScope(permissions, resource, action)
        if (!scope) return []
        const group = localizedText(label, language) ?? resource
        const name = localizedText(actionLabel, language) ?? action
        return scope === "all"
          ? [{ id: `${resource}:${action}`, label: name, group }]
          : [
              {
                id: `${resource}:${action}:own`,
                label: `${name} (${localizedText(OWN_TOKEN_SCOPE, language) ?? ""})`,
                group,
              },
            ]
      }),
    )

  return [
    ...createFactorHandlers({
      baseUrl,
      sentCode,
      available,
      twoFactorRequired,
      issuer,
      reauthRequired,
    }),

    http.get(`${baseUrl}/me/sessions`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      return json(mockUserSessions(user, languageOf(request)))
    }),

    http.delete(`${baseUrl}/me/sessions/:id`, ({ params }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const forbidden = impersonationForbidden()
      if (forbidden) return forbidden
      const session = getMockSession()
      if (params.id === session?.id) {
        writeMockSession(null)
        return noContent()
      }
      if (!loadState(user).sessions.some((s) => s.id === params.id))
        return notFound()
      update(user, (s) => {
        s.sessions = s.sessions.filter((item) => item.id !== params.id)
      })
      return noContent()
    }),

    http.delete(`${baseUrl}/me/sessions`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const forbidden = impersonationForbidden()
      if (forbidden) return forbidden
      update(user, (s) => {
        s.sessions = []
      })
      return noContent()
    }),

    http.get(`${baseUrl}/me/trusted-devices`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const state = loadState(user)
      const language = languageOf(request)
      const here = state.trustedHere
      const list: TrustedDevice[] = [
        ...(here && here.until > Date.now()
          ? [
              {
                id: "this-device",
                current: true,
                device: currentDevice(),
                location: localizedText(CURRENT_LOCATION, language),
                createdAt: new Date(here.since).toISOString(),
                expiresAt: new Date(here.until).toISOString(),
              },
            ]
          : []),
        ...state.trustedDevices.map((d) => ({
          ...localize(d, language),
          current: false,
        })),
      ]
      return json(list)
    }),

    http.delete(`${baseUrl}/me/trusted-devices/:id`, ({ params }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const forbidden = impersonationForbidden()
      if (forbidden) return forbidden
      const state = loadState(user)
      const here = params.id === "this-device" && state.trustedHere
      if (!here && !state.trustedDevices.some((d) => d.id === params.id))
        return notFound()
      update(user, (s) => {
        if (here) delete s.trustedHere
        else
          s.trustedDevices = s.trustedDevices.filter((d) => d.id !== params.id)
      })
      return noContent()
    }),

    http.delete(`${baseUrl}/me/trusted-devices`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const forbidden = impersonationForbidden()
      if (forbidden) return forbidden
      update(user, (s) => {
        s.trustedDevices = []
        delete s.trustedHere
      })
      return noContent()
    }),

    http.get(`${baseUrl}/me/sign-ins`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const url = new URL(request.url)
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
      const perPage = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("perPage")) || 20),
      )
      const all = loadState(user).signIns
      const language = languageOf(request)
      return json({
        data: all
          .slice((page - 1) * perPage, page * perPage)
          .map((event) => localize(event, language)),
        total: all.length,
      })
    }),

    /* ------------------------------- Профіль ------------------------------- */

    http.patch(`${baseUrl}/me`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const body = (await request.json()) as Record<string, unknown>
      const text = (key: string) =>
        typeof body[key] === "string" ? body[key].trim() : undefined
      const fields: Record<string, string> = {}
      const name = text("name")
      if (name !== undefined && !name) fields.name = "required"
      for (const [key, max] of [
        ["name", 100],
        ["position", 100],
        ["signature", 1000],
      ] as const)
        if ((text(key)?.length ?? 0) > max) fields[key] = "tooLong"
      const phone = text("phone")
      if (phone && phone.replace(/\D/g, "").length < 10)
        fields.phone = "invalid"
      const timezone = text("timezone")
      if (timezone)
        try {
          new Intl.DateTimeFormat("en", { timeZone: timezone })
        } catch {
          fields.timezone = "invalid"
        }
      if (Object.keys(fields).length) return validation(fields)
      update(user, (s) => {
        for (const key of [
          "name",
          "position",
          "phone",
          "timezone",
          "signature",
        ] as const) {
          const value = text(key)
          if (value !== undefined) s.profile[key] = value
        }
      })
      return noContent()
    }),

    http.put(`${baseUrl}/me/avatar`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const file = (await request.formData()).get("file")
      // Не `instanceof Blob`: у тестах (jsdom) файл приходить з іншого «світу» JS.
      if (!file || typeof file === "string")
        return validation({ file: "required" })
      if (!file.type.startsWith("image/")) return validation({ file: "type" })
      if (file.size > AVATAR_MAX_BYTES) return validation({ file: "tooLarge" })
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ""
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const avatarUrl = `data:${file.type};base64,${btoa(binary)}`
      update(user, (s) => {
        s.profile.avatarUrl = avatarUrl
      })
      return json({ avatarUrl })
    }),

    http.delete(`${baseUrl}/me/avatar`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      update(user, (s) => {
        s.profile.avatarUrl = null
      })
      return noContent()
    }),

    /* ------------------------------ Токени API ------------------------------ */

    http.get(`${baseUrl}/me/api-tokens`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const access = mockRequestPermissions(request, user)
      if (access instanceof Response) return access
      return json({
        tokens: loadState(user)
          .apiTokens.filter(tokenIn(user, access.companyId))
          .map(publicToken),
        scopes: tokenScopes(access.permissions, languageOf(request)),
      })
    }),

    http.post(`${baseUrl}/me/api-tokens`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      // Компанія — до пароля: не просити підтвердження, щоб потім відмовити (ADR-0036).
      const access = mockRequestPermissions(request, user)
      if (access instanceof Response) return access
      const guard = guardChange()
      if (guard instanceof Response) return guard
      const body = (await request.json()) as {
        name?: string
        scopes?: string[]
        expiresInDays?: number | null
      }
      const fields: Record<string, string> = {}
      const name = body.name?.trim() ?? ""
      if (!name) fields.name = "required"
      else if (name.length > NAME_MAX) fields.name = "tooLong"
      const allowed = new Set(
        tokenScopes(access.permissions, "uk").map((scope) => scope.id),
      )
      const scopes = body.scopes ?? []
      if (!scopes.length) fields.scopes = "required"
      else if (scopes.some((scope) => !allowed.has(scope)))
        fields.scopes = "invalid"
      const days = body.expiresInDays ?? null
      if (!(API_TOKEN_EXPIRY_DAYS as readonly (number | null)[]).includes(days))
        fields.expiresInDays = "invalid"
      if (Object.keys(fields).length) return validation(fields)
      const secret = `erp_${randomToken()}${randomToken()}`
      const item: MockApiToken = {
        id: `tok-${randomToken().slice(0, 8)}`,
        name,
        prefix: `${secret.slice(0, 8)}…`,
        scopes,
        createdAt: new Date().toISOString(),
        expiresAt:
          days === null
            ? null
            : new Date(Date.now() + days * 86_400_000).toISOString(),
        lastUsedAt: null,
        secret,
        companyId: access.companyId,
      }
      update(guard, (s) => {
        s.apiTokens = [item, ...s.apiTokens]
      })
      recordAudit({
        action: "integrations.api_token_created",
        category: "integrations",
        companyId: access.companyId,
        actor: actorOf(guard),
        target: { type: "api_tokens", id: item.id, name: item.name },
        details: { scopes: scopes.join(", ") },
      })
      return json({ token: secret, item: publicToken(item) }, { status: 201 })
    }),

    http.delete(`${baseUrl}/me/api-tokens/:id`, ({ params, request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const forbidden = impersonationForbidden()
      if (forbidden) return forbidden
      const access = mockRequestPermissions(request, user)
      if (access instanceof Response) return access
      const revoked = loadState(user)
        .apiTokens.filter(tokenIn(user, access.companyId))
        .find((t) => t.id === params.id)
      if (!revoked) return notFound()
      update(user, (s) => {
        s.apiTokens = s.apiTokens.filter((t) => t.id !== params.id)
      })
      recordAudit({
        action: "integrations.api_token_revoked",
        category: "integrations",
        companyId: access.companyId,
        actor: actorOf(user),
        target: {
          type: "api_tokens",
          id: String(params.id),
          ...(revoked ? { name: revoked.name } : {}),
        },
      })
      return noContent()
    }),

    ...createImpersonationHandlers({ baseUrl, reauthRequired }),
  ]
}
