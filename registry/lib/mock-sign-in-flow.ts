/**
 * Кроки входу для моків (ADR-0003, ADR-0010, ADR-0012): пошук облікового запису, перевірка «не бот»,
 * надсилання кодів і посилань, крок коду, другий фактор, довірений пристрій, політика безпеки,
 * заблокований акаунт, повторне підтвердження. Спільні для обробників `lib/mock-auth`,
 * `lib/mock-sign-up` і `lib/mock-me`; без MSW-маршрутів.
 */
import type { SetupFactor, SignInMethod } from "@/registry/lib/account"
import type { AuthFactor } from "@/registry/lib/auth"
import {
  isTrustedHere,
  mockBlocked,
  mockFactorTypes,
  passwordChangedAt,
  passwordReused,
  recordSignIn,
  trustHere,
} from "@/registry/lib/mock-account"
import { RESEND_SECONDS } from "@/registry/lib/mock-account-state"
import {
  getMockPolicy,
  ipAllowedByPolicy,
  ipNotAllowed,
} from "@/registry/lib/mock-admin"
import {
  authenticate,
  errorResponse,
  getMockSession,
  json,
  maskEmail,
  maskPhone,
  mockUsersList,
  randomToken,
  sendMockMessage,
  writeMockSession,
  type MockChallenge,
  type MockUser,
} from "@/registry/lib/mock-server"

const token = randomToken

const digits = (value: string) => value.replace(/\D/g, "")

export interface SignInFlowOptions {
  /** Код, який мок «надсилає» в SMS і листах. */
  sentCode: string
  /** Адреса посилань у листах. */
  linkUrl: (kind: "login" | "reset" | "invite", token: string) => string
  /** Після скількох невдалих спроб просити перевірку «не бот». */
  captchaAfter: number
  /** Фактори, які можна налаштувати: проект ∩ політика. */
  setupFactors: () => SetupFactor[]
  /** Політика чи проект вимагають другий крок. */
  factorRequired: (user: MockUser) => boolean
}

export type SignInFlow = ReturnType<typeof createSignInFlow>

