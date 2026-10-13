/**
 * Мок безпеки акаунта (ADR-0011): фактори з налаштуванням, резервні коди, сесії, довірені
 * пристрої, журнал входів, листи про новий вхід і «Увійти як…».
 *
 * - Стан кожного користувача живе в localStorage (`erp-ui:mock-account:<id>`), як дані сервера:
 *   переживає перезавантаження демо. Початковий — з `MockUser.factors` і `seeds`.
 * - Місця входу й назви пристроїв мок перекладає за `Accept-Language`, як справжній сервер.
 * - Код застосунку, SMS і email під час налаштування — `sentCode`.
 */
import { http, type HttpHandler } from "msw/http"

import {
  deviceFromUserAgent,
  SETUP_FACTORS,
  type AccountSession,
  type Device,
  type Factor,
  type SetupFactor,
  type SignInEvent,
  type SignInMethod,
  type TrustedDevice,
} from "@/registry/lib/account"
import { API_PREFIX } from "@/registry/lib/api"
import {
  AUTH_FACTORS,
  hasPermission,
  localizedText,
  type AuthFactor,
  type LocalizedText,
} from "@/registry/lib/auth"
import {
  currentMockUser,
  errorResponse,
  getMockSession,
  impersonationForbidden,
  json,
  maskEmail,
  maskPhone,
  mockUsersList,
  noContent,
  randomToken,
  sendMockMessage,
  unauthenticated,
  writeMockSession,
  type MockUser,
} from "@/registry/lib/mock-server"

/* ----------------------------------- Стан ----------------------------------- */

type Localized<T> = Omit<T, "location"> & { location?: LocalizedText }
export type MockSessionSeed = Localized<Omit<AccountSession, "current">>
export type MockTrustedDeviceSeed = Localized<Omit<TrustedDevice, "current">>
export type MockSignInSeed = Localized<SignInEvent>

/** Початкові дані акаунта: інші пристрої, журнал, назви факторів. */
export interface MockAccountSeed {
  /** Назви й дати факторів із `MockUser.factors`. */
  factors?: Partial<Record<SetupFactor, Partial<Omit<Factor, "type">>>>
  sessions?: MockSessionSeed[]
  trustedDevices?: MockTrustedDeviceSeed[]
  signIns?: MockSignInSeed[]
  passwordChangedAt?: string | null
  newSignInAlerts?: boolean
}

interface MockAccountState {
  factors: Factor[]
  backupCodes: string[] | null
  backupTotal: number
  newSignInAlerts: boolean
  passwordChangedAt: string | null
  sessions: MockSessionSeed[]
  trustedDevices: MockTrustedDeviceSeed[]
  signIns: MockSignInSeed[]
  /** Пристрої, з яких уже входили: перший вхід із нового — лист. */
  knownDevices: string[]
  /** Цей браузер — довірений пристрій (мс). */
  trustedHere?: { since: number; until: number }
}

const KEY = (userId: string) => `erp-ui:mock-account:${userId}`
const SEED_DATE = "2026-06-02T09:15:00.000Z"
const BACKUP_TOTAL = 10
const SIGN_IN_LIMIT = 100
/** Адреса з діапазону для документації (RFC 5737) — не справжня. */
const CURRENT_IP = "192.0.2.24"
const CURRENT_LOCATION: LocalizedText = {
  uk: "Київ, Україна",
  en: "Kyiv, Ukraine",
}

let seeds: Record<string, MockAccountSeed> = {}

export function setMockAccountSeeds(value: Record<string, MockAccountSeed>) {
  seeds = value
}

const isSetupFactor = (value: string): value is SetupFactor =>
  (SETUP_FACTORS as readonly string[]).includes(value)

