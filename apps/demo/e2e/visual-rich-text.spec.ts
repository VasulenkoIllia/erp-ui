import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { openWith, type AppearanceSeed } from "./helpers"

// Крок N1b (ADR-0052): поле тексту, список згадок, посилання, стани й показ чужого документа. Набір —
// для звіту кроку (SCREENSHOT_PAGES=richText, SCREENSHOTS_DIR).
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
  !process.env.SCREENSHOT_PAGES?.split(",").includes("richText")

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
    test(`@screenshots поле тексту ${String(width)} ${theme}`, async ({
      page,
    }) => {
      test.skip(skip())
      const seed: AppearanceSeed = { palette: "sapphire", theme }
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, seed, "/#/rich-text")
      const note = page.getByRole("textbox", { name: "Нотатка" })
      await expect(note).toHaveAttribute("contenteditable", "true")
      await note.click()
      await page.keyboard.type("Погоджено, чекаємо договір @", { delay: 5 })
      await expect(page.getByRole("option").first()).toBeVisible()
      await page.keyboard.press("ArrowDown")
      await shot(page, `n1b-mentions-${String(width)}-${theme}`)
      await page.keyboard.press("Enter")
      await page.getByRole("button", { name: "Посилання" }).first().click()
      await expect(page.getByLabel("Адреса посилання")).toBeFocused()
      await page.getByLabel("Адреса посилання").fill("javascript:alert(1)")
      await page.keyboard.press("Enter")
      await expect(page.getByText("Вкажіть адресу")).toBeVisible()
      await shot(page, `n1b-link-${String(width)}-${theme}`)
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: "Зберегти нотатку" }).click()
      await expect(page.getByTestId("rich-text-saved")).toBeVisible()
      await page.evaluate(() => {
        window.scrollTo(0, 0)
      })
      await shot(page, `n1b-saved-${String(width)}-${theme}`)
      await page
        .getByRole("textbox", { name: "Лише читання" })
        .scrollIntoViewIfNeeded()
      await shot(page, `n1b-states-${String(width)}-${theme}`)
      await page.getByTestId("rich-text-hostile").scrollIntoViewIfNeeded()
      await shot(page, `n1b-view-${String(width)}-${theme}`)
    })
