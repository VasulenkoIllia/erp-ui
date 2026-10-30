import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/** Майстер UI06 і шаблон Wizard (ADR-0043): сценарій «Нова філія» на моках. */
const STEPS_SECTION = "Нова філія"

const wizard = (page: Page) => page.locator('[data-slot="wizard"]').last()
const name = (page: Page) => page.getByLabel("Назва філії")
const next = (page: Page) =>
  wizard(page).getByRole("button", { name: "Далі", exact: true })
const stepHeading = (page: Page, label: string) =>
  wizard(page).getByRole("heading", { level: 2, name: label })

async function open(page: Page) {
  await openWith(page, {}, "/#/wizard")
  await expect(page.getByRole("heading", { name: STEPS_SECTION })).toBeVisible()
}

test.describe("майстер", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("порожнє поле лишає на кроці: помилка біля поля, позначка в степері", async ({
    page,
  }) => {
    await open(page)
    await next(page).click()
    await expect(wizard(page).getByText("Заповніть це поле")).toBeVisible()
    await expect(name(page)).toBeFocused()
    await expect(stepHeading(page, "Назва")).toBeVisible()
    await expect(
      wizard(page).locator("ol").getByText("є помилки"),
    ).toBeAttached()
  })

  test("Enter веде далі, фокус на заголовку кроку, необов'язковий крок пропускається", async ({
    page,
  }) => {
    await open(page)
    await name(page).fill("Філія Львів")
    await name(page).press("Enter")
    await expect(stepHeading(page, "Адреса й телефон")).toBeFocused()
    await wizard(page).getByRole("button", { name: "Пропустити" }).click()
    await expect(stepHeading(page, "Огляд")).toBeFocused()
    await expect(wizard(page).getByText("Філія Львів")).toBeVisible()
    await expect(wizard(page).getByText("Не вказано").first()).toBeVisible()
  })

  test("«Змінити» в огляді веде на крок, а степер — на відкриті кроки", async ({
    page,
  }) => {
    await open(page)
    await name(page).fill("Філія Львів")
    await next(page).click()
    await next(page).click()
    await wizard(page)
      .getByRole("button", { name: "Змінити: Адреса й телефон" })
      .click()
    await expect(stepHeading(page, "Адреса й телефон")).toBeFocused()
    await wizard(page)
      .locator("ol")
      .getByRole("button", { name: /Назва/ })
      .click()
    await expect(name(page)).toHaveValue("Філія Львів")
  })

  test("прогрес лишається після перезавантаження", async ({ page }) => {
    await open(page)
    await name(page).fill("Філія Одеса")
    await next(page).click()
    await expect(stepHeading(page, "Адреса й телефон")).toBeVisible()
    await page.reload()
    await expect(stepHeading(page, "Адреса й телефон")).toBeVisible()
    await wizard(page).getByRole("button", { name: "Назад" }).click()
    await expect(name(page)).toHaveValue("Філія Одеса")
  })

  test("збій показує повідомлення, введене лишається, повтор створює філію", async ({
    page,
  }) => {
    await open(page)
    await page
      .getByRole("switch", { name: "Імітувати збій під час збереження" })
      .click()
    await name(page).fill("Філія Харків")
    await next(page).click()
    await next(page).click()
    const create = wizard(page).getByRole("button", { name: "Створити філію" })
    await create.click()
    await expect(wizard(page).getByRole("alert")).toBeVisible()
    await expect(wizard(page).getByText("Філія Харків")).toBeVisible()
    await create.click()
    await expect(page.getByText("Філію «Філія Харків» створено")).toBeVisible()
    // Майстер почався спочатку, чернетки немає.
    await expect(stepHeading(page, "Назва")).toBeVisible()
    await expect(name(page)).toHaveValue("")
    await page.reload()
    await expect(stepHeading(page, "Назва")).toBeVisible()
    await page.goto("/#/settings/company")
    await expect(page.getByText("Філія Харків")).toBeVisible()
  })
})

test.describe("сторінка «Майстер»", () => {
  for (const [width, height] of [
    [360, 740],
    [768, 1024],
    [1440, 900],
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${String(width)} px, ${theme}: axe, без горизонтальної прокрутки`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ colorScheme: theme })
        await openWith(page, { theme }, "/#/wizard")
        await expect(
          page.getByRole("heading", { name: STEPS_SECTION }),
        ).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)
        await next(page).click()
        await expect(wizard(page).getByText("Заповніть це поле")).toBeVisible()
        await name(page).fill("Філія")
        await next(page).click()
        await next(page).click()
        await expect(stepHeading(page, "Огляд")).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)
      })
    }
  }

  test("на телефоні замість ряду кроків: «Крок 1 з 3» і смуга", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    await expect(wizard(page).getByText("Крок 1 з 3").first()).toBeVisible()
    await expect(wizard(page).locator("ol")).toBeHidden()
    await expect(wizard(page).getByRole("progressbar")).toBeVisible()
  })

  test("англійською: кнопки й кроки", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, { language: "en" }, "/#/wizard")
    await expect(
      wizard(page).getByRole("button", { name: "Next", exact: true }),
    ).toBeVisible()
    await expect(wizard(page).locator("ol")).toContainText("Name")
  })
})
