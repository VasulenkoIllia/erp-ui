import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { USERS, openWith, type AppearanceSeed } from "./helpers"

// Крок 1.4b2 (ADR-0027): довідник сегментів B1, форма сегмента з назвою, яка вже є, мультивибір
// сегментів у формі організації, мультивибір кіта на сторінці «Вибір і реквізити». Набір і теки —
// як у visual.spec.ts (SCREENSHOT_PAGES=contactsSegments, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const SEGMENTS = "/#/m/B1/segments"
const LEGAL_CARD = "/#/m/B1/organizations/org-013"
const PICKERS = "/#/pickers"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("contactsSegments")

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
  user: string = USERS.accountant,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, target, { user })
}

const dialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true })

test.describe("скриншоти кроку 1.4b2 @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const

      test(`segments list sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, SEGMENTS)
        await expect(
          page.getByRole("button", { name: "Змінити сегмент «Клієнт»" }),
        ).toBeVisible()
        await shot(page, `contacts-segments-list-sapphire-${theme}-${width}`)
      })

      test(`segment duplicate sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, SEGMENTS)
        await page.getByRole("button", { name: "Створити сегмент" }).click()
        const form = dialog(page, "Новий сегмент")
        const name = form.getByRole("textbox", { name: "Назва" })
        await expect(name).toBeFocused()
        await name.fill("Клієнт")
        await form.getByRole("button", { name: "Створити" }).click()
        await expect(name).toHaveAttribute("aria-invalid", "true")
        await shot(
          page,
          `contacts-segments-duplicate-sapphire-${theme}-${width}`,
        )
      })

      test(`organization segments sapphire ${theme} ${width}`, async ({
        page,
      }) => {
        test.skip(skip())
        await open(page, seed, width, LEGAL_CARD)
        await page.getByRole("button", { name: "Змінити", exact: true }).click()
        const form = dialog(page, "Змінити організацію")
        await form.getByRole("combobox", { name: "Сегменти" }).click()
        await page
          .getByRole("option", { name: "Ключовий", exact: true })
          .click()
        await expect(
          page.getByRole("option", { name: "Ключовий", exact: true }),
        ).toHaveAttribute("aria-selected", "true")
        await shot(page, `contacts-segments-form-sapphire-${theme}-${width}`)
      })

      test(`multi-select states sapphire ${theme} ${width}`, async ({
        page,
      }) => {
        test.skip(skip())
        await open(page, seed, width, PICKERS)
        const states = page.getByRole("heading", {
          level: 2,
          name: "Стани мультивибору",
        })
        // Заголовок розділу — угорі під липкою шапкою оболонки.
        await states.evaluate((heading) => {
          heading.scrollIntoView({ block: "start" })
          window.scrollBy(0, -80)
        })
        await shot(page, `multi-select-states-sapphire-${theme}-${width}`)
      })
    }
})
