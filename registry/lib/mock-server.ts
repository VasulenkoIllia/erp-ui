/**
 * Основа мок-сервера MSW (ADR-0002, ADR-0010): відповіді в єдиному форматі, сценарії,
 * сесія з ковзним терміном, користувачі й «надіслані» SMS та листи.
 *
 * - Сесія живе в localStorage (як cookie браузера): переживає перезавантаження сторінки.
 * - Кожна відповідь авторизованому користувачу несе `X-Session-Expires-At`; запит продовжує сесію.
 * - Мок не надсилає SMS і листи — він повідомляє про них підписників (`subscribeMockMessages`),
 *   а демо показує їх як сповіщення телефона чи пошти.
 */
import { HttpResponse } from "msw/http"
import { delay } from "msw/utils/delay"

import type { ApiErrorBody } from "@/registry/lib/api"
import type { AuthFactor, Me } from "@/registry/lib/auth"
import { SLOW_DELAY_MS, type Scenario } from "@/registry/lib/mock-scenarios"
import { SESSION_EXPIRES_HEADER } from "@/registry/lib/session"

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

export function setMockUsers(users: MockUser[]): void {
  mockUsers = users
}

export function mockUsersList(): MockUser[] {
  return mockUsers
}

export function addMockUser(user: MockUser): void {
  mockUsers = [...mockUsers, user]
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
  userId: string
  stage: "challenge" | "password_change" | "authenticated"
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

/** Почати авторизовану сесію користувача. */
export function authenticate(userId: string): void {
  writeMockSession({ userId, stage: "authenticated", expiresAt: newExpiry() })
}

function sessionHeaders(): Record<string, string> {
  const session = readSession()
  return session?.stage === "authenticated" && session.expiresAt > Date.now()
    ? {
        [SESSION_EXPIRES_HEADER]: new Date(session.expiresAt).toISOString(),
      }
    : {}
}

/** Користувач поточної сесії; запит продовжує сесію, прострочена — закривається. */
export function currentMockUser(): MockUser | null {
  const session = readSession()
  if (session?.stage !== "authenticated") return null
  if (session.expiresAt <= Date.now()) {
    writeMockSession(null)
    return null
  }
  writeMockSession({ ...session, expiresAt: newExpiry() })
  return mockUsers.find((u) => u.id === session.userId) ?? null
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
  /** Для чого: вхід, відновлення пароля, запрошення, підтвердження, повідомлення, експорт даних. */
  kind: "login" | "reset" | "invite" | "verify" | "notice" | "export"
  code?: string
  link?: string
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
