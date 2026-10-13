import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

export const STORAGE_KEY = "erp-ui:appearance"

export interface AppearanceSeed {
  palette?: string
  theme?: "light" | "dark" | "system"
  density?: "comfortable" | "compact"
  sidebar?: "light" | "dark"
  language?: "uk" | "en"
}

/** Ключ мок-сесії (registry/lib/mocks): вхід без форми. */
export const SESSION_KEY = "erp-ui:mock-session"

/** Користувачі мок-сервера демо (apps/demo/src/mocks/users.ts). */
export const USERS = {
  accountant: "u-olena",
  sales: "u-ivan",
} as const

/**
 * Відкриває демо з наперед заданим виглядом (через localStorage до завантаження сторінки).
 * За замовчуванням — під обліковим записом бухгалтера; `user: null` — гість.
 */
export async function openWith(
  page: Page,
  seed: AppearanceSeed,
  path = "/",
  { user = USERS.accountant }: { user?: string | null } = {},
): Promise<void> {
  await page.addInitScript(
    ([token, key, value, sessionKey, session]) => {
      // Кожен виклик openWith засіває сховище один раз: після reload тест бачить те,
      // що змінив сам (вигляд, вхід, вихід), а не початкові значення.
      const seeded = JSON.parse(
        sessionStorage.getItem("e2e-seeded") ?? "[]",
      ) as string[]
      if (seeded.includes(token)) return
      sessionStorage.setItem("e2e-seeded", JSON.stringify([...seeded, token]))
      localStorage.setItem(key, value)
      if (session) localStorage.setItem(sessionKey, session)
      else localStorage.removeItem(sessionKey)
    },
    [
      crypto.randomUUID(),
      STORAGE_KEY,
      JSON.stringify(seed),
      SESSION_KEY,
      user ? JSON.stringify({ userId: user, stage: "authenticated" }) : "",
    ] as const,
  )
  await page.goto(path)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
}

/** axe за WCAG 2.2 AA (SPEC §10). */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  // Напівпрозорі кадри анімації (діалог, що з'являється) дають хибний контраст.
  // Нескінченні (спінер, скелетон) не чекаємо.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([])
}
