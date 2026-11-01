import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { openWith, type AppearanceSeed } from "./helpers"

// Крок N1a (ADR-0051): сторінка реального часу й картка рахунку, поки запис редагує колега. Набір — для
// звіту кроку (SCREENSHOT_PAGES=realtimeStates, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const PAGE = "/#/realtime"
const INVOICE = "#/data/inv-00001"
const NOTICE = /Запис зараз редагує Марта Шевчук/
const notice = (page: Page) =>
  page.locator('[data-slot="edit-lock-notice"]').getByText(NOTICE)
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("realtimeStates")

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

for (const width of WIDTHS)
  for (const theme of THEMES)
    test(`@screenshots реальний час ${String(width)} ${theme}`, async ({
      page,
    }) => {
      test.skip(skip())
      const seed: AppearanceSeed = { palette: "sapphire", theme }
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, seed, PAGE)
      await expect(page.getByTestId("realtime-status")).toHaveText("Підключено")
      await page.getByRole("button", { name: "Колега змінює рахунок" }).click()
      await expect(page.getByTestId("realtime-version")).toHaveText("2")
      await page
        .getByRole("button", { name: "Колега почав редагувати" })
        .click()
      await expect(notice(page)).toBeVisible()
      await shot(page, `n1a-realtime-${String(width)}-${theme}`)
      await page.evaluate((target) => {
        window.location.hash = target
      }, INVOICE)
      // Смуга є й на сторінці, з якої йдемо: спершу дочекатись картки.
      await expect(page.getByTestId("realtime-status")).toBeHidden()
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expect(notice(page)).toBeVisible()
      await shot(page, `n1a-invoice-locked-${String(width)}-${theme}`)
    })
