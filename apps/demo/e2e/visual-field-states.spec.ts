import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { expectNoA11yViolations, openWith } from "./helpers"

// Поле з помилкою у фокусі, рамка помилки в темній темі, посилання з виглядом кнопки й друк із темної
// теми (ADR-0082). Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const WIDTHS = [390, 768, 1440] as const
const THEMES = ["light", "dark"] as const
const only = (key: string) =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(shotsDir, `${name}.png`) })

const INVOICE_CARD = "/#/m/K2/invoices/inv-zoriana-01"
const INVOICES = "/#/m/K2/invoices"

test.describe("скриншоти стану поля, кнопок і друку @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS)
      test(`invalidFocus sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(only("invalidFocus"))
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, { palette: "sapphire", theme }, "/#/forms")
        await page
          .getByTestId("invoice-form")
          .getByRole("button", { name: "Зберегти" })
          .click()
        const summary = page.locator("[data-slot=form-error-summary]")
        await expect(summary).toBeFocused()
        // Друге поле з помилкою — у фокусі, перше й третє — без нього: видно обидва стани поруч.
        await summary
          .getByRole("button", { name: "Контрагент: Заповніть це поле" })
          .click()
        await expect(
          page.getByRole("textbox", { name: "Контрагент", exact: true }),
        ).toBeFocused()
        await expectNoA11yViolations(page)
        await shot(page, `invalidFocus-sapphire-${theme}-${width}`)
      })

  for (const theme of THEMES)
    for (const width of WIDTHS)
      test(`invoiceActions graphite ${theme} ${width}`, async ({ page }) => {
        test.skip(only("invoiceActions"))
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, { palette: "graphite", theme }, INVOICE_CARD)
        await expect(
          page.getByRole("link", { name: "Змінити", exact: true }),
        ).toBeVisible()
        await shot(page, `invoiceActions-graphite-${theme}-${width}`)
      })

  for (const theme of THEMES)
    test(`invoicesPrint sapphire ${theme} 1440`, async ({ page }) => {
      test.skip(only("invoicesPrint"))
      await page.setViewportSize({ width: 1440, height: 900 })
      await openWith(page, { palette: "sapphire", theme }, INVOICES)
      await expect(page.locator('[data-slot="data-table-status"]')).toHaveText(
        /\d рахунк/,
      )
      // Папір: та сама сторінка в режимі друку однакова з обох тем.
      await page.emulateMedia({ media: "print" })
      // Перехід кольорів після зміни теми (150 мс) — папір без нього: знімок після його кінця.
      // Лише переходи: нескінченна анімація (спінер, скелет) не закінчується ніколи.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((motion) => motion instanceof CSSTransition)
            .map((motion) => motion.finished),
        ),
      )
      await shot(page, `invoicesPrint-sapphire-${theme}-1440`)
    })
})
