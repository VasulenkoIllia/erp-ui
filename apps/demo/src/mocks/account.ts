import type { MockAccountSeed } from "@/registry/lib/mocks"

/**
 * Безпека акаунтів демо: інші пристрої, довірені пристрої й журнал входів (дані «сервера»).
 * Дати — відносно запуску демо, щоб «2 год тому» лишалося правдою.
 */
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString()

const IPHONE = { type: "mobile", browser: "Safari", os: "iOS" } as const
const OFFICE_PC = { type: "desktop", browser: "Edge", os: "Windows" } as const
const ANDROID = { type: "mobile", browser: "Chrome", os: "Android" } as const

const LVIV = { uk: "Львів, Україна", en: "Lviv, Ukraine" }
const KYIV = { uk: "Київ, Україна", en: "Kyiv, Ukraine" }
const WARSAW = { uk: "Варшава, Польща", en: "Warsaw, Poland" }

export const ACCOUNT_SEEDS: Record<string, MockAccountSeed> = {
  "u-olena": {
    factors: {
      totp: { createdAt: ago(60 * 24 * 120), lastUsedAt: ago(60 * 24 * 2) },
      sms: { createdAt: ago(60 * 24 * 90), lastUsedAt: ago(60 * 24 * 30) },
      passkey: {
        name: "MacBook Олени",
        createdAt: ago(60 * 24 * 40),
        lastUsedAt: ago(60 * 5),
      },
    },
    passwordChangedAt: ago(60 * 24 * 75),
    sessions: [
      {
        id: "s-iphone",
        device: IPHONE,
        ip: "198.51.100.17",
        location: LVIV,
        createdAt: ago(60 * 24 * 3),
        lastActiveAt: ago(120),
      },
      {
        id: "s-office",
        device: OFFICE_PC,
        ip: "203.0.113.40",
        location: KYIV,
        createdAt: ago(60 * 24 * 12),
        lastActiveAt: ago(60 * 26),
      },
    ],
    trustedDevices: [
      {
        id: "t-iphone",
        device: IPHONE,
        location: LVIV,
        createdAt: ago(60 * 24 * 3),
        expiresAt: ago(-60 * 24 * 27),
      },
    ],
    signIns: [
      {
        id: "e-5",
        at: ago(120),
        result: "success",
        method: "passkey",
        device: IPHONE,
        ip: "198.51.100.17",
        location: LVIV,
      },
      {
        id: "e-4",
        at: ago(60 * 20),
        result: "failed",
        method: "password",
        device: ANDROID,
        ip: "192.0.2.201",
        location: WARSAW,
      },
      {
        id: "e-3",
        at: ago(60 * 24 * 3),
        result: "success",
        method: "totp",
        device: IPHONE,
        ip: "198.51.100.17",
        location: LVIV,
        newDevice: true,
      },
      {
        id: "e-2",
        at: ago(60 * 24 * 12),
        result: "success",
        method: "sso",
        provider: "Google",
        device: OFFICE_PC,
        ip: "203.0.113.40",
        location: KYIV,
      },
      {
        id: "e-1",
        at: ago(60 * 24 * 12 + 5),
        result: "blocked",
        method: "sms",
        device: OFFICE_PC,
        ip: "203.0.113.40",
        location: KYIV,
      },
    ],
  },
  // Іван — одна сесія на телефоні: адміністратор бачить її в «Доступі» й може завершити.
  "u-ivan": {
    sessions: [
      {
        id: "s-ivan-android",
        device: ANDROID,
        ip: "198.51.100.88",
        location: KYIV,
        createdAt: ago(60 * 24 * 2),
        lastActiveAt: ago(25),
      },
    ],
  },
}
