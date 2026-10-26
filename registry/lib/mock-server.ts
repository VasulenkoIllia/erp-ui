/**
 * Основа мок-сервера MSW (ADR-0002, ADR-0010): відповіді в єдиному форматі, сценарії,
 * сесія з ковзним терміном, користувачі й «надіслані» SMS та листи.
 *
 * - Сесія живе в localStorage (як cookie браузера): переживає перезавантаження сторінки.
 * - Кожна відповідь авторизованому користувачу несе `X-Session-Expires-At`; запит продовжує сесію,
 *   крім фонового (`X-Background-Request: 1`).
 * - Мок не надсилає SMS і листи — він повідомляє про них підписників (`subscribeMockMessages`),
 *   а демо показує їх як сповіщення телефона чи пошти.
 * - Пачка змін (`mockBatch`): стан моків у localStorage читається й пишеться раз на пачку, а не
 *   на кожен запис (партія масової дії, lib/mock-jobs).
 */
import { HttpResponse } from "msw/http"
import { delay } from "msw/utils/delay"

import { deviceFromUserAgent, type Device } from "@/registry/lib/account"
import { COMPANY_HEADER, type ApiErrorBody } from "@/registry/lib/api"
import {
  hasPermission,
  meSchema,
  type AuthFactor,
  type LocalizedText,
  type Me,
} from "@/registry/lib/auth"
import { SLOW_DELAY_MS, type Scenario } from "@/registry/lib/mock-scenarios"
import {
  BACKGROUND_HEADER,
  SESSION_EXPIRES_HEADER,
} from "@/registry/lib/session"

/* --------------------------------- Відповіді --------------------------------- */

export function errorResponse(status: number, body: ApiErrorBody) {
  return HttpResponse.json(body, { status, headers: sessionHeaders() })
}

/** JSON-відповідь із терміном сесії, якщо користувач увійшов. */
export function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  for (const [key, value] of Object.entries(sessionHeaders()))
    headers.set(key, value)
  return HttpResponse.json(body as never, { ...init, headers })
}

export function noContent() {
  return new HttpResponse(null, { status: 204, headers: sessionHeaders() })
}

export const unauthenticated = () =>
  errorResponse(401, { code: "unauthenticated", message: "Not signed in" })

/** Сценарій перед обробкою: відповідь одразу (помилка, офлайн) або null — продовжувати. */
export async function applyScenario(
  scenario: Scenario,
): Promise<Response | null> {
  switch (scenario) {
    case "offline":
      return HttpResponse.error()
    case "error":
      return errorResponse(500, {
        code: "server",
        message: "Mock: server error",
      })
    case "forbidden":
      return errorResponse(403, {
        code: "forbidden",
        message: "Mock: forbidden",
      })
    case "slow":
      await delay(SLOW_DELAY_MS)
      return null
    default:
      return null
  }
}

/* ---------------------------- Звідки прийшов запит ---------------------------- */

/** Адреса з діапазону для документації (RFC 5737) — не справжня. */
export const CURRENT_IP = "192.0.2.24"
/** Місце за адресою, як його визначив би сервер. */
export const CURRENT_LOCATION: LocalizedText = {
  uk: "Київ, Україна",
  en: "Kyiv, Ukraine",
}

/** Пристрій цього браузера (з User-Agent). */
export function currentDevice(): Device {
  return deviceFromUserAgent(globalThis.navigator?.userAgent ?? "")
}

/* -------------------------------- Користувачі -------------------------------- */

export interface MockUser extends Me {
  password: string
  /** Код застосунку-автентифікатора, який мок приймає (у справжньому сервері — TOTP). */
  totpCode: string
  /** Одноразові резервні коди. */
  backupCodes?: string[]
  /** Тимчасовий пароль: після входу — спершу новий. */
  mustChangePassword?: boolean
}

let mockUsers: MockUser[] = []
let seededIds = new Set<string>()
let persistOnLeave = false

