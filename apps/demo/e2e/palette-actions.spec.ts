import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

/** Дії відкритого запису в палітрі команд (ADR-0044): `usePaletteActions` на картках A1, B1 і A2. */
const palette = (page: Page) =>
  page.getByRole("dialog", { name: "Палітра команд" })
const option = (page: Page, name: string | RegExp) =>
  palette(page).getByRole("option", { name })
const openPalette = async (page: Page) => {
  await page.keyboard.press("Control+k")
  await expect(palette(page)).toBeVisible()
}

test.describe("дії запису в палітрі", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("картка компанії: дії першою групою, нова філія відкриває форму на вкладці", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/A1/company")
    const startTab = page.getByRole("tab", { name: "Реквізити" })
    await startTab.focus()
    await openPalette(page)
    await expect(
      palette(page).getByText("Відкритий запис: Зоряна логістика"),
    ).toBeVisible()
    await expect(palette(page).getByRole("option").first()).toHaveText(
      /Додати філію/,
    )
    await page.keyboard.press("Enter")
    await expect(palette(page)).toBeHidden()
    const form = page.getByRole("dialog", { name: "Нова філія" })
    await expect(form).toBeVisible()
    await expect(page).toHaveURL(/tab=branches/)
    await expect(form.getByLabel("Назва")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(form).toBeHidden()
    // Фокус там, де людина була до палітри, а не на порожньому місці.
    await expect(startTab).toBeFocused()
    // Форма не відкривається знову: вікно закрито, а не сховано.
    await page.getByRole("tab", { name: "Реквізити" }).click()
    await page.getByRole("tab", { name: "Філії" }).click()
    await expect(form).toBeHidden()
  })

  test("вкладка картки відкривається з палітри", async ({ page }) => {
    await openWith(page, {}, "/#/m/A1/company")
    await expect(page.getByRole("tablist").last()).toBeVisible()
    await openPalette(page)
    await page.keyboard.type("Локалізація")
    await option(page, "Відкрити: Локалізація").click()
    await expect(page).toHaveURL(/tab=locale/)
    await expect(
      page.getByRole("tab", { name: "Локалізація" }),
    ).toHaveAttribute("aria-selected", "true")
  })

  test("без права дія неактивна з причиною: стрілки її знаходять, Enter нічого не робить", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/A1/company", { user: USERS.sales })
    await expect(page.getByRole("tablist").last()).toBeVisible()
    await openPalette(page)
    const denied = option(page, /Додати філію/)
    await expect(denied).toHaveAttribute("aria-disabled", "true")
    await expect(denied).toContainText("Немає права змінювати компанію")
    await expect(denied).toHaveAttribute("data-highlighted", /.*/)
    await page.keyboard.press("Enter")
    await expect(palette(page)).toBeVisible()
    await expect(page.getByRole("dialog", { name: "Нова філія" })).toBeHidden()
    await expectNoA11yViolations(page)
  })

  test("дії зникають разом із карткою", async ({ page }) => {
    await openWith(page, {}, "/#/m/A1/company")
    await expect(page.getByRole("tablist").last()).toBeVisible()
    await openPalette(page)
    await page.keyboard.type("Валюти")
    await option(page, "Валюти").click()
    await expect(page).toHaveURL(/#\/m\/A1\/currencies/)
    await openPalette(page)
    await expect(palette(page).getByText(/^Відкритий запис/)).toBeHidden()
  })

  test("картка контакту: «Змінити» відкриває форму, фокус повертається на сторінку", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/B1/contacts/contact-001")
    const edit = page.getByRole("button", { name: "Змінити", exact: true })
    await edit.focus()
    await openPalette(page)
    await expect(palette(page).getByRole("option").first()).toHaveText(
      /Змінити/,
    )
    await page.keyboard.press("Enter")
    const form = page.getByRole("dialog", { name: /Змінити контакт/ })
    await expect(form).toBeVisible()
    await form.getByRole("button", { name: "Скасувати" }).click()
    await expect(form).toBeHidden()
    await expect(edit).toBeFocused()
  })

  test("картка людини: «Увійти як…» і вкладки", async ({ page }) => {
    await openWith(page, {}, "/#/m/A2/users/u-ivan")
    const startTab = page.getByRole("tab", { name: "Ролі" })
    await startTab.focus()
    await openPalette(page)
    await expect(option(page, /Увійти як/)).toBeVisible()
    await expect(option(page, "Відкрити: Ролі")).toBeVisible()
    await option(page, /Увійти як/).click()
    const dialog = page.getByRole("dialog", { name: /Увійти як/ })
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(startTab).toBeFocused()
  })

  test("демо: дозволена дія виконується, заборонена показує причину", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/shortcuts")
    await openPalette(page)
    await expect(option(page, /Приклад забороненої дії/)).toContainText(
      "Доступно для ролі «Бухгалтер»",
    )
    await option(page, "Приклад дії").click()
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "Дію виконано" }),
    ).toBeVisible()
  })
})
