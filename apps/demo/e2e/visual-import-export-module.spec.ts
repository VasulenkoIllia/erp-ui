import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import {
  expectNoA11yViolations,
  openWith,
  type AppearanceSeed,
} from "./helpers"

// Модуль A4 (ADR-0050): цілі, вибір рядка заголовків, діалог експорту, історія й подробиці запуску.
// Набір — як у visual.spec.ts (SCREENSHOT_PAGES=import-export-module, SCREENSHOTS_DIR).
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
  !process.env.SCREENSHOT_PAGES?.split(",").includes("import-export-module")

const CSV = [
  "Контакти з виставки у Львові, жовтень 2026;;;",
  "Ім'я;Посада;Телефон;Email",
  "Марія Шевчук;Директорка;067 123 45 67;maria@zoriana.example",
  "Петро Бондар;;;petro@zoriana.example",
].join("\n")

async function shot(page: Page, name: string) {
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
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`) })
}

async function open(
  page: Page,
  seed: AppearanceSeed,
  width: number,
  to: string,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, to)
}

for (const theme of THEMES)
  for (const width of WIDTHS) {
    const seed: AppearanceSeed = { theme, palette: "sapphire" }
    const name = (key: string) => `a4b-${key}-sapphire-${theme}-${width}`

    test.describe(`скриншоти кроку A4b ${theme} ${width} @screenshots`, () => {
      test("targets", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A4/import-export")
        await expect(page.getByText("Одиниці виміру").first()).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("targets"))
      })

      test("header row", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A4/import-export/contacts")
        await page.getByTestId("file-drop-input").setInputFiles({
          name: "виставка.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(CSV),
        })
        const select = page.getByRole("combobox", {
          name: "Рядок із назвами колонок",
        })
        await select.click()
        await page
          .getByRole("option", { name: /^Рядок 2: Ім'я, Посада/ })
          .click()
        await expect(select).toContainText("Рядок 2")
        await expectNoA11yViolations(page)
        await shot(page, name("header-row"))
      })

      test("export", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A4/import-export")
        await page
          .getByRole("button", { name: "Експортувати: Контакти" })
          .click()
        await expect(
          page.getByRole("dialog", { name: "Експорт: Контакти" }),
        ).toBeVisible()
        await shot(page, name("export"))
      })

      test("history", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A4/import-history")
        await expect(page.getByText("контрагенти.csv").first()).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("history"))
      })

      test("details", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A4/import-history")
        await page
          .getByRole("button", { name: "Подробиці запуску: контрагенти.csv" })
          .click()
        await expect(
          page.getByRole("dialog", { name: "контрагенти.csv" }),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("details"))
      })
    })
  }