/**
 * Користувачі з реєстрації й запрошень переживають перезавантаження, як і сесія: інакше після F5
 * сесія вказує на невідомого користувача, а дані нової компанії сиротіють. Лише демо: пароль і
 * коди моку лежать у localStorage відкритим текстом. Версія в ключі — щоб змінити формат без
 * міграції старих записів.
 */
const ADDED_USERS_KEY = "erp-ui:mock-users:v1"

const isStoredUser = (value: unknown): value is MockUser =>
  meSchema.safeParse(value).success &&
  typeof (value as Partial<MockUser>).password === "string" &&
  typeof (value as Partial<MockUser>).totpCode === "string"

function readAddedUsers(): MockUser[] {
  try {
    const raw = globalThis.localStorage?.getItem(ADDED_USERS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isStoredUser) : []
  } catch {
    return []
  }
}

/** Знімок доданих користувачів: мок змінює їх на місці (пароль, фактори), тож пишемо весь стан. */
function persistAddedUsers(): void {
  const added = mockUsers.filter((u) => !seededIds.has(u.id))
  try {
    if (added.length)
      globalThis.localStorage?.setItem(ADDED_USERS_KEY, JSON.stringify(added))
    else globalThis.localStorage?.removeItem(ADDED_USERS_KEY)
  } catch {
    // Без сховища нові користувачі живуть до перезавантаження.
  }
}

/** Початкові користувачі; збережені з реєстрації й запрошень додаються до них. */
export function setMockUsers(users: MockUser[]): void {
  seededIds = new Set(users.map((u) => u.id))
  mockUsers = [
    ...users,
    ...readAddedUsers().filter((u) => !seededIds.has(u.id)),
  ]
  if (!persistOnLeave && typeof window !== "undefined") {
    persistOnLeave = true
    // Зміни на місці (новий пароль, фактор) — у знімок перед виходом зі сторінки, зокрема F5.
    window.addEventListener("pagehide", persistAddedUsers)
  }
}

export function mockUsersList(): MockUser[] {
  return mockUsers
}

export function addMockUser(user: MockUser): void {
  mockUsers = [...mockUsers, user]
  persistAddedUsers()
}

export function removeMockUser(id: string): void {
  mockUsers = mockUsers.filter((u) => u.id !== id)
  persistAddedUsers()
}

/* ----------------------------------- Сесія ----------------------------------- */

export interface MockChallenge {
  methods: AuthFactor[]
  method: AuthFactor
  secondFactor: boolean
  /** Коли надіслано останній код (мс), для паузи перед повтором. */
  sentAt?: number
  attempts: number
  /** Куди надіслано (для входу без пароля — що ввів користувач). */
  destination?: string
}

export interface MockSession {
  /** Ідентифікатор сесії для списку пристроїв. */
  id?: string
  /** Коли почалася (мс). */
  startedAt?: number
  /** Адміністратор, що працює від імені `userId` («Увійти як…»). */
  impersonatorId?: string
  userId: string
  /** factor_setup — політика вимагає другий крок, а його ще немає (ADR-0012). */
  stage: "challenge" | "password_change" | "factor_setup" | "authenticated"
  challenge?: MockChallenge
  /** Коли сесія закінчиться без активності (мс). */
  expiresAt: number
  /** До коли діє повторне підтвердження для чутливих дій (мс). */
  reauthUntil?: number
  /** Новий email, що чекає на код. */
  pendingEmail?: string
}

const STAGES: MockSession["stage"][] = [
  "challenge",
  "password_change",
  "factor_setup",
  "authenticated",
]

const SESSION_KEY = "erp-ui:mock-session"
let sessionMinutes = 30

export function setSessionMinutes(minutes: number): void {
  sessionMinutes = minutes
}

