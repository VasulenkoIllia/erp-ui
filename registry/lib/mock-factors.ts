/**
 * Мок другого кроку акаунта (ADR-0011, ADR-0012): `/me/security`, налаштування факторів (застосунок,
 * SMS, email, ключ доступу), перейменування й видалення, резервні коди. Стан — `lib/mock-account-state`;
 * обробники бере `createAccountHandlers` (`lib/mock-account`).
 *
 * Код застосунку, SMS і email під час налаштування — `sentCode`.
 */
import { http, type HttpHandler } from "msw/http"

import type { Factor, SetupFactor } from "@/registry/lib/account"
import {
  accountChangeGuard,
  actorOf,
  BACKUP_TOTAL,
  loadState,
  NAME_MAX,
  notFound,
  RESEND_SECONDS,
  update,
  validation,
} from "@/registry/lib/mock-account-state"
import { recordAudit } from "@/registry/lib/mock-audit"
import {
  currentMockUser,
  errorResponse,
  impersonationForbidden,
  json,
  maskEmail,
  maskPhone,
  noContent,
  randomToken,
  sendMockMessage,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"

/** Те, що беруть обробники факторів, — уже з типовими значеннями `createAccountHandlers`. */
export interface FactorMockOptions {
  baseUrl: string
  sentCode: string
  available: () => SetupFactor[]
  twoFactorRequired: (user: MockUser) => boolean
  issuer: () => string
  reauthRequired: () => Response | null
}

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

interface PendingSetup {
  userId: string
  type: "totp" | "sms"
  phone?: string
  sentAt?: number
}

export function createFactorHandlers({
  baseUrl,
  sentCode,
  available,
  twoFactorRequired,
  issuer,
  reauthRequired,
}: FactorMockOptions): HttpHandler[] {
  const setups = new Map<string, PendingSetup>()
  const guardChange = () => accountChangeGuard(reauthRequired)

  /** Політика організації може заборонити тип фактора. */
  const notAllowed = (type: SetupFactor) =>
    available().includes(type)
      ? null
      : errorResponse(403, {
          code: "forbidden",
          message: `Factor ${type} is disabled by the security policy`,
        })

  /** Новий фактор; перший — разом із резервними кодами. */
  const enroll = (user: MockUser, factor: Factor, replaceType?: boolean) => {
    recordAudit({
      action: "auth.factor_added",
      category: "auth",
      accountId: user.id,
      actor: actorOf(user),
      details: { type: factor.type },
    })
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
        available: available(),
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
      const disabled = notAllowed("totp")
      if (disabled) return disabled
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
      const disabled = notAllowed("sms")
      if (disabled) return disabled
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
      const disabled = notAllowed("email")
      if (disabled) return disabled
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
      const disabled = notAllowed("passkey")
      if (disabled) return disabled
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
      const removed = state.factors.find((f) => f.id === params.id)
      update(guard, (s) => {
        s.factors = s.factors.filter((f) => f.id !== params.id)
        // Без факторів резервні коди не потрібні.
        if (!s.factors.length) s.backupCodes = null
      })
      recordAudit({
        action: "auth.factor_removed",
        category: "auth",
        accountId: guard.id,
        actor: actorOf(guard),
        ...(removed ? { details: { type: removed.type } } : {}),
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
  ]
}
