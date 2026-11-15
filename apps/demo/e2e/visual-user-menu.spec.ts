import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { expectNoA11yViolations, openWith } from "./helpers"

// Крок Б11 (ADR-0098): відкрите меню користувача без палітри й щільності і компактні стани секції —
// звичайні кадри сторінок меню не бачать. Набір — як у visual.spec.ts (SCREENSHOT_PAGES=userMenu,
// SCREENSHOTS_DIR).
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
  !process.env.SCREENSHOT_PAGES?.split(",").includes("userMenu")

/** Кадр після кінця анімацій появи меню. */
async function shot(page: Page, name: string) {
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

test.describe("скриншоти кроку Б11 @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const
      const name = (state: string) =>
        `${state}-sapphire-${theme}-${String(width)}`

      test(`user menu without palette ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, seed)
        const sample = page.getByRole("button", {
          name: "Меню користувача: Ігор Савчук",
        })
        await sample.scrollIntoViewIfNeeded()
        await sample.click()
        await expect(
          page.getByRole("menuitemradio", { name: "Темна" }),
        ).toBeVisible()
        await page.mouse.move(0, 0)
        await expectNoA11yViolations(page)
        await shot(page, name("user-menu-no-palette"))
      })

      test(`compact states ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, seed, "/#/states")
        const states = page.getByTestId("compact-states")
        await states.scrollIntoViewIfNeeded()
        await expect(states.getByRole("heading", { level: 3 })).toHaveCount(6)
        await expectNoA11yViolations(page)
        await states.screenshot({
          path: path.join(shotsDir, `${name("compact-states")}.png`),
        })
      })
    }
})
