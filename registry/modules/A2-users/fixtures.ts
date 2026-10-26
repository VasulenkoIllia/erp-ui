/**
 * Демо-дані модуля A2 українською й англійською (SPEC §17) — вони ж шаблон даних для першого запуску
 * (PF12): колеги компанії для мок-сервера входу (`createPlatformHandlers({ users, accountSeeds })`),
 * щоб список людей мав вкладки, фільтри й сторінки. Колеги не входять у демо: пароль — випадковий.
 * Ролі — ключі ролей проекту (`MockRole.id`), по черзі; права моки рахують із ролей (ADR-0014).
 *
 *   const team = createUsersFixtures({ company, roles: ["sales", "accountant"], emailDomain })
 *   createPlatformHandlers({ users: [...users, ...team.users], accountSeeds: { ...seeds, ...team.accountSeeds } })
 */
import type { Me } from "@/lib/auth"
import type { MockAccountSeed, MockUser } from "@/lib/mocks"

import { BLOCK_REASONS, BLOCKED_BY, COLLEAGUES } from "./fixture-data"

export type FixtureLocale = "uk" | "en"

export interface UsersFixtureOptions {
  readonly locale?: FixtureLocale
  /** Компанія, у якій працюють колеги. */
  readonly company: Me["companies"][number]
  /** Ролі проекту, які колеги отримують по черзі (хоча б одна). */
  readonly roles: readonly [string, ...string[]]
  /** Домен email колег; за замовчуванням — `example.com`. */
  readonly emailDomain?: string
}

export interface UsersFixtures {
  readonly users: MockUser[]
  /** Входи, другий крок і блокування колег — стан акаунтів мок-сервера (`MockAccountSeed`). */
  readonly accountSeeds: Record<string, MockAccountSeed>
}

/** Кожен N-й колега налаштував другий крок; кожен M-й ще не входив; ці — заблоковані. */
const TWO_FACTOR_EVERY = 3
const NEVER_SIGNED_IN_EVERY = 7
const BLOCKED_INDEXES: readonly number[] = [5, 11]
const DAY_MS = 24 * 60 * 60_000
const DESKTOP = { type: "desktop", browser: "Chrome", os: "Windows" } as const

const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

/**
 * Пароль, яким ніхто не ввійде. `getRandomValues`, а не `randomUUID`: друге є лише в безпечному
 * контексті, а демо відкривають і з телефона за адресою в мережі (`http://192.168…`).
 */
const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

function seedOf(index: number, locale: FixtureLocale): MockAccountSeed {
  const blocked = BLOCKED_INDEXES.indexOf(index)
  const signedIn = (index + 1) % NEVER_SIGNED_IN_EVERY !== 0
  return {
    signIns: signedIn
      ? [
          {
            id: `fixture-sign-in-${index}`,
            at: ago((index * 37) % 45),
            result: "success",
            method: "password",
            device: DESKTOP,
          },
        ]
      : [],
    ...(blocked >= 0
      ? {
          blocked: {
            at: ago(index),
            by: BLOCKED_BY[locale],
            reason:
              BLOCK_REASONS[blocked % BLOCK_REASONS.length]?.[locale] ?? "",
          },
        }
      : {}),
  }
}

export function createUsersFixtures({
  locale = "uk",
  company,
  roles,
  emailDomain = "example.com",
}: UsersFixtureOptions): UsersFixtures {
  const users = COLLEAGUES.map((colleague, index): MockUser => {
    const position = colleague.position[locale]
    return {
      id: `u-fixture-${String(index + 1).padStart(2, "0")}`,
      name: colleague.name[locale],
      email: `${colleague.email}@${emailDomain}`,
      ...(position ? { position } : {}),
      password: randomPassword(),
      totpCode: "000000",
      roles: [roles[index % roles.length] ?? roles[0]],
      // Права моки рахують із ролей проекту (`lib/mock-team`).
      permissions: [],
      companies: [company],
      companyId: company.id,
      factors: (index + 1) % TWO_FACTOR_EVERY === 0 ? ["totp"] : [],
    }
  })
  const accountSeeds = Object.fromEntries(
    users.map((user, index) => [user.id, seedOf(index, locale)]),
  )
  return { users, accountSeeds }
}
