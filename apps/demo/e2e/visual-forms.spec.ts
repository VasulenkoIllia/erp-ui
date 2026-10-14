import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { expectNoA11yViolations, openWith } from "./helpers"

// Крок 0.5d: календар, період, зведення помилок форми, підтвердження словом, forced-colors.
// Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const only = (key: string) =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
const cases = [
  { palette: "sapphire", theme: "light", width: 390 },
  { palette: "sapphire", theme: "dark", width: 768 },
  { palette: "graphite", theme: "light", width: 1440 },
] as const
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(shotsDir, `${name}.png`) })

test.describe("скриншоти кроку 0.5d @screenshots", () => {
  test.beforeEach(async ({ page }) => {
    // «Сьогодні» в календарі й пресетах — однаковий на всіх скриншотах.
    await page.clock.setFixedTime(new Date("2026-10-14T10:00:00+03:00"))
  })

  for (const { palette, theme, width } of cases) {
    const suffix = `${palette}-${theme}-${width}`

    test(`calendar ${suffix}`, async ({ page }) => {
      test.skip(only("calendar"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/fields")
      await page
        .locator("[data-slot=field]")
        .filter({ hasText: "Дата договору" })
        .getByRole("button", { name: "Вибрати в календарі" })
        .click()
      await expect(
        page.getByRole("dialog").locator("[data-slot=calendar]"),
      ).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `calendar-${suffix}`)
    })

    test(`range ${suffix}`, async ({ page }) => {
      test.skip(only("range"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/fields")
      await page.getByRole("button", { name: "Цей місяць" }).click()
      await expect(
        page.getByRole("group", { name: "Швидкий вибір" }),
      ).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `range-${suffix}`)
    })

    // Крок 0.5d-fix: кома в полі без дробу — підказка під полем.
    test(`whole-number ${suffix}`, async ({ page }) => {
      test.skip(only("whole-number"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/fields")
      const input = page
        .locator("[data-slot=field]")
        .filter({ has: page.getByText("Кількість", { exact: true }) })
        .getByRole("textbox")
      await input.fill("")
      // Поле посередині екрана: підказка під ним, як зазвичай (біля краю вона над полем).
      await input.evaluate((el) => {
        el.scrollIntoView({ block: "center" })
      })
      await input.pressSequentially("12,5")
      const tooltip = page.locator("[data-slot=tooltip-content]")
      await expect(tooltip).toHaveText("Лише ціле число")
      await tooltip.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      )
      await expectNoA11yViolations(page)
      await shot(page, `whole-number-${suffix}`)
    })

    test(`form-errors ${suffix}`, async ({ page }) => {
      test.skip(only("form-errors"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/forms")
      await page
        .getByRole("textbox", { name: "Сума", exact: true })
        .fill("48600")
      await page.getByRole("button", { name: "Зберегти" }).click()
      await expect(page.getByText("Виправте 2 помилки")).toBeVisible()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `form-errors-${suffix}.png`),
        fullPage: true,
      })
    })

    test(`confirm-word ${suffix}`, async ({ page }) => {
      test.skip(only("confirm-word"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/forms")
      await page.getByRole("button", { name: "Видалити компанію" }).click()
      const dialog = page.getByRole("alertdialog", {
        name: "Видалити компанію назавжди?",
      })
      await dialog
        .getByRole("button", { name: "Видалити компанію назавжди" })
        .click()
      await expect(
        dialog.getByText("Введіть «ВИДАЛИТИ» точно, як написано"),
      ).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `confirm-word-${suffix}`)
    })
  }

  // Режим високої контрастності: контур фокуса на полі й на дні календаря.
  for (const width of [390, 1440] as const)
    test(`forced-colors ${width}`, async ({ page }) => {
      test.skip(only("forced-colors"))
      await page.emulateMedia({
        forcedColors: "active",
        reducedMotion: "reduce",
      })
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, {}, "/#/fields")
      await page
        .locator("[data-slot=field]")
        .filter({ hasText: "Дата договору" })
        .getByRole("button", { name: "Вибрати в календарі" })
        .click()
      await page.keyboard.press("ArrowRight")
      await shot(page, `forced-colors-${width}`)
    })
})