function readSession(): MockSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Partial<MockSession>
    // Порожній userId — вхід без пароля для невідомого акаунта: код просто не підійде.
    if (typeof session.userId !== "string") return null
    return {
      id: session.id,
      startedAt: session.startedAt,
      impersonatorId: session.impersonatorId,
      userId: session.userId,
      stage: STAGES.includes(session.stage as MockSession["stage"])
        ? (session.stage as MockSession["stage"])
        : "authenticated",
      challenge: session.challenge,
      reauthUntil: session.reauthUntil,
      pendingEmail: session.pendingEmail,
      // Сесії, засіяні тестами без терміну, живуть звичайний час.
      expiresAt: session.expiresAt ?? Date.now() + sessionMinutes * 60_000,
    }
  } catch {
    return null
  }
}

export function getMockSession(): MockSession | null {
  return readSession()
}

export function writeMockSession(session: MockSession | null): void {
  try {
    if (session)
      globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session))
    else globalThis.localStorage?.removeItem(SESSION_KEY)
  } catch {
    // Без сховища мок працює без сесії.
  }
}

export const newExpiry = () => Date.now() + sessionMinutes * 60_000

export const randomToken = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")

/** Почати авторизовану сесію користувача. */
export function authenticate(userId: string): void {
  writeMockSession({
    id: randomToken(),
    startedAt: Date.now(),
    userId,
    stage: "authenticated",
    expiresAt: newExpiry(),
  })
}

/** Адміністратор працює від імені користувача: зміни безпеки заборонені. */
export function impersonationForbidden(): Response | null {
  return getMockSession()?.impersonatorId
    ? errorResponse(403, {
        code: "impersonation_forbidden",
        message: "Not available while impersonating",
      })
    : null
}

function sessionHeaders(): Record<string, string> {
  const session = readSession()
  return session?.stage === "authenticated" && session.expiresAt > Date.now()
    ? {
        [SESSION_EXPIRES_HEADER]: new Date(session.expiresAt).toISOString(),
      }
    : {}
}

/**
 * Користувач поточної сесії; запит продовжує сесію, прострочена — закривається.
 * `request` із `X-Background-Request: 1` (опитування) сесію не продовжує.
 */
export function currentMockUser(request?: Request): MockUser | null {
  const session = readSession()
  if (session?.stage !== "authenticated") return null
  if (session.expiresAt <= Date.now()) {
    writeMockSession(null)
    return null
  }
  if (request?.headers.get(BACKGROUND_HEADER) !== "1")
    writeMockSession({ ...session, expiresAt: newExpiry() })
  return mockUsers.find((u) => u.id === session.userId) ?? null
}

/**
 * Компанія запиту (ADR-0003): заголовок `X-Company-Id`, без нього — компанія сесії. Компанія, де
 * людина не працює, — `null`: заголовку без членства сервер не вірить, а «усіх компаній» не буває.
 */
export function mockRequestCompany(
  request: Request,
  user: MockUser,
): string | null {
  const id = request.headers.get(COMPANY_HEADER) ?? user.companyId
  if (!id) return null
  const member =
    user.companies.some((company) => company.id === id) ||
    hasPermission(user.permissions, "*", "*")
  return member ? id : null
}

/** Увійти в мок без форми — для тестів і демо. */
export function signInMock(userId: string | null): void {
  if (userId) authenticate(userId)
  else writeMockSession(null)
}

/* --------------------------- «Надіслані» повідомлення --------------------------- */

export interface MockMessage {
  channel: "sms" | "email"
  /** Кому (як ввів користувач чи з профілю). */
  to: string
  /**
   * Для чого: вхід, відновлення пароля, запрошення, підтвердження, повідомлення про зміну email,
   * експорт даних, вхід з нового пристрою, запит на відновлення доступу, скинутий другий крок.
   */
  kind:
    | "login"
    | "reset"
    | "invite"
    | "verify"
    | "notice"
    | "export"
    | "new_sign_in"
    | "recovery"
    | "factors_reset"
  code?: string
  link?: string
  /** Подробиці: пристрій нового входу. */
  detail?: string
}

const messageListeners = new Set<(message: MockMessage) => void>()

export function subscribeMockMessages(
  listener: (message: MockMessage) => void,
): () => void {
  messageListeners.add(listener)
  return () => {
    messageListeners.delete(listener)
  }
}

