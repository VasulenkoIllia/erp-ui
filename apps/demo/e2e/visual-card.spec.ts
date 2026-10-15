import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import {
  expectNoA11yViolations,
  openWith,
  type AppearanceSeed,
} from "./helpers"

// Крок 0.6d (ADR-0019): картка рахунку на шаблоні Object Page — шапка, етапи, рядки, історія
// праворуч на широкому й вкладкою на вузькому. Набір і теки — як у visual.spec.ts
// (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const only = (key: string) =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
/** Знімок без наведення миші й після переходів (вкладка, що щойно стала активною). */
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
        // Скасована анімація (вкладку перемкнули) відхиляє `finished` — це не збій знімка.
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`) })
}

/** Прострочений рахунок: два пройдені етапи й поточний «Надіслано». */
const OVERDUE = "/#/data?tab=overdue"
/** Перша чернетка: дія «Погодити» в шапці. */
const DRAFT_CARD = "/#/data/inv-02231"

async function openCard(page: Page, seed: AppearanceSeed, width: number) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, OVERDUE)
  await page
    .getByRole("link", { name: /^2026-\d{4}$/ })
    .first()
    .click()
  await ready(page)
}

async function ready(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^(Рахунок №|Invoice) \d{4}-\d{4}$/,
  )
  const section = page.locator('[data-slot="object-page-section"]')
  await expect(
    section
      .locator('[role="row"][data-index]')
      .or(section.getByRole("article"))
      .first(),
  ).toBeVisible()
}

test.describe("скриншоти кроку 0.6d @screenshots", () => {
  for (const theme of THEMES)
    test(`card graphite ${theme} 1440`, async ({ page }) => {
      test.skip(only("card"))
      await openCard(page, { palette: "graphite", theme }, 1440)
      await expectNoA11yViolations(page)
      await shot(page, `card-graphite-${theme}-1440`)
    })

  for (const theme of THEMES)
    test(`card sapphire ${theme} 768`, async ({ page }) => {
      test.skip(only("card"))
      await openCard(page, { palette: "sapphire", theme }, 768)
      await expectNoA11yViolations(page)
      await shot(page, `card-sapphire-${theme}-768`)
    })

  for (const theme of THEMES)
    test(`card draft sapphire ${theme} 390`, async ({ page }) => {
      test.skip(only("card"))
      await page.setViewportSize({ width: 390, height: HEIGHTS[390] ?? 844 })
      await openWith(page, { palette: "sapphire", theme }, DRAFT_CARD)
      await ready(page)
      await expectNoA11yViolations(page)
      await shot(page, `card-draft-sapphire-${theme}-390`)
      await page.getByRole("tab", { name: "Історія" }).click()
      await expect(
        page.getByRole("tabpanel", { name: "Історія" }),
      ).toContainText("Подій ще немає.")
      await shot(page, `card-history-sapphire-${theme}-390`)
    })

  // Крок 1.2 (ADR-0020): секція «Умови оплати» з файлу розширення проекту під рядками.
  for (const theme of THEMES)
    for (const width of [390, 768, 1440])
      test(`card extension sapphire ${theme} ${String(width)}`, async ({
        page,
      }) => {
        test.skip(only("card"))
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, { palette: "sapphire", theme }, DRAFT_CARD)
        await ready(page)
        const terms = page.getByRole("region", { name: "Умови оплати" })
        await terms.scrollIntoViewIfNeeded()
        await expect(terms).toContainText("14 днів")
        await shot(page, `card-extension-sapphire-${theme}-${String(width)}`)
      })

  test("card en compact sapphire light 1440", async ({ page }) => {
    test.skip(only("card"))
    await openCard(
      page,
      {
        palette: "sapphire",
        theme: "light",
        density: "compact",
        language: "en",
      },
      1440,
    )
    await expectNoA11yViolations(page)
    await shot(page, "card-en-compact-sapphire-light-1440")
  })
})
