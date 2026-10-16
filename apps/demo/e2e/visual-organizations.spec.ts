import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { openWith, type AppearanceSeed } from "./helpers"

// Крок 1.3b (ADR-0024): закріплені рядки списку, «Рядків на сторінці», вкладки картки організації.
// Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const LIST = "/#/organizations"
const CARD = "/#/organizations/org-001"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("organizations")

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

/** Закріпити третій і п'ятий записи: два закріплені вгорі, межа після блоку. */
async function pinTwo(page: Page) {
  const titles = page.locator(
    '[role="row"][data-index] a, article[data-card] a',
  )
  await expect(titles.nth(4)).toBeVisible()
  for (const [count, index] of [
    [1, 2],
    [2, 4],
  ] as const) {
    const name = (await titles.nth(index).textContent()) ?? ""
    await page
      .getByRole("button", { name: `Закріпити вгорі: ${name}`, exact: true })
      .click()
    await expect(page.locator("[data-pinned]")).toHaveCount(count)
  }
  // Знімок — з початку списку й без фокуса на шпильці (фокус прокручує сторінку до неї).
  await page.reload()
  await expect(page.locator("[data-pinned]")).toHaveCount(2)
}

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true })

test.describe("скриншоти кроку 1.3b @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS)
      test(`organizations pinned sapphire ${theme} ${width}`, async ({
        page,
      }) => {
        test.skip(skip())
        await open(page, { palette: "sapphire", theme }, width, LIST)
        await pinTwo(page)
        await shot(page, `organizations-pinned-sapphire-${theme}-${width}`)
      })

  test("organizations page size sapphire light 1440", async ({ page }) => {
    test.skip(skip())
    await open(page, { palette: "sapphire", theme: "light" }, 1440, LIST)
    await page.getByRole("combobox", { name: "Рядків на сторінці" }).click()
    await expect(page.getByRole("option")).toHaveCount(4)
    await shot(page, "organizations-page-size-sapphire-light-1440")
  })

  for (const theme of THEMES)
    for (const width of WIDTHS)
      test(`organization card sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, { palette: "sapphire", theme }, width, CARD)
        await expect(tab(page, "Реквізити")).toBeVisible()
        await shot(page, `organization-card-sapphire-${theme}-${width}`)
      })

  for (const width of [390, 1440] as const)
    test(`organization invoices tab graphite dark ${width}`, async ({
      page,
    }) => {
      test.skip(skip())
      await open(
        page,
        { palette: "graphite", theme: "dark" },
        width,
        `${CARD}?tab=invoices`,
      )
      await expect(
        page.locator('[role="tabpanel"] [data-slot="data-table-status"]'),
      ).toHaveText(/\d рахунк/)
      await shot(page, `organization-invoices-graphite-dark-${width}`)
    })

  test("organization notes tab sapphire light 768", async ({ page }) => {
    test.skip(skip())
    await open(
      page,
      { palette: "sapphire", theme: "light" },
      768,
      `${CARD}?tab=notes`,
    )
    await expect(
      page.getByText(/вкладка проекту з файлу розширення/),
    ).toBeVisible()
    await shot(page, "organization-notes-sapphire-light-768")
  })

  test("organization history tab sapphire light 390", async ({ page }) => {
    test.skip(skip())
    await open(
      page,
      { palette: "sapphire", theme: "light" },
      390,
      `${CARD}?tab=aside`,
    )
    await expect(tab(page, "Історія")).toHaveAttribute("aria-selected", "true")
    await shot(page, "organization-history-sapphire-light-390")
  })
})
