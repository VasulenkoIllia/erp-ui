import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { expectNoA11yViolations, openWith } from "./helpers"

// Крок 0.6c2 (ADR-0018): вибір рядків, підтвердження, прогрес і підсумок фонової задачі,
// редагування в комірці. Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
// Годинник не фіксуємо: мок-задача рахує записи за часом.
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const only = (key: string) =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(shotsDir, `${name}.png`) })

const DRAFTS = "/#/data?tab=draft"
const JOB_TIMEOUT_MS = 15_000
const count = (page: Page) => page.locator('[data-slot="data-table-status"]')
const jobToast = (page: Page) =>
  page.locator("[data-sonner-toast]").filter({ hasText: "Погодження рахунків" })

async function open(
  page: Page,
  palette: "sapphire" | "graphite",
  theme: (typeof THEMES)[number],
  width: number,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, { palette, theme }, DRAFTS)
  await expect(count(page)).toHaveText("1 229 рахунків")
}

/** Усі чернетки, крім першої, і діалог підтвердження. */
async function confirmAllButFirst(page: Page) {
  await page.getByRole("checkbox", { name: "Вибрати всі за фільтром" }).click()
  await page
    .getByRole("checkbox", { name: "Вибрати рахунок 2026-2231" })
    .click()
  await page.getByRole("button", { name: "Погодити", exact: true }).click()
  return page.getByRole("alertdialog", { name: "Погодити 1 228 рахунків?" })
}

test.describe("скриншоти кроку 0.6c2 @screenshots", () => {
  for (const theme of THEMES)
    test(`bulk-confirm graphite ${theme} 1440`, async ({ page }) => {
      test.skip(only("bulk"))
      await open(page, "graphite", theme, 1440)
      const dialog = await confirmAllButFirst(page)
      await expect(dialog).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `bulk-confirm-graphite-${theme}-1440`)
    })

  for (const theme of THEMES)
    test(`bulk-progress sapphire ${theme} 768`, async ({ page }) => {
      test.skip(only("bulk"))
      await open(page, "sapphire", theme, 768)
      const dialog = await confirmAllButFirst(page)
      await dialog.getByRole("button", { name: /^Погодити 1/ }).click()
      await expect(jobToast(page)).toContainText(/[1-9][\d\s]* з 1\s228/)
      await shot(page, `bulk-progress-sapphire-${theme}-768`)
    })

  for (const theme of THEMES)
    test(`bulk-result sapphire ${theme} 1440`, async ({ page }) => {
      test.skip(only("bulk"))
      await open(page, "sapphire", theme, 1440)
      const dialog = await confirmAllButFirst(page)
      await dialog.getByRole("button", { name: /^Погодити 1/ }).click()
      await expect(jobToast(page)).toContainText("не погоджено", {
        timeout: JOB_TIMEOUT_MS,
      })
      await shot(page, `bulk-result-sapphire-${theme}-1440`)
      await jobToast(page).getByRole("button", { name: "Подробиці" }).click()
      await expect(
        page.getByRole("dialog", { name: /^Не вдалося/ }),
      ).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `bulk-details-sapphire-${theme}-1440`)
    })

  for (const theme of THEMES)
    test(`bulk-cards sapphire ${theme} 390`, async ({ page }) => {
      test.skip(only("bulk"))
      await open(page, "sapphire", theme, 390)
      for (const number of ["2026-2231", "2026-4637"])
        await page
          .getByRole("checkbox", { name: `Вибрати рахунок ${number}` })
          .click()
      await page
        .locator('[data-slot="data-table-selection"]')
        .scrollIntoViewIfNeeded()
      await expectNoA11yViolations(page)
      await shot(page, `bulk-cards-sapphire-${theme}-390`)
    })

  for (const theme of THEMES)
    test(`inline-edit graphite ${theme} 1440`, async ({ page }) => {
      test.skip(only("bulk"))
      await open(page, "graphite", theme, 1440)
      await page
        .getByRole("button", { name: /^ТОВ «Смарт Логістик»\s?, змінити$/ })
        .first()
        .click()
      const input = page.getByRole("textbox", { name: "Клієнт" })
      await input.fill("")
      await input.press("Enter")
      const tooltip = page.locator("[data-slot=tooltip-content]")
      await expect(tooltip).toHaveText("Заповніть це поле")
      await tooltip.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      )
      await shot(page, `inline-edit-graphite-${theme}-1440`)
    })
})
