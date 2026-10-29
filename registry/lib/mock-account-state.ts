/**
 * Стан акаунта для моків (ADR-0011, ADR-0012): дані кожного користувача в localStorage
 * (`erp-ui:mock-account:<id>`), сесії й журнал входів, спільне для обробників `lib/mock-account`,
 * `lib/mock-factors` і `lib/mock-impersonation`. Без MSW.
 *
 * - Початковий стан — з `MockUser.factors` і `seeds` (`setMockAccountSeeds`); пошкоджений запис —
 *   як початковий.
 * - Місця входу й назви пристроїв мок перекладає за `Accept-Language`, як справжній сервер.
 */
import {
  SETUP_FACTORS,
  type AccountSession,
  type ApiToken,
  type Device,
  type Factor,
  type SetupFactor,
  type SignInEvent,
  type SignInMethod,
  type TrustedDevice,
} from "@/registry/lib/account"
import { recordAudit } from "@/registry/lib/mock-audit"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import {
  CURRENT_IP,
  CURRENT_LOCATION,
  currentDevice,
  currentMockUser,
  errorResponse,
  getMockSession,
  impersonationForbidden,
  maskEmail,
  maskPhone,
  mockUsersList,
  randomToken,
  sendMockMessage,
  unauthenticated,
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
  /** Заблоковано адміністратором ще до запуску моків (ADR-0013): хто, коли, чому. */
  blocked?: { at: string; by: string; reason: string }
}

/** Змінене в профілі (поверх `MockUser`); avatarUrl: null — фото видалено. */
type MockProfile = Partial<{
  name: string
  position: string
  phone: string
  timezone: string
  signature: string
  avatarUrl: string | null
}>

export interface MockApiToken extends ApiToken {
  /** Мок зберігає сам токен; справжній сервер — лише хеш. */
  secret: string
}

export interface MockAccountState {
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
  profile: MockProfile
  apiTokens: MockApiToken[]
  /** Попередні паролі — для правила «не повторювати» (мок тримає їх відкрито). */
  passwordHistory: string[]
  /** Адміністратор заблокував акаунт (ADR-0013). */
  blocked?: { at: string; by: string; reason: string }
}

const KEY = (userId: string) => `erp-ui:mock-account:${userId}`
const SEED_DATE = "2026-06-02T09:15:00.000Z"
export const BACKUP_TOTAL = 10
/** Через скільки секунд можна надіслати код ще раз: вхід і налаштування факторів. */
export const RESEND_SECONDS = 30
const SIGN_IN_LIMIT = 100
/** Найдовша назва фактора чи токена API. */
export const NAME_MAX = 64

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
    profile: {},
    apiTokens: [],
    passwordHistory: [user.password],
    ...(seed.blocked ? { blocked: seed.blocked } : {}),
  }
}

export function loadState(user: MockUser): MockAccountState {
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

export function update(
  user: MockUser,
  change: (state: MockAccountState) => void,
): MockAccountState {
  const state = loadState(user)
  change(state)
  saveState(user.id, state)
  return state
}

/** Користувач як автор події журналу аудиту. */
export const actorOf = (user: MockUser) => ({
  type: "user" as const,
  id: user.id,
  name: user.name,
})

export const validation = (fields: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: fields,
  })

export const notFound = () =>
  errorResponse(404, { code: "not_found", message: "Not found" })

/** «Стеля» (ADR-0032): не дати й не змінити права, яких немає в того, хто дає. */
export const beyondCeiling = () =>
  errorResponse(403, {
    code: "forbidden",
    message: "Exceeds your own permissions",
  })

export const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

export function localize<T extends { location?: LocalizedText }>(
  item: T,
  language: string,
): Omit<T, "location"> & { location?: string } {
  const { location, ...rest } = item
  const text = localizedText(location, language)
  return text ? { ...rest, location: text } : rest
}

/**
 * Зміна безпеки: увійшов, не «Увійти як…», свіже повторне підтвердження. На кроці входу
 * «налаштуйте другий крок» (політика, ADR-0012) пароль щойно перевірено — без підтвердження.
 */
export function accountChangeGuard(
  reauthRequired: () => Response | null,
): MockUser | Response {
  const session = getMockSession()
  if (session?.stage === "factor_setup" && session.expiresAt > Date.now())
    return (
      mockUsersList().find((u) => u.id === session.userId) ?? unauthenticated()
    )
  const user = currentMockUser()
  if (!user) return unauthenticated()
  return impersonationForbidden() ?? reauthRequired() ?? user
}

/* ------------------------------- Сесії й входи ------------------------------- */

/** Сесії користувача мовою `language`; сесія цього браузера — `current`, якщо вона його. */
export function mockUserSessions(
  user: MockUser,
  language: string,
): AccountSession[] {
  const session = getMockSession()
  const own = session?.stage === "authenticated" && session.userId === user.id
  const admin =
    own && session.impersonatorId
      ? mockUsersList().find((u) => u.id === session.impersonatorId)
      : undefined
  const current: AccountSession[] = own
    ? [
        {
          id: session.id ?? "current",
          current: true,
          device: currentDevice(),
          ip: CURRENT_IP,
          location: localizedText(CURRENT_LOCATION, language),
          createdAt: new Date(session.startedAt ?? Date.now()).toISOString(),
          lastActiveAt: new Date().toISOString(),
          ...(admin ? { impersonatedBy: admin.name } : {}),
        },
      ]
    : []
  return [
    ...current,
    ...loadState(user).sessions.map((s) => ({
      ...localize(s, language),
      current: false,
    })),
  ]
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
  if (event.method !== "impersonation")
    recordAudit({
      action:
        event.result === "success"
          ? "auth.sign_in"
          : event.result === "blocked"
            ? "auth.sign_in_blocked"
            : "auth.sign_in_failed",
      category: "auth",
      ...(event.result === "success" ? {} : { result: "failure" as const }),
      actor: actorOf(user),
      details: {
        method: event.method,
        ...(event.provider ? { provider: event.provider } : {}),
      },
    })
  if (isNew && state.newSignInAlerts)
    sendMockMessage({
      channel: "email",
      to: user.email,
      kind: "new_sign_in",
      detail: [device.browser, device.os].filter(Boolean).join(", "),
    })
}

/* -------------------------------- Обробники -------------------------------- */

export interface AccountMockOptions {
  baseUrl?: string
  /** Код, який мок приймає під час налаштування застосунку, SMS і email. */
  sentCode?: string
  /** Які фактори можна додати (зважає на політику безпеки). */
  available?: () => SetupFactor[]
  /** Компанія вимагає другий крок: останній фактор не видалити. */
  twoFactorRequired?: (user: MockUser) => boolean
  /** Назва в застосунку-автентифікаторі й у вікні ключа доступу (бренд може змінюватися). */
  issuer?: () => string | undefined
  /** Повторне підтвердження: відповідь 403 або null — можна. */
  reauthRequired: () => Response | null
  /** Назви ресурсів для прав токенів API: { invoices: { uk: "Рахунки", en: "Invoices" } }. */
  apiResources?: Record<string, LocalizedText>
}
