import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

export const STORAGE_KEY = "erp-ui:appearance"

export interface AppearanceSeed {
  palette?: string
  theme?: "light" | "dark" | "system"
  density?: "comfortable" | "compact"
  sidebar?: "light" | "dark"
}

/** Відкриває демо з наперед заданим виглядом (через localStorage до завантаження сторінки). */
export async function openWith(
  page: Page,
  seed: AppearanceSeed,
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value)
    },
    [STORAGE_KEY, JSON.stringify(seed)] as const,
  )
  await page.goto("/")
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
}

/** axe за WCAG 2.2 AA (SPEC §10). */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([])
}
