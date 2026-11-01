import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { openWith, type AppearanceSeed } from "./helpers"

// Оновлення сторінки після збою чанка (ADR-0055): стан сторінки, попередження про незбережені зміни,
// «Оновлення не допомогло», поле тексту. Набір — для звіту кроку (SCREENSHOT_PAGES=chunkReload,
// SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const DATA_CHUNK = /\/DataPage-[\w-]+\.js$/
const EDITOR_CHUNK = /rich-text-editor[^/]*\.(js|tsx)/
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("chunkReload")

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(shotsDir, `${name}.png`) })

for (const width of WIDTHS)
  for (const theme of THEMES)
    test(`@screenshots збій чанка ${String(width)} ${theme}`, async ({
      page,
    }) => {
      test.skip(skip())
      const seed: AppearanceSeed = { palette: "sapphire", theme }
      const suffix = `${String(width)}-${theme}`
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      const block = (chunks: RegExp) =>
        page
          .context()
          .route(chunks, (route) => route.abort("internetdisconnected"))

      await openWith(page, seed)
      await block(DATA_CHUNK)
      await page.goto("/#/data")
      const failure = page.getByRole("alert")
      await expect(failure).toContainText("Потрібно оновити сторінку")
      await shot(page, `page-${suffix}`)

      await Promise.all([
        page.waitForEvent("load"),
        failure.getByRole("button", { name: "Оновити сторінку" }).click(),
      ])
      await expect(failure).toContainText("Оновлення не допомогло")
      await shot(page, `futile-${suffix}`)
      await page.context().unroute(DATA_CHUNK)

      await page.goto("/#/states")
      await page
        .getByRole("checkbox", { name: "Форма поруч має незбережені зміни" })
        .click()
      const section = page.getByTestId("chunk-failure")
      await section.getByRole("button", { name: "Оновити сторінку" }).click()
      await expect(
        section.getByRole("button", { name: "Не оновлювати" }),
      ).toBeFocused()
      await section.scrollIntoViewIfNeeded()
      await shot(page, `unsaved-${suffix}`)

      await block(EDITOR_CHUNK)
      await page.goto("/#/rich-text")
      await expect(
        page.getByRole("button", { name: "Оновити сторінку" }).first(),
      ).toBeVisible()
      await shot(page, `rich-text-${suffix}`)
    })
