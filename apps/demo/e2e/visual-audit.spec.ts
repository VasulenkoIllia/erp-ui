import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import {
  chooseScenario,
  expectNoA11yViolations,
  openWith,
  type AppearanceSeed,
} from "./helpers"

// Крок A5 (ADR-0045): журнал модуля й шухляда історії запису, зокрема стани всередині діалогу, яких
// звичайні кадри сторінок не бачать. Набір — як у visual.spec.ts (SCREENSHOT_PAGES=auditStates,
// SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const JOURNAL = "/#/m/A5/audit"
const ORGANIZATION = "/#/organizations/org-001?tab=aside"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("auditStates")

const drawer = (page: Page) =>
  page.getByRole("dialog", { name: "Історія запису" })

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
  target: string,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, target)
}

async function openContract(page: Page) {
  await page
    .getByRole("button", { name: /^Історія запису: Договір/ })
    .first()
    .click()
  await expect(drawer(page)).toBeVisible()
}

test.describe("скриншоти кроку A5 @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const
      const name = (state: string) =>
        `audit-${state}-sapphire-${theme}-${String(width)}`

      test(`journal ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, JOURNAL)
        await expect(
          page.getByRole("button", { name: /^Подробиці:/ }).first(),
        ).toBeVisible()
        await shot(page, name("journal"))
      })

      test(`journal details ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, JOURNAL)
        await page
          .getByRole("button", { name: /^Подробиці: Договори: зміна/ })
          .first()
          .click()
        await expect(
          page.getByRole("list", { name: "Що змінилося" }),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("journal-details"))
      })

      test(`drawer ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, JOURNAL)
        await openContract(page)
        await expect(
          drawer(page).getByRole("list", { name: "Що змінилося" }).first(),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("drawer"))
      })

      test(`card ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, ORGANIZATION)
        await page.getByRole("button", { name: "Уся історія" }).click()
        await expect(
          drawer(page).getByRole("list", { name: "Що змінилося" }),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        await shot(page, name("card-drawer"))
      })

      for (const { state, scenario, text } of [
        {
          state: "error",
          scenario: "Помилка сервера",
          text: "Не вдалося завантажити дані",
        },
        {
          state: "forbidden",
          scenario: "Немає доступу",
          text: "Немає доступу",
        },
        { state: "offline", scenario: "Офлайн", text: "Немає з'єднання" },
      ])
        test(`drawer ${state} ${theme} ${width}`, async ({ page }) => {
          test.skip(skip())
          await open(page, seed, width, JOURNAL)
          await expect(
            page
              .getByRole("button", { name: /^Історія запису: Договір/ })
              .first(),
          ).toBeVisible()
          await chooseScenario(page, scenario)
          await openContract(page)
          await expect(drawer(page).getByText(text).first()).toBeVisible()
          await expectNoA11yViolations(page)
          await shot(page, name(`drawer-${state}`))
        })
    }
})