function initialState(user: MockUser): MockAccountState {
  const seed = seeds[user.id] ?? {}
  const factors = user.factors.filter(isSetupFactor).map((type): Factor => ({
    id: `${type}-${user.id}`,
    type,
    ...(type === "sms" && user.phone
      ? { destination: maskPhone(user.phone) }
      : {}),
    ...(type === "email" ? { destination: maskEmail(user.email) } : {}),
    createdAt: SEED_DATE,
    lastUsedAt: null,
    ...seed.factors?.[type],
  }))
  const codes = user.factors.includes("backup_code")
    ? [...(user.backupCodes ?? [])]
    : null
  return {
    factors,
    backupCodes: codes,
    backupTotal: BACKUP_TOTAL,
    newSignInAlerts: seed.newSignInAlerts ?? true,
    passwordChangedAt:
      seed.passwordChangedAt === undefined ? SEED_DATE : seed.passwordChangedAt,
    sessions: seed.sessions ?? [],
    trustedDevices: seed.trustedDevices ?? [],
    signIns: seed.signIns ?? [],
    knownDevices: [],
  }
}

function loadState(user: MockUser): MockAccountState {
  try {
    const raw = globalThis.localStorage?.getItem(KEY(user.id))
    if (raw) return { ...initialState(user), ...JSON.parse(raw) } as never
  } catch {
    // Пошкоджений стан — починаємо з початкового.
  }
  return initialState(user)
}

function saveState(userId: string, state: MockAccountState): void {
  try {
    globalThis.localStorage?.setItem(KEY(userId), JSON.stringify(state))
  } catch {
    // Без сховища зміни живуть до перезавантаження.
  }
}

function update(
  user: MockUser,
  change: (state: MockAccountState) => void,
): MockAccountState {
  const state = loadState(user)
  change(state)
  saveState(user.id, state)
  return state
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

export function passwordChanged(user: MockUser): void {
  update(user, (s) => {
    s.passwordChangedAt = new Date().toISOString()
  })
}

function currentDevice(): Device {
  return deviceFromUserAgent(globalThis.navigator?.userAgent ?? "")
}

const deviceKey = (device: Device) =>
  [device.type, device.browser ?? "", device.os ?? ""].join("|")

/** Записати вхід у журнал; перший успішний вхід із пристрою — лист про новий вхід. */
export function recordSignIn(
  user: MockUser,
  event: {
    result: SignInEvent["result"]
    method: SignInMethod
    provider?: string
    impersonatedBy?: string
  },
): void {
  const device = currentDevice()
  const key = deviceKey(device)
  const isNew =
    event.result === "success" &&
    !event.impersonatedBy &&
    !loadState(user).knownDevices.includes(key)
  const state = update(user, (s) => {
    if (isNew) s.knownDevices.push(key)
    s.signIns.unshift({
      id: randomToken(),
      at: new Date().toISOString(),
      ...event,
      device,
      ip: CURRENT_IP,
      location: CURRENT_LOCATION,
      ...(isNew ? { newDevice: true } : {}),
    })
    s.signIns = s.signIns.slice(0, SIGN_IN_LIMIT)
    // Фактор, яким увійшли, — «востаннє використано».
    if (event.result === "success")
      s.factors = s.factors.map((f) =>
        f.type === event.method
          ? { ...f, lastUsedAt: new Date().toISOString() }
          : f,
      )
  })
  if (isNew && state.newSignInAlerts)
    sendMockMessage({
      channel: "email",
      to: user.email,
      kind: "new_sign_in",
      detail: [device.browser, device.os].filter(Boolean).join(", "),
    })
}

/* --------------------------------- Обробники --------------------------------- */

export interface AccountMockOptions {
  baseUrl?: string
  /** Код, який мок приймає під час налаштування застосунку, SMS і email. */
  sentCode?: string
  /** Які фактори можна додати. */
  available?: SetupFactor[]
  /** Компанія вимагає другий крок: останній фактор не видалити. */
  twoFactorRequired?: (user: MockUser) => boolean
  /** Назва в застосунку-автентифікаторі й у вікні ключа доступу (бренд може змінюватися). */
  issuer?: () => string | undefined
  /** Повторне підтвердження: відповідь 403 або null — можна. */
  reauthRequired: () => Response | null
}

const RESEND_SECONDS = 30
const NAME_MAX = 64

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const base32Secret = () =>
  Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(20)),
    (b) => BASE32[b % 32],
  ).join("")

