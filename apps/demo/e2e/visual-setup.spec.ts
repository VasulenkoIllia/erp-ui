import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { USERS, openWith, type AppearanceSeed } from "./helpers"

// Крок A1b (ADR-0044): майстер першого запуску, чек-лист і дії запису в палітрі. Діалог палітри й
// кроки майстра звичайні кадри сторінок не бачать. Набір — як у visual.spec.ts (SCREENSHOT_PAGES=setupStates,
// SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const WIZARD = "/#/m/A1/setup"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("setupStates")

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

const next = (page: Page) =>
  page.getByRole("button", { name: "Далі", exact: true })
const stepHeading = (page: Page, name: RegExp) =>
  page.getByRole("heading", { level: 2, name })
const palette = (page: Page) =>
  page.getByRole("dialog", { name: "Палітра команд" })
/** Кнопка в топбарі, бо на телефоні клавіатури немає. */
const openPalette = async (page: Page) => {
  await page.getByRole("button", { name: "Пошук і команди" }).click()
  await expect(palette(page).getByRole("option").first()).toBeVisible()
}

test.describe("скриншоти кроку A1b @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const
      const name = (state: string) =>
        `setup-${state}-sapphire-${theme}-${String(width)}`

      test(`wizard requisites ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, WIZARD)
        await page.getByLabel(/Коротка назва/).fill("")
        await next(page).click()
        await expect(page.getByText("Заповніть це поле").first()).toBeVisible()
        await shot(page, name("wizard-requisites"))
      })

      test(`wizard brand ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, WIZARD)
        await next(page).click()
        await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()
        await shot(page, name("wizard-brand"))
      })

      test(`wizard team ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, `${WIZARD}?step=team`)
        await expect(stepHeading(page, /Колеги/)).toBeVisible()
        await expect(
          page.getByRole("button", { name: "Запросити колегу" }),
        ).toBeVisible()
        await shot(page, name("wizard-team"))
      })

      test(`wizard review ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, WIZARD)
        await next(page).click()
        await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()
        await next(page).click()
        await expect(stepHeading(page, /Колеги/)).toBeVisible()
        await next(page).click()
        await expect(stepHeading(page, /Огляд/)).toBeVisible()
        await shot(page, name("wizard-review"))
      })

      test(`checklist ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/setup")
        await expect(page.getByText("Зроблено 2 з 3")).toBeVisible()
        await shot(page, name("checklist"))
      })

      test(`palette record ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A1/company")
        await expect(page.getByRole("tablist").last()).toBeVisible()
        await openPalette(page)
        await shot(page, name("palette-record"))
      })

      test(`palette denied ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A1/company", USERS.sales)
        await expect(page.getByRole("tablist").last()).toBeVisible()
        await openPalette(page)
        await shot(page, name("palette-denied"))
      })
    }
})
