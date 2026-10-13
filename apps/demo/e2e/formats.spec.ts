import { expect, test } from "@playwright/test"

import { expectNoA11yViolations, openWith } from "./helpers"

const PATH = "/#/formats"
const PALETTES = [
  "sapphire",
  "graphite",
  "indigo",
  "teal",
  "terracotta",
] as const
const THEMES = ["light", "dark"] as const
const LANGUAGES = ["uk", "en"] as const

test.describe("мови й формати: axe", () => {
  for (const palette of PALETTES)
    for (const theme of THEMES)
      test(`${palette} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await openWith(page, { palette, theme }, PATH)
        await expectNoA11yViolations(page)
      })

  for (const width of [360, 768] as const)
    for (const language of LANGUAGES)
      test(`${width}px ${language}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await openWith(page, { palette: "sapphire", language }, PATH)
        await expectNoA11yViolations(page)
      })

  test("компактна щільність", async ({ page }) => {
    await openWith(page, { density: "compact" }, PATH)
    await expectNoA11yViolations(page)
  })
})

test.describe("мови й формати: поведінка", () => {
  test("перемикач мови змінює тексти, формати й <html lang> і пам'ятає вибір", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const html = page.locator("html")
    await expect(html).toHaveAttribute("lang", "uk")
    await expect(
      page.getByRole("heading", { level: 1, name: "Мови й формати" }),
    ).toBeVisible()
    await expect(page.getByText("48 600,00 ₴")).toBeVisible()

    // Мова — у меню користувача.
    await page.getByRole("button", { name: /Меню користувача/ }).click()
    await page.getByRole("menuitem", { name: /Мова/ }).click()
    await page.getByRole("menuitemradio", { name: "English" }).click()
    await expect(html).toHaveAttribute("lang", "en")
    await expect(
      page.getByRole("heading", { level: 1, name: "Languages & formats" }),
    ).toBeVisible()
    await expect(page.getByText("₴48,600.00")).toBeVisible()
    // Зміна мови не переносить фокус на заголовок сторінки.
    await expect(
      page.getByRole("heading", { level: 1, name: "Languages & formats" }),
    ).not.toBeFocused()

    await page.reload()
    await expect(html).toHaveAttribute("lang", "en")
    await expect(
      page.getByRole("heading", { level: 1, name: "Languages & formats" }),
    ).toBeVisible()
  })

  test("дати: день тижня в називному відмінку, місяць у заголовку — теж", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    // Chromium без виправлення дав би «неділю, 11 жовтня».
    await expect(
      page.getByText("неділя, 11 жовтня", { exact: true }),
    ).toBeVisible()
    await expect(page.getByText("жовтень 2026", { exact: true })).toBeVisible()
  })

  test("множина: 21 рахунок, 22 рахунки, 25 рахунків", async ({ page }) => {
    await openWith(page, {}, PATH)
    for (const text of [
      "21 рахунок",
      "22 рахунки",
      "25 рахунків",
      "101 рахунок",
    ])
      await expect(
        page.getByRole("cell", { name: text, exact: true }),
      ).toBeVisible()
  })

  test("IBAN: маска під час введення, перевірка після виходу з поля", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const iban = page.getByRole("textbox", { name: "IBAN", exact: true })
    await iban.fill("")
    await iban.pressSequentially("2132231300000260072335660")
    await expect(iban).toHaveValue("UA21 3223 1300 0002 6007 2335 660")
    // Поки користувач не вийшов із поля, помилки немає.
    await expect(iban).not.toHaveAttribute("aria-invalid", "true")
    await page.keyboard.press("Tab")
    await expect(iban).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByText("IBAN має містити UA і 27 цифр")).toBeVisible()
    // Далі — перевірка під час виправлення.
    // react-number-format після фокуса виправляє курсор двома setTimeout(0); End до них курсор
    // би повернули на початок. Людина так швидко не натисне — чекаємо, поки обидва відпрацюють.
    await iban.focus()
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          setTimeout(() => setTimeout(resolve, 0), 0)
        }),
    )
    await iban.press("End")
    await iban.pressSequentially("01")
    await expect(iban).not.toHaveAttribute("aria-invalid", "true")
    await expect(
      page.getByText("Зберігається: UA213223130000026007233566001"),
    ).toBeVisible()
  })

  test("ІПН ПДВ із неправильною контрольною цифрою показує помилку", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const vat = page.getByRole("textbox", { name: "ІПН платника ПДВ" })
    await expect(vat).toHaveAttribute("aria-invalid", "true")
    await expect(
      page.getByText("Помилка в ІПН: не збігається контрольна цифра"),
    ).toBeVisible()
    // End на macOS не переносить курсор у полі: ставимо його в кінець напряму, після таймерів
    // маски, що виправляють курсор після фокуса (як для IBAN вище).
    await vat.focus()
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          setTimeout(() => setTimeout(resolve, 0), 0)
        }),
    )
    await vat.evaluate((input: HTMLInputElement) => {
      input.setSelectionRange(input.value.length, input.value.length)
    })
    await vat.press("Backspace")
    await vat.pressSequentially("1")
    await expect(vat).not.toHaveAttribute("aria-invalid", "true")
  })

  test("телефон: країна з клавіатури замінює код, номер форматується", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const phone = page.getByRole("textbox", { name: "Телефон" })
    await expect(phone).toHaveValue("+380 67 123 45 67")
    const country = page.getByRole("combobox", { name: "Країна" })
    await expect(country).toHaveText(/UA \+380/)

    await country.focus()
    await page.keyboard.press("Enter")
    await page.getByRole("option", { name: /Польща/ }).click()
    await expect(country).toHaveText(/PL \+48/)
    await expect(phone).toBeFocused()
    await phone.fill("")
    await phone.pressSequentially("+48512345678")
    await expect(phone).toHaveValue("+48 512 345 678")
    await page.keyboard.press("Tab")
    await expect(phone).not.toHaveAttribute("aria-invalid", "true")

    await phone.fill("")
    await phone.pressSequentially("+380671")
    await page.keyboard.press("Tab")
    await expect(phone).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByText("Номер неповний")).toBeVisible()
  })

  test("у списку країн немає Росії й Білорусі", async ({ page }) => {
    await openWith(page, {}, PATH)
    await page.getByRole("combobox", { name: "Країна" }).click()
    await expect(page.getByRole("option", { name: /Польща/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /Росія/ })).toHaveCount(0)
    await expect(page.getByRole("option", { name: /Білорусь/ })).toHaveCount(0)
  })
})
