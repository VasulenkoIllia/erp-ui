import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { USERS, openWith, type AppearanceSeed } from "./helpers"

// Крок 1.3a (ADR-0023): відкритий вибір запису, шторка на телефоні, «Створити…», дія без права й
// помилка списку. Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const PATH = "/#/pickers"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("pickers")

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
  user: string = USERS.accountant,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, PATH, { user })
}

const company = (page: Page) =>
  page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { name: "Контакт і компанія" }) })
    .locator("[data-slot=record-picker] > button")
    .first()

test.describe("скриншоти кроку 1.3a @screenshots", () => {
  for (const theme of THEMES)
    for (const width of [768, 1440] as const)
      test(`picker open sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, { palette: "sapphire", theme }, width)
        await company(page).click()
        await page
          .getByRole("combobox", { name: "Пошук: Компанія" })
          .fill("агро")
        await expect(page.getByRole("option")).toHaveCount(4)
        await shot(page, `pickers-open-sapphire-${theme}-${width}`)
      })

  for (const theme of THEMES)
    test(`picker sheet sapphire ${theme} 390`, async ({ page }) => {
      test.skip(skip())
      await open(page, { palette: "sapphire", theme }, 390)
      await company(page).click()
      await expect(
        page.getByText("Показано 20 з 31. Уточніть пошук."),
      ).toBeVisible()
      await shot(page, `pickers-sheet-sapphire-${theme}-390`)
    })

  test("picker create dialog sapphire light 1440", async ({ page }) => {
    test.skip(skip())
    await open(page, { palette: "sapphire", theme: "light" }, 1440)
    await company(page).click()
    await page.getByRole("combobox", { name: "Пошук: Компанія" }).fill("Зоря")
    await page.getByRole("option", { name: "Створити «Зоря»" }).click()
    await expect(
      page.getByRole("dialog", { name: "Нова організація" }),
    ).toBeVisible()
    await shot(page, "pickers-create-sapphire-light-1440")
  })

  test("picker create denied sapphire light 1440", async ({ page }) => {
    test.skip(skip())
    await open(page, { palette: "sapphire", theme: "light" }, 1440, USERS.sales)
    await company(page).click()
    await expect(
      page.getByRole("option", { name: /Створити новий…/ }),
    ).toHaveAttribute("aria-disabled", "true")
    await shot(page, "pickers-denied-sapphire-light-1440")
  })

  test("picker error graphite dark 1440", async ({ page }) => {
    test.skip(skip())
    await page.addInitScript(() => {
      localStorage.setItem(
        "erp-ui:mock-scenarios",
        JSON.stringify({
          global: "success",
          resources: { organizations: "error" },
        }),
      )
    })
    await open(page, { palette: "graphite", theme: "dark" }, 1440)
    await company(page).click()
    await expect(
      page.getByText("Не вдалося завантажити варіанти"),
    ).toBeVisible()
    await shot(page, "pickers-error-graphite-dark-1440")
  })
})
