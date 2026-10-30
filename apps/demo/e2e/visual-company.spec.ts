import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { USERS, chooseScenario, openWith, type AppearanceSeed } from "./helpers"

// Крок A1a (ADR-0043): стани модуля A1, яких звичайні кадри сторінок не бачать: вкладка «Локалізація»,
// конфлікт збереження, форми в діалозі, курс із зайнятою датою. Набір — як у visual.spec.ts
// (SCREENSHOT_PAGES=companyStates, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const LOCALE = "/#/m/A1/company?tab=locale"
const CURRENCIES = "/#/m/A1/currencies"
const RATES = "/#/m/A1/exchange-rates"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("companyStates")

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
  target: string,
  user: string = USERS.accountant,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, target, { user })
}

test.describe("скриншоти кроку A1a @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const
      const name = (state: string) =>
        `company-${state}-sapphire-${theme}-${String(width)}`

      test(`locale ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, LOCALE)
        await expect(
          page.getByRole("button", { name: "Зберегти локалізацію" }),
        ).toBeVisible()
        await shot(page, name("locale"))
      })

      test(`locale read-only ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, LOCALE, USERS.sales)
        await expect(
          page.getByText("Змінювати локалізацію може той"),
        ).toBeVisible()
        await shot(page, name("locale-readonly"))
      })

      test(`locale conflict ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, LOCALE)
        await chooseScenario(page, "Конфлікт збереження")
        await page.getByRole("combobox", { name: "Мова документів" }).click()
        await page.getByRole("option", { name: "English" }).click()
        await page.getByRole("button", { name: "Зберегти локалізацію" }).click()
        await expect(page.getByRole("alert").first()).toBeVisible()
        await shot(page, name("locale-conflict"))
      })

      test(`currency form ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, CURRENCIES)
        await page.getByRole("button", { name: "Додати валюту" }).click()
        await expect(
          page.getByRole("dialog", { name: "Нова валюта" }),
        ).toBeVisible()
        await shot(page, name("currency-form"))
      })

      test(`rate form duplicate ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, RATES)
        await page.getByRole("button", { name: "Додати курс" }).click()
        const dialog = page.getByRole("dialog", { name: "Новий курс" })
        await dialog.getByLabel(/^Курс:/).fill("41,25")
        await dialog.getByRole("button", { name: "Створити" }).click()
        await expect(dialog.locator('[data-slot="field-error"]')).toBeVisible()
        await shot(page, name("rate-duplicate"))
      })

      test(`rate delete ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, `${RATES}?source=manual`)
        await page
          .getByRole("button", { name: /^Видалити курс/ })
          .first()
          .click()
        await expect(page.getByRole("alertdialog")).toBeVisible()
        await shot(page, name("rate-delete"))
      })
    }
})