const backupCodes = () =>
  Array.from({ length: BACKUP_TOTAL }, () => randomToken().slice(0, 8))

const validation = (fields: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: fields,
  })

const notFound = () =>
  errorResponse(404, { code: "not_found", message: "Not found" })

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

function localize<T extends { location?: LocalizedText }>(
  item: T,
  language: string,
): Omit<T, "location"> & { location?: string } {
  const { location, ...rest } = item
  const text = localizedText(location, language)
  return text ? { ...rest, location: text } : rest
}

interface PendingSetup {
  userId: string
  type: "totp" | "sms"
  phone?: string
  sentAt?: number
}

export function createAccountHandlers({
  baseUrl = API_PREFIX,
  sentCode = "123456",
  available = [...SETUP_FACTORS],
  twoFactorRequired = () => false,
  issuer: issuerOf,
  reauthRequired,
}: AccountMockOptions): HttpHandler[] {
  const setups = new Map<string, PendingSetup>()
  const issuer = () => issuerOf?.() ?? "erp-ui"

  /** Зміна безпеки: увійшов, не «Увійти як…», свіже повторне підтвердження. */
  const guardChange = (): MockUser | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    return impersonationForbidden() ?? reauthRequired() ?? user
  }

  /** Новий фактор; перший — разом із резервними кодами. */
  const enroll = (user: MockUser, factor: Factor, replaceType?: boolean) => {
    let codes: string[] | undefined
    update(user, (s) => {
      const first = s.factors.length === 0
      s.factors = replaceType
        ? [...s.factors.filter((f) => f.type !== factor.type), factor]
        : [...s.factors, factor]
      if (first && !s.backupCodes?.length) {
        codes = backupCodes()
        s.backupCodes = codes
        s.backupTotal = codes.length
      }
    })
    return json({ factor, ...(codes ? { backupCodes: codes } : {}) })
  }

  const newFactor = (
    type: SetupFactor,
    extra: Partial<Factor> = {},
  ): Factor => ({
    id: `${type}-${randomToken()}`,
    type,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    ...extra,
  })

  const verifySetup = async (
    request: Request,
    type: PendingSetup["type"],
  ): Promise<{ user: MockUser; setup: PendingSetup } | Response> => {
    const guard = guardChange()
    if (guard instanceof Response) return guard
    const body = (await request.json()) as { setupId?: string; code?: string }
    const setup = body.setupId ? setups.get(body.setupId) : undefined
    if (!setup || setup.userId !== guard.id || setup.type !== type)
      return errorResponse(410, {
        code: "token_expired",
        message: "Setup expired",
      })
    if (body.code?.replace(/\s/g, "") !== sentCode)
      return validation({ code: "invalid" })
    if (body.setupId) setups.delete(body.setupId)
    return { user: guard, setup }
  }

  return [
    http.get(`${baseUrl}/me/security`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const state = loadState(user)
      return json({
        factors: state.factors,
        available,
        backupCodes:
          state.backupCodes && state.factors.length
            ? { remaining: state.backupCodes.length, total: state.backupTotal }
            : null,
        twoFactorRequired: twoFactorRequired(user),
        newSignInAlerts: state.newSignInAlerts,
        passwordChangedAt: state.passwordChangedAt,
      })
    }),

    http.patch(`${baseUrl}/me/security`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const forbidden = impersonationForbidden()
      if (forbidden) return forbidden
      const body = (await request.json()) as { newSignInAlerts?: unknown }
      if (typeof body.newSignInAlerts !== "boolean")
        return validation({ newSignInAlerts: "invalid" })
      update(user, (s) => {
        s.newSignInAlerts = body.newSignInAlerts as boolean
      })
      return noContent()
    }),

    http.post(`${baseUrl}/me/factors/totp`, () => {
      const guard = guardChange()
      if (guard instanceof Response) return guard
      const secret = base32Secret()
      const setupId = randomToken()
      setups.set(setupId, { userId: guard.id, type: "totp" })
      const name = issuer()
      const label = encodeURIComponent(`${name}:${guard.email}`)
      return json({
        setupId,
        secret,
        uri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(name)}&algorithm=SHA1&digits=6&period=30`,
      })
    }),

    http.post(`${baseUrl}/me/factors/totp/verify`, async ({ request }) => {
      const result = await verifySetup(request, "totp")
      if (result instanceof Response) return result
      return enroll(result.user, newFactor("totp"), true)
    }),

    http.post(`${baseUrl}/me/factors/sms`, async ({ request }) => {
      const guard = guardChange()
      if (guard instanceof Response) return guard
      const { phone } = (await request.json()) as { phone?: string }
      const digits = phone?.replace(/\D/g, "") ?? ""
      if (!phone) return validation({ phone: "required" })
      if (digits.length < 10) return validation({ phone: "invalid" })
      const setupId = randomToken()
      setups.set(setupId, {
        userId: guard.id,
        type: "sms",
        phone,
        sentAt: Date.now(),
      })
      sendMockMessage({
        channel: "sms",
        to: phone,
        kind: "verify",
        code: sentCode,
      })
      return json({
        setupId,
        destination: maskPhone(phone),
        resendIn: RESEND_SECONDS,
        codeLength: sentCode.length,
      })
    }),

    http.post(`${baseUrl}/me/factors/sms/verify`, async ({ request }) => {
      const result = await verifySetup(request, "sms")
      if (result instanceof Response) return result
      const phone = result.setup.phone ?? ""
      // Новий номер — і для входу кодом у SMS.
      result.user.phone = phone
      return enroll(
        result.user,
        newFactor("sms", { destination: maskPhone(phone) }),
        true,
      )
    }),

    http.post(`${baseUrl}/me/factors/email`, () => {
      const guard = guardChange()
      if (guard instanceof Response) return guard
      if (loadState(guard).factors.some((f) => f.type === "email"))
        return errorResponse(409, {
          code: "conflict",
          message: "Already enabled",
        })
      return enroll(
        guard,
        newFactor("email", { destination: maskEmail(guard.email) }),
      )
    }),

    http.post(`${baseUrl}/me/factors/passkey/options`, ({ request }) => {
      const guard = guardChange()
      if (guard instanceof Response) return guard
      return json({
        publicKey: {
          challenge: base64Url(
            globalThis.crypto.getRandomValues(new Uint8Array(32)),
          ),
          rp: { name: issuer(), id: new URL(request.url).hostname },
          user: {
            id: base64Url(new TextEncoder().encode(guard.id)),
            name: guard.email,
            displayName: guard.name,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          timeout: 60_000,
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "preferred",
          },
          attestation: "none",
        },
      })
    }),

    http.post(`${baseUrl}/me/factors/passkey`, async ({ request }) => {
      const guard = guardChange()
      if (guard instanceof Response) return guard
      const body = (await request.json()) as {
        name?: string
        credential?: { id?: string }
      }
      const name = body.name?.trim() ?? ""
      if (!name) return validation({ name: "required" })
      if (name.length > NAME_MAX) return validation({ name: "tooLong" })
      if (!body.credential?.id) return validation({ credential: "invalid" })
      return enroll(guard, newFactor("passkey", { name }))
    }),

    http.patch(`${baseUrl}/me/factors/:id`, async ({ params, request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const forbidden = impersonationForbidden()
      if (forbidden) return forbidden
      const { name: raw } = (await request.json()) as { name?: string }
      const name = raw?.trim() ?? ""
      if (!name) return validation({ name: "required" })
      if (name.length > NAME_MAX) return validation({ name: "tooLong" })
      const factor = loadState(user).factors.find((f) => f.id === params.id)
      if (!factor) return notFound()
      const renamed = { ...factor, name }
      update(user, (s) => {
        s.factors = s.factors.map((f) => (f.id === renamed.id ? renamed : f))
      })
      return json(renamed)
    }),

    http.delete(`${baseUrl}/me/factors/:id`, ({ params }) => {
      const guard = guardChange()
      if (guard instanceof Response) return guard
      const state = loadState(guard)
      if (!state.factors.some((f) => f.id === params.id)) return notFound()
      if (state.factors.length === 1 && twoFactorRequired(guard))
        return errorResponse(409, {
          code: "factor_required",
          message: "Two-step verification is required",
        })
      update(guard, (s) => {
        s.factors = s.factors.filter((f) => f.id !== params.id)
        // Без факторів резервні коди не потрібні.
        if (!s.factors.length) s.backupCodes = null
      })
      return noContent()
    }),

    http.post(`${baseUrl}/me/backup-codes`, () => {
      const guard = guardChange()
      if (guard instanceof Response) return guard
      if (!loadState(guard).factors.length)
        return errorResponse(409, {
          code: "factor_required",
          message: "Add a sign-in method first",
        })
      const codes = backupCodes()
      update(guard, (s) => {
        s.backupCodes = codes
        s.backupTotal = codes.length
      })
      return json({ codes })
    }),

    http.get(`${baseUrl}/me/sessions`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const session = getMockSession()
      const language = languageOf(request)
      const admin = session?.impersonatorId
        ? mockUsersList().find((u) => u.id === session.impersonatorId)
        : undefined
      const current: AccountSession = {
        id: session?.id ?? "current",
        current: true,
        device: currentDevice(),
        ip: CURRENT_IP,
        location: localizedText(CURRENT_LOCATION, language),
        createdAt: new Date(session?.startedAt ?? Date.now()).toISOString(),
        lastActiveAt: new Date().toISOString(),
        ...(admin ? { impersonatedBy: admin.name } : {}),
      }
      const others = loadState(user).sessions.map((s) => ({
        ...localize(s, language),
        current: false,
      }))
      return json([current, ...others])
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

    /* ------------------------------ «Увійти як…» ------------------------------ */

    http.post(`${baseUrl}/auth/impersonation`, async ({ request }) => {
      const admin = currentMockUser()
      const session = getMockSession()
      if (!admin || !session) return unauthenticated()
      if (session.impersonatorId)
        return errorResponse(409, {
          code: "conflict",
          message: "Already impersonating",
        })
      if (!hasPermission(admin.permissions, "users", "impersonate"))
        return errorResponse(403, {
          code: "forbidden",
          message: "Missing users:impersonate",
        })
      const reauth = reauthRequired()
      if (reauth) return reauth
      const body = (await request.json()) as {
        userId?: string
        reason?: string
      }
      const reason = body.reason?.trim() ?? ""
      if (!reason) return validation({ reason: "required" })
      const target = mockUsersList().find((u) => u.id === body.userId)
      if (!target) return notFound()
      if (target.id === admin.id) return validation({ userId: "invalid" })
      // Іншого адміністратора — ні: інакше «Увійти як…» обходить розподіл прав.
      if (hasPermission(target.permissions, "users", "impersonate"))
        return errorResponse(403, {
          code: "forbidden",
          message: "Cannot impersonate an administrator",
        })
      writeMockSession({
        ...session,
        userId: target.id,
        impersonatorId: admin.id,
        reauthUntil: undefined,
      })
      recordSignIn(target, {
        result: "success",
        method: "impersonation",
        impersonatedBy: admin.name,
      })
      return noContent()
    }),

    http.delete(`${baseUrl}/auth/impersonation`, () => {
      const session = getMockSession()
      if (session?.stage !== "authenticated") return unauthenticated()
      if (!session.impersonatorId)
        return errorResponse(409, {
          code: "conflict",
          message: "Not impersonating",
        })
      writeMockSession({
        ...session,
        userId: session.impersonatorId,
        impersonatorId: undefined,
        reauthUntil: undefined,
      })
      return noContent()
    }),
  ]
}
