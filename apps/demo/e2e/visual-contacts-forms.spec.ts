import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { USERS, chooseScenario, openWith, type AppearanceSeed } from "./helpers"

// Крок 1.4b1 (ADR-0026): форми модуля B1 з полями розширення — нова організація, помилки, конфлікт
// із полем розширення, «Створити…» з форми контакту, дія без права. Набір і теки — як у
// visual.spec.ts (SCREENSHOT_PAGES=contactsForms, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const ORGANIZATIONS = "/#/m/B1/organizations"
const CONTACTS = "/#/m/B1/contacts"
const LEGAL_CARD = "/#/m/B1/organizations/org-013"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("contactsForms")

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

async function openCreateOrganization(page: Page) {
  await page.getByRole("button", { name: "Створити організацію" }).click()
  const form = dialog(page, "Нова організація")
  await expect(form.getByRole("textbox", { name: "Назва" })).toBeFocused()
  return form
}

test.describe("скриншоти кроку 1.4b1 @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      test(`organization form sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, { palette: "sapphire", theme }, width, ORGANIZATIONS)
        await openCreateOrganization(page)
        await shot(
          page,
          `contacts-form-organization-sapphire-${theme}-${width}`,
        )
      })

      test(`organization form errors sapphire ${theme} ${width}`, async ({
        page,
      }) => {
        test.skip(skip())
        await open(page, { palette: "sapphire", theme }, width, ORGANIZATIONS)
        const form = await openCreateOrganization(page)
        await form.getByRole("textbox", { name: "ЄДРПОУ" }).fill("12345679")
        await form.getByRole("button", { name: "Створити" }).click()
        await expect(
          page.locator('[data-slot="form-error-summary"]'),
        ).toBeFocused()
        await shot(page, `contacts-form-errors-sapphire-${theme}-${width}`)
      })

      test(`organization conflict sapphire ${theme} ${width}`, async ({
        page,
      }) => {
        test.skip(skip())
        await open(page, { palette: "sapphire", theme }, width, LEGAL_CARD)
        await chooseScenario(page, "Конфлікт збереження")
        await page.getByRole("button", { name: "Змінити", exact: true }).click()
        const form = dialog(page, "Змінити організацію")
        await form.getByRole("checkbox", { name: "Платник ПДВ" }).click()
        await form.getByRole("textbox", { name: "Місто" }).fill("Вінниця")
        await form.getByRole("button", { name: "Зберегти" }).click()
        await expect(
          dialog(page, "Запис змінив інший користувач"),
        ).toBeVisible()
        await shot(page, `contacts-form-conflict-sapphire-${theme}-${width}`)
      })
    }

  for (const width of [390, 1440] as const)
    test(`contact form with new organization sapphire light ${width}`, async ({
      page,
    }) => {
      test.skip(skip())
      await open(page, { palette: "sapphire", theme: "light" }, width, CONTACTS)
      await page.getByRole("button", { name: "Створити контакт" }).click()
      const form = dialog(page, "Новий контакт")
      await form.getByRole("textbox", { name: "Ім'я" }).fill("Оксана Тестова")
      await form
        .getByRole("combobox", { name: "Організація", exact: true })
        .click()
      await page
        .getByRole("combobox", { name: "Пошук: Організація" })
        .fill("Світанок ПП")
      await expect(
        page.getByRole("option", { name: "Створити «Світанок ПП»" }),
      ).toBeVisible()
      await shot(page, `contacts-form-picker-create-sapphire-light-${width}`)
      await page.getByRole("option", { name: "Створити «Світанок ПП»" }).click()
      await expect(
        dialog(page, "Нова організація").getByRole("textbox", {
          name: "Назва",
        }),
      ).toHaveValue("Світанок ПП")
      await shot(page, `contacts-form-nested-sapphire-light-${width}`)
    })

  test("organizations denied sapphire light 1440", async ({ page }) => {
    test.skip(skip())
    await open(
      page,
      { palette: "sapphire", theme: "light" },
      1440,
      ORGANIZATIONS,
      USERS.sales,
    )
    await page.getByRole("button", { name: "Створити організацію" }).focus()
    await expect(page.locator('[data-slot="tooltip-content"]')).toBeVisible()
    await shot(page, "contacts-form-denied-sapphire-light-1440")
  })
})
