import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import {
  expectNoA11yViolations,
  openWith,
  type AppearanceSeed,
} from "./helpers"

// Крок A6 (ADR-0047): списки модуля, форма з частинами оплати, помилка суми, типові значення зі змінами
// й липка панель у демо «Форми». Набір — як у visual.spec.ts (SCREENSHOT_PAGES=dictionaries,
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
  !process.env.SCREENSHOT_PAGES?.split(",").includes("dictionaries")

const LISTS = [
  ["taxes", "ПДВ 20%"],
  ["units", "Кілограм"],
  ["payment-terms", "Відстрочка 30 днів"],
  ["tags", "Терміново"],
  ["reasons", "Брак товару"],
] as const

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
  to: string,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, to)
}

for (const theme of THEMES)
  for (const width of WIDTHS) {
    const seed: AppearanceSeed = { theme, palette: "sapphire" }
    const name = (key: string) => `a6-${key}-sapphire-${theme}-${width}`

    test.describe(`скриншоти кроку A6 ${theme} ${width} @screenshots`, () => {
      for (const [list, row] of LISTS)
        test(`list ${list}`, async ({ page }) => {
          test.skip(skip())
          await open(page, seed, width, `/#/m/A6/${list}`)
          await expect(page.getByText(row).first()).toBeVisible()
          await expectNoA11yViolations(page)
          await shot(page, name(list))
        })

      test("payment form", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A6/payment-terms")
        await page
          .getByRole("button", {
            name: "Змінити: Половина наперед, решта після поставки",
          })
          .click()
        const form = page.getByRole("dialog", { name: "Зміна умов оплати" })
        await form.getByRole("button", { name: "Додати код" }).click()
        await expectNoA11yViolations(page)
        await shot(page, name("payment-form"))
        await form.getByRole("button", { name: "Вилучити: Частина 2" }).click()
        await form.getByRole("button", { name: "Зберегти" }).click()
        await expect(
          form.locator('[data-slot="form-error-summary"]'),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("payment-form-error"))
      })

      test("tax form", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A6/taxes")
        await page.getByRole("button", { name: "Змінити: ПДВ 20%" }).click()
        await expect(
          page.getByRole("dialog", { name: "Зміна податку" }),
        ).toBeVisible()
        await shot(page, name("tax-form"))
      })

      test("disable default", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A6/units")
        await page.getByRole("button", { name: "Вимкнути: Штука" }).click()
        await expect(
          page.getByRole("alertdialog", { name: "Вимкнути типове значення?" }),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("disable-default"))
      })

      test("defaults dirty", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/m/A6/defaults")
        await page
          .getByRole("combobox", { name: "Типова одиниця виміру", exact: true })
          .click()
        await page.getByRole("option", { name: "Кілограм" }).click()
        await expect(
          page.locator('[data-slot="save-bar"]').getByRole("status"),
        ).toHaveText("Є незбережені зміни")
        await expectNoA11yViolations(page)
        await shot(page, name("defaults-dirty"))
      })

      test("sticky bar", async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, "/#/forms")
        const form = page.getByTestId("rows-form")
        await form.evaluate((element) => {
          const top = element.getBoundingClientRect().top + window.scrollY - 90
          window.scrollTo({ top, behavior: "instant" })
        })
        await form.getByLabel("Назва").first().fill("Новий етап")
        await shot(page, name("sticky-bar"))
      })
    })
  }
