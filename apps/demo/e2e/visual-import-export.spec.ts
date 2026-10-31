import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import {
  expectNoA11yViolations,
  openWith,
  type AppearanceSeed,
} from "./helpers"

// Крок A4a (ADR-0049): вибір файла, кроки майстра імпорту й діалог експорту. Набір — як у
// visual.spec.ts (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("import-export")

const CSV = [
  "Артикул;Назва;Ціна;Дата випуску",
  "SKU-001;Кавоварка нова;4300;10.02.2026",
  "SKU-100;Набір ложок;1 250,50;15.03.2026",
  "SKU-101;Без ціни;;",
  "SKU-102;Ложка;1,234;31.02.2026",
  "SKU-103;Тарілка;99;",
].join("\n")

async function shot(page: Page, name: string, locator: string) {
  await page.mouse.move(0, 0)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  await page
    .locator(locator)
    .last()
    .screenshot({ path: path.join(shotsDir, `${name}.png`) })
}

const wizard = (page: Page) => page.locator('[data-slot="wizard"]')

for (const theme of THEMES)
  for (const width of WIDTHS) {
    const seed: AppearanceSeed = { theme, palette: "sapphire" }
    const name = (key: string) => `a4a-${key}-sapphire-${theme}-${width}`

    test.describe(`скриншоти кроку A4a ${theme} ${width} @screenshots`, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(skip())
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, seed, "/#/import-export")
      })

      test("майстер", async ({ page }) => {
        const next = (label = "Далі") =>
          wizard(page).getByRole("button", { name: label }).click()
        await wizard(page)
          .getByTestId("file-drop-input")
          .setInputFiles({
            name: "товари.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(CSV),
          })
        await expect(wizard(page).getByText("5 рядків")).toBeVisible()
        await shot(page, name("file"), '[data-slot="wizard"]')
        await next()
        const mapping = wizard(page).getByRole("heading", { name: /Колонки/ })
        await expect(mapping).toBeFocused()
        await shot(page, name("mapping"), '[data-slot="wizard"]')
        await next()
        const check = wizard(page).getByRole("heading", { name: /Перевірка/ })
        await expect(check).toBeFocused()
        await expectNoA11yViolations(page)
        await shot(page, name("check"), '[data-slot="wizard"]')
        await next()
        const preview = wizard(page).getByRole("heading", { name: /Перегляд/ })
        await expect(preview).toBeFocused()
        await expectNoA11yViolations(page)
        await shot(page, name("preview"), '[data-slot="wizard"]')
        await next("Імпортувати 2 записи")
        await expect(
          wizard(page).getByText("Створено 2, оновлено 0, пропущено 1"),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("report"), '[data-slot="wizard"]')
      })

      test("діалог експорту", async ({ page }) => {
        await page
          .getByRole("button", { name: "Експорт двох вибраних" })
          .click()
        await expect(page.getByRole("dialog")).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("export"), '[role="dialog"]')
      })

      test("стани вибору файла", async ({ page }) => {
        await expectNoA11yViolations(page)
        await page
          .getByRole("group", { name: "Файл договору" })
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(shotsDir, `${name("file-states")}.png`),
        })
      })
    })
  }
