import { test } from "@playwright/test"
import path from "node:path"

import { expectNoA11yViolations, openWith } from "./helpers"

const PALETTES = [
  "sapphire",
  "graphite",
  "indigo",
  "teal",
  "terracotta",
] as const
const THEMES = ["light", "dark"] as const
const DENSITIES = ["comfortable", "compact"] as const

// SPEC §18: перевірка на 360/768/1440; скриншоти для власника — 390/768/1440 (WAVE-0).
const CHECK_WIDTHS = [360, 768, 1440] as const
const SHOT_WIDTHS = [390, 768, 1440] as const
const SHOT_PALETTES = ["sapphire", "graphite"] as const
const HEIGHTS: Record<number, number> = {
  360: 780,
  390: 844,
  768: 1024,
  1440: 900,
}

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)

test.describe("axe: усі палітри × теми × щільності", () => {
  for (const palette of PALETTES)
    for (const theme of THEMES)
      for (const density of DENSITIES)
        test(`${palette} ${theme} ${density}`, async ({ page }) => {
          await page.setViewportSize({ width: 1440, height: 900 })
          await openWith(page, { palette, theme, density })
          await expectNoA11yViolations(page)
        })
})

test.describe("axe: контрольні ширини", () => {
  for (const width of CHECK_WIDTHS)
    for (const theme of THEMES)
      test(`${width}px ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, { palette: "sapphire", theme })
        await expectNoA11yViolations(page)
      })
})

test.describe("скриншоти @screenshots", () => {
  for (const palette of SHOT_PALETTES)
    for (const theme of THEMES)
      for (const width of SHOT_WIDTHS)
        test(`${palette} ${theme} ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
          await openWith(page, { palette, theme })
          await expectNoA11yViolations(page)
          await page.screenshot({
            path: path.join(shotsDir, `${palette}-${theme}-${width}.png`),
            fullPage: true,
          })
        })
})
