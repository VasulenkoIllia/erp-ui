import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { expectNoA11yViolations, openWith } from "./helpers"

// Крок UI11a (ADR-0101): поле з двома фото й рамкою, відкриті варіанти картки. Порожня сторінка — visual.spec.ts.
// Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const skipped = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("photosFilled")
const cases = [
  { theme: "light", width: 390 },
  { theme: "dark", width: 390 },
  { theme: "light", width: 768 },
  { theme: "dark", width: 768 },
  { theme: "light", width: 1440 },
  { theme: "dark", width: 1440 },
] as const

/** Фото товару, намальоване в браузері: тло, предмет і тінь. */
async function productPng(page: Page, color: string): Promise<Buffer> {
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement("canvas")
    canvas.width = 1200
    canvas.height = 900
    const context = canvas.getContext("2d")
    if (!context) throw new Error("no canvas")
    context.fillStyle = "whitesmoke"
    context.fillRect(0, 0, 1200, 900)
    context.fillStyle = fill
    context.fillRect(420, 220, 360, 420)
    context.fillStyle = "gainsboro"
    context.fillRect(380, 680, 440, 24)
    return canvas.toDataURL("image/png").slice("data:image/png;base64,".length)
  }, color)
  return Buffer.from(base64, "base64")
}

test.describe("скриншоти кроку UI11a @screenshots", () => {
  for (const { theme, width } of cases)
    test(`photos-filled sapphire ${theme} ${width}`, async ({ page }) => {
      test.skip(skipped())
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette: "sapphire", theme }, "/#/photos")
      // Друге поле на сторінці — недоступне.
      const field = page.locator('[data-slot="photo-input"]').first()
      await field.getByTestId("photo-input-file").setInputFiles([
        {
          name: "front.png",
          mimeType: "image/png",
          buffer: await productPng(page, "royalblue"),
        },
        {
          name: "side.png",
          mimeType: "image/png",
          buffer: await productPng(page, "forestgreen"),
        },
      ])
      await expect(
        page.getByRole("list", { name: "Вибрані фото" }).getByRole("listitem"),
      ).toHaveCount(2)
      await field.getByRole("application").focus()
      await page.keyboard.press("ArrowDown")
      await page
        .getByRole("list", { name: "Результати пошуку" })
        .getByRole("article")
        .first()
        .getByText("4 варіанти")
        .click()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `photos-filled-sapphire-${theme}-${String(width)}.png`,
        ),
        fullPage: true,
      })
    })
})