export function sendMockMessage(message: MockMessage): void {
  messageListeners.forEach((listener) => {
    listener(message)
  })
}

/* --------------------------------- Маскування --------------------------------- */

/** «+380671234545» → «+380 •• ••• •• 45». */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return `+${digits.slice(0, 3)} •• ••• •• ${digits.slice(-2)}`
}

/** «olena@zoriana.example» → «o•••@zoriana.example». */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@")
  return `${name.slice(0, 1)}•••@${domain}`
}

/* ------------------------------- Події сервера ------------------------------- */

/**
 * Подія на «сервері»: запис створено чи змінено (`invoices.updated`), дія безпеки. Слухачі —
 * вебхуки (lib/mock-webhooks), далі реальний час (крок 0.5c).
 */
export interface MockEvent {
  /** `<ресурс>.<дія>`: «invoices.created», «users.blocked». */
  type: string
  at: string
  data: Record<string, unknown>
}

const eventListeners = new Set<(event: MockEvent) => void>()

export function subscribeMockEvents(
  listener: (event: MockEvent) => void,
): () => void {
  eventListeners.add(listener)
  return () => {
    eventListeners.delete(listener)
  }
}

export function emitMockEvent(type: string, data: Record<string, unknown>) {
  const event: MockEvent = { type, at: new Date().toISOString(), data }
  eventListeners.forEach((listener) => {
    listener(event)
  })
}

/* --------------------------------- Пачка змін --------------------------------- */

interface BatchEntry {
  state: unknown
  /** Записати стан у сховище наприкінці пачки; немає — стан лише прочитано. */
  flush?: () => void
}

/** Стан моків, прочитаний чи змінений у поточній пачці змін; поза пачкою — null. */
let activeBatch: Map<symbol, BatchEntry> | null = null

/**
 * Пачка змін (партія масової дії, lib/mock-jobs): стан моків у localStorage (журнал аудиту,
 * доставки вебхуків) читається раз і пишеться раз наприкінці, а не на кожен запис. MSW виконує
 * обробники в головному потоці сторінки: 1 200 записів, і на кожен — розібрати й записати пів
 * мегабайта JSON, блокували сторінку на секунди.
 *
 * - `run` — синхронний: після першого `await` пачку вже закрито, тож тип не приймає проміс.
 * - Вкладена пачка — частина зовнішньої. Помилка в `run` не скасовує вже зроблених змін: вони
 *   пишуться в сховище, як і без пачки.
 */
export function mockBatch<T>(
  run: () => T extends PromiseLike<unknown> ? never : T,
): T {
  if (activeBatch) return run()
  const entries = new Map<symbol, BatchEntry>()
  activeBatch = entries
  try {
    return run()
  } finally {
    activeBatch = null
    for (const { flush } of entries.values()) flush?.()
  }
}

/** Стан моку в localStorage (`batchedMockState`). */
export interface BatchedMockState<S> {
  /**
   * Поза пачкою — щоразу з `load`. У пачці — `load` раз, далі той самий об'єкт: змінювати його
   * лише через `write`, інакше зміна до сховища не дійде.
   */
  read(): S
  /** Замінює весь стан: поза пачкою — одразу `save`, у пачці — `save` наприкінці. */
  write(state: S): void
}

/**
 * Стан моку в localStorage: поза пачкою змін `load` і `save` — щоразу, у пачці — по разу.
 * `save` не кидає (повне чи недоступне сховище обробляє сам): інакше решта стану пачки не
 * запишеться.
 */
export function batchedMockState<S>(
  load: () => S,
  save: (state: S) => void,
): BatchedMockState<S> {
  const key = Symbol("mock-state")
  return {
    read() {
      const entry = activeBatch?.get(key)
      // Ключ належить лише цьому стану, тож і стан під ним — S.
      if (entry) return entry.state as S
      const state = load()
      activeBatch?.set(key, { state })
      return state
    },
    write(state) {
      if (!activeBatch) {
        save(state)
        return
      }
      activeBatch.set(key, {
        state,
        flush: () => {
          save(state)
        },
      })
    },
  }
}
