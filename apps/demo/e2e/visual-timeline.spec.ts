import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { openWith, type AppearanceSeed } from "./helpers"

// Крок N1c (ADR-0053): стрічка запису, повідомлення, файл, дії, підписники, лише перегляд, порожньо.
// Набір — для звіту кроку (SCREENSHOT_PAGES=timeline, SCREENSHOTS_DIR).
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
  !process.env.SCREENSHOT_PAGES?.split(",").includes("timeline")

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
    test(`@screenshots стрічка запису ${String(width)} ${theme}`, async ({
      page,
    }) => {
      test.skip(skip())
      const seed: AppearanceSeed = { palette: "sapphire", theme }
      const suffix = `${String(width)}-${theme}`
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, seed, "/#/timeline")
      const full = page.getByTestId("timeline-full")
      const composer = full.locator('[data-slot="timeline-composer"]')
      const entries = full.locator('[data-slot="timeline-entry"]')
      await expect(
        composer.getByRole("textbox", { name: "Нотатка для команди" }),
      ).toHaveAttribute("contenteditable", "true")
      await expect(entries.first()).toBeVisible()
      await full.scrollIntoViewIfNeeded()
      await shot(page, `n1c-top-${suffix}`)

      await full.getByRole("tab", { name: "Повідомлення" }).click()
      await expect(composer).toHaveAttribute("data-kind", "message")
      await composer.scrollIntoViewIfNeeded()
      await shot(page, `n1c-message-${suffix}`)
      await full.getByRole("tab", { name: "Нотатка" }).click()

      await entries.nth(1).scrollIntoViewIfNeeded()
      await shot(page, `n1c-entries-${suffix}`)
      await entries.nth(5).scrollIntoViewIfNeeded()
      await shot(page, `n1c-more-entries-${suffix}`)

      await full.getByRole("button", { name: "Запланувати" }).click()
      const activity = page.getByRole("dialog", { name: "Запланувати дію" })
      await expect(activity).toBeVisible()
      await shot(page, `n1c-activity-${suffix}`)
      await page.keyboard.press("Escape")
      await expect(activity).toBeHidden()

      await full.getByRole("button", { name: /\d підписник/ }).click()
      const followers = page.getByRole("dialog", { name: "Підписники" })
      await expect(followers).toBeVisible()
      await shot(page, `n1c-followers-${suffix}`)
      await page.keyboard.press("Escape")
      await expect(followers).toBeHidden()

      await page.getByTestId("timeline-read-only").scrollIntoViewIfNeeded()
      await shot(page, `n1c-read-only-${suffix}`)
      await page.getByTestId("timeline-narrow").scrollIntoViewIfNeeded()
      await shot(page, `n1c-empty-${suffix}`)
    })
