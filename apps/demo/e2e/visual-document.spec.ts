import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import {
  chooseScenario,
  expectNoA11yViolations,
  openWith,
  type AppearanceSeed,
} from "./helpers"

// Крок PF03a (ADR-0057): стани панелі дій документа — відмова сервера з причиною на кнопці й порівняння
// в конфлікті. Набір — для звіту кроку (SCREENSHOT_PAGES=documentStates, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const PAGE = "/#/document?id=doc-2"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("documentStates")
const bar = (page: Page) =>
  page
    .getByTestId("document-card")
    .getByRole("group", { name: "Дії документа" })

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
    test(`@screenshots стани документа ${String(width)} ${theme}`, async ({
      page,
    }) => {
      test.skip(skip())
      const seed: AppearanceSeed = { palette: "sapphire", theme }
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, seed, PAGE)
      await page.getByRole("button", { name: "Колега провів оплату" }).click()
      await expect(
        page.getByTestId("document-card").getByText(/^Оплату проведено/),
      ).toBeVisible()
      await bar(page).getByRole("button", { name: "Скасувати" }).click()
      const confirm = page.getByRole("alertdialog", {
        name: "Скасувати документ?",
      })
      await confirm.getByLabel("Причина").fill("Помилка в сумі")
      await shot(page, `pf03a-confirm-${String(width)}-${theme}`)
      await confirm
        .getByRole("button", { name: "Скасувати документ", exact: true })
        .click()
      await expect(bar(page).getByRole("alert")).toBeVisible()
      await bar(page).scrollIntoViewIfNeeded()
      await expectNoA11yViolations(page)
      await shot(page, `pf03a-refused-${String(width)}-${theme}`)

      await chooseScenario(page, "Конфлікт збереження")
      await bar(page).getByRole("button", { name: "Сторнувати" }).click()
      const reverse = page.getByRole("alertdialog", {
        name: "Сторнувати документ?",
      })
      await reverse.getByLabel("Причина").fill("Повернення товару")
      await reverse
        .getByRole("button", { name: "Сторнувати документ", exact: true })
        .click()
      const conflict = page.getByRole("dialog", {
        name: "Документ змінив інший користувач",
      })
      await expect(
        conflict.getByRole("row", { name: /Сплатити до/ }),
      ).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `pf03a-conflict-${String(width)}-${theme}`)
    })
