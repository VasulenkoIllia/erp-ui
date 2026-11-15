/**
 * Методи підтвердження входу (ADR-0003, ADR-0010). Окремий файл без залежностей: схема входу в
 * lib/auth потрібна на першому екрані, а lib/account, де фактори налаштовують, вантажиться ліниво
 * (ADR-0092). lib/auth і lib/account реекспортують ці імена.
 */

/** Методи підтвердження: застосунок, резервний код, SMS/Viber, email, ключ доступу. */
export const AUTH_FACTORS = [
  "totp",
  "backup_code",
  "sms",
  "email",
  "passkey",
] as const
export type AuthFactor = (typeof AUTH_FACTORS)[number]

/** Фактори, які користувач налаштовує сам; резервні коди — окремо (`backupCodes`). */
export const SETUP_FACTORS = ["totp", "sms", "email", "passkey"] as const
export type SetupFactor = (typeof SETUP_FACTORS)[number]