export function createSignInFlow({
  sentCode,
  linkUrl,
  captchaAfter,
  setupFactors,
  factorRequired,
}: SignInFlowOptions) {
  /** Невдалі спроби за email — після captchaAfter потрібна перевірка «не бот». */
  const failures = new Map<string, number>()
  /** Одноразові токени листів: вхід, відновлення пароля. */
  const tokens = new Map<
    string,
    { userId: string; kind: "login" | "reset"; expires: number }
  >()

  const findUser = (identifier: string) => {
    const lower = identifier.trim().toLowerCase()
    return mockUsersList().find(
      (u) =>
        u.email.toLowerCase() === lower ||
        (u.phone !== undefined &&
          digits(u.phone) !== "" &&
          digits(u.phone) === digits(identifier)),
    )
  }

  const needsCaptcha = (key: string, captchaToken?: string) => {
    if ((failures.get(key) ?? 0) < captchaAfter) return false
    if (captchaToken) {
      failures.delete(key)
      return false
    }
    return true
  }

  const captchaRequired = () =>
    errorResponse(428, {
      code: "captcha_required",
      message: "Confirm that you are not a bot",
    })

  /** Надіслати код методом (sms/email) і повернути, куди. */
  const deliver = (
    user: MockUser | undefined,
    method: AuthFactor,
    fallback?: string,
  ) => {
    if (method === "sms") {
      const to = user?.phone ?? fallback ?? ""
      if (user)
        sendMockMessage({ channel: "sms", to, kind: "login", code: sentCode })
      return maskPhone(to)
    }
    if (method === "email") {
      const to = user?.email ?? fallback ?? ""
      if (user) {
        const value = token()
        tokens.set(value, {
          userId: user.id,
          kind: "login",
          expires: Date.now() + 15 * 60_000,
        })
        sendMockMessage({
          channel: "email",
          to,
          kind: "login",
          code: sentCode,
          link: linkUrl("login", value),
        })
      }
      return maskEmail(to)
    }
    return undefined
  }

  /** Почати підтвердження: відповідь `challenge` і сесія на кроці коду. */
  const startChallenge = (
    userId: string,
    challenge: Omit<MockChallenge, "attempts" | "sentAt">,
    user: MockUser | undefined,
    fallback?: string,
  ) => {
    const destination =
      deliver(user, challenge.method, fallback) ?? challenge.destination
    const sent = challenge.method === "sms" || challenge.method === "email"
    writeMockSession({
      userId,
      stage: "challenge",
      challenge: {
        ...challenge,
        destination,
        attempts: 0,
        sentAt: sent ? Date.now() : undefined,
      },
      expiresAt: Date.now() + 15 * 60_000,
    })
    return json({
      status: "challenge",
      challenge: {
        methods: challenge.methods,
        method: challenge.method,
        destination,
        resendIn: sent ? RESEND_SECONDS : undefined,
        codeLength: challenge.method === "backup_code" ? 8 : 6,
        secondFactor: challenge.secondFactor,
      },
    })
  }

  const signedIn = (
    userId: string,
    method: SignInMethod,
    trustDevice?: boolean,
    second = false,
  ) => {
    const user = mockUsersList().find((u) => u.id === userId)
    const blocked = user ? accountBlocked(user, method) : null
    if (blocked) return blocked
    if (!ipAllowedByPolicy()) {
      if (user) recordSignIn(user, { result: "blocked", method })
      writeMockSession(null)
      return ipNotAllowed()
    }
    const policy = getMockPolicy()
    if (user && trustDevice && second && policy.trustedDeviceDays > 0)
      trustHere(user, policy.trustedDeviceDays)
    const changedAt = user ? passwordChangedAt(user) : null
    // Термін пароля перевіряємо лише після входу паролем (з кодом чи без).
    const expired =
      policy.password.expiryDays !== null &&
      (method === "password" || second) &&
      changedAt !== null &&
      changedAt + policy.password.expiryDays * 86_400_000 < Date.now()
    if (user?.mustChangePassword || expired) {
      writeMockSession({
        userId,
        stage: "password_change",
        expiresAt: Date.now() + 15 * 60_000,
      })
      return json({
        status: "password_change_required",
        reason: user?.mustChangePassword ? "temporary" : "expired",
      })
    }
    authenticate(userId)
    if (user) recordSignIn(user, { result: "success", method })
    return json({ status: "authenticated" })
  }

  /** Чутлива дія: потрібне свіже повторне підтвердження. */
  const reauthRequired = (): Response | null => {
    const session = getMockSession()
    return !session?.reauthUntil || session.reauthUntil < Date.now()
      ? errorResponse(403, {
          code: "reauth_required",
          message: "Confirm it's you",
        })
      : null
  }

  /** Заблокований адміністратором акаунт не входить (ADR-0013). */
  const accountBlocked = (user: MockUser, method: SignInMethod) => {
    if (!mockBlocked(user)) return null
    recordSignIn(user, { result: "blocked", method })
    writeMockSession(null)
    return errorResponse(403, {
      code: "account_blocked",
      message: "This account is blocked",
    })
  }

  /** Пароль чи токен підтверджено: другий фактор, його налаштування (політика) або вхід. */
  const afterFirstFactor = (user: MockUser, method: SignInMethod) => {
    const blocked = accountBlocked(user, method)
    if (blocked) return blocked
    if (!ipAllowedByPolicy()) {
      recordSignIn(user, { result: "blocked", method })
      return ipNotAllowed()
    }
    const factors = mockFactorTypes(user)
    if (!factors.length && factorRequired(user)) {
      writeMockSession({
        userId: user.id,
        stage: "factor_setup",
        expiresAt: Date.now() + 15 * 60_000,
      })
      return json({ status: "factor_setup_required", factors: setupFactors() })
    }
    if (factors.length && !isTrustedHere(user)) {
      const preferred: AuthFactor = factors.includes("totp")
        ? "totp"
        : (factors.find((f) => f !== "backup_code") ?? "totp")
      return startChallenge(
        user.id,
        { methods: factors, method: preferred, secondFactor: true },
        user,
      )
    }
    return signedIn(user.id, method)
  }

  const weakPassword = (password: unknown) =>
    typeof password !== "string" ||
    password.length < getMockPolicy().password.minLength

  /** Пароль серед останніх N (політика «не повторювати»). */
  const reused = (user: MockUser, password: unknown) =>
    typeof password === "string" &&
    passwordReused(user, password, getMockPolicy().password.preventReuse)

  const validation = (fields: Record<string, string>) =>
    errorResponse(422, {
      code: "validation",
      message: "Validation failed",
      fieldErrors: fields,
    })

  return {
    failures,
    tokens,
    findUser,
    needsCaptcha,
    captchaRequired,
    deliver,
    startChallenge,
    signedIn,
    reauthRequired,
    afterFirstFactor,
    weakPassword,
    reused,
    validation,
  }
}
