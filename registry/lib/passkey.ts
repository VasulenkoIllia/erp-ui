/**
 * Ключі доступу (passkeys, WebAuthn) і автозаповнення коду з SMS (WebOTP) — обгортки над API браузера.
 *
 * - Сервер видає параметри у JSON-формі WebAuthn (`PublicKeyCredentialRequestOptionsJSON`), браузер
 *   повертає відповідь `credential.toJSON()` — без ручного base64url.
 * - Без підтримки в браузері кнопку ключа доступу не показуємо (`passkeysSupported`).
 * - Скасування користувачем — `PasskeyCancelledError`, а не помилка входу.
 */

export class PasskeyCancelledError extends Error {
  constructor() {
    super("Passkey request was cancelled")
    this.name = "PasskeyCancelledError"
  }
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof window.PublicKeyCredential.parseRequestOptionsFromJSON ===
      "function" &&
    typeof navigator.credentials?.get === "function"
  )
}

/** Підписати виклик сервера ключем доступу. Повертає JSON для `POST /auth/passkey/verify`. */
export async function getPasskeyAssertion(
  options: PublicKeyCredentialRequestOptionsJSON,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    const credential = await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
      signal,
    })
    if (!(credential instanceof PublicKeyCredential))
      throw new PasskeyCancelledError()
    return credential.toJSON()
  } catch (error) {
    // NotAllowedError — користувач закрив системне вікно або час вийшов.
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "AbortError")
    )
      throw new PasskeyCancelledError()
    throw error
  }
}

/** WebOTP (Chrome на Android): код з SMS підставляється сам, якщо лист закінчується `@домен #код`. */
interface OtpCredential extends Credential {
  code: string
}

export function webOtpSupported(): boolean {
  return typeof window !== "undefined" && "OTPCredential" in window
}

/** Чекає код з SMS; `null` — не підтримується або скасовано. */
export async function readSmsCode(signal: AbortSignal): Promise<string | null> {
  if (!webOtpSupported()) return null
  try {
    const credential = (await navigator.credentials.get({
      otp: { transport: ["sms"] },
      signal,
    } as CredentialRequestOptions)) as OtpCredential | null
    return credential?.code ?? null
  } catch {
    return null
  }
}
