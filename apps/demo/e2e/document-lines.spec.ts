import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  waitForMenuFocus,
} from "./helpers"

/**
 * Редактор рядків документа (UI05a, ADR-0059) у демо «Рядки документа»: те, чого не перевірити без
 * справжнього браузера: порядок фокуса, таблиця й картки за шириною контейнера, axe.
 */
const PAGE = "/#/document-lines"

const form = (page: Page) => page.getByTestId("lines-form")
const line = (page: Page, index: number) =>
  form(page).getByRole("group", { name: `Рядок ${String(index)}`, exact: true })
const totals = (page: Page) =>
  form(page).getByRole("region", { name: "Підсумки" })

async function openEditor(page: Page, theme?: "light" | "dark") {
  await openWith(page, theme ? { theme } : {}, PAGE)
  await expect(line(page, 1).getByLabel("Назва")).toHaveValue("Кавоварка")
}

test.describe("рядки документа", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("клавіатурою: додати рядок, заповнити, змінити знижку, вилучити, повернути", async ({
    page,
  }) => {
    await openEditor(page)
    await form(page).getByRole("button", { name: "Додати рядок" }).focus()
    await page.keyboard.press("Enter")
    const added = line(page, 4)
    // Перше поле нового рядка — вибір товару; типові одиниця й податок — із довідників компанії.
    await expect(
      added.getByRole("combobox", { name: "Товар чи послуга" }),
    ).toBeFocused()
    await expect(added.getByRole("combobox", { name: "Одиниця" })).toHaveText(
      /шт/,
    )
    await expect(added.getByRole("combobox", { name: "Податок" })).toHaveText(
      /ПДВ 20%/,
    )
    await page.keyboard.press("Tab")
    await expect(added.getByLabel("Назва")).toBeFocused()
    await page.keyboard.type("Монтаж")
    await page.keyboard.press("Tab")
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("3")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await expect(added.getByLabel("Ціна")).toBeFocused()
    await page.keyboard.type("250,5")
    await expect(added.getByText("751,50 ₴")).toBeVisible()

    // Знижка сумою: перемикач обнуляє відсоток.
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    const kind = added.getByRole("combobox", { name: "Вид знижки: Рядок 4" })
    await expect(kind).toBeFocused()
    await page.keyboard.press("Enter")
    await page.getByRole("option", { name: "сумою" }).press("Enter")
    await expect(kind).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(added.getByLabel("Знижка, сумою")).toBeFocused()
    await page.keyboard.type("1,5")
    await expect(added.getByText("750,00 ₴")).toBeVisible()

    // Дії рядка — одним меню (ADR-0060): Enter на меню, стрілки до «Вилучити», Enter.
    await form(page)
      .getByRole("button", { name: "Дії: Рядок 4" })
      .press("Enter")
    const remove = page.getByRole("menuitem", { name: "Вилучити" })
    await expect(remove).toBeVisible()
    await waitForMenuFocus(page)
    await page.keyboard.press("End")
    await expect(remove).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(line(page, 4)).toHaveCount(0)
    await expect(
      form(page).getByRole("button", { name: "Дії: Рядок 3" }),
    ).toBeFocused()
    await form(page).getByRole("button", { name: "Повернути" }).press("Enter")
    await expect(line(page, 4).getByLabel("Назва")).toHaveValue("Монтаж")
    await expect(
      line(page, 4).getByRole("combobox", { name: "Товар чи послуга" }),
    ).toBeFocused()
  })

  test("вибір товару підставляє назву, ціну й одиницю", async ({ page }) => {
    await openEditor(page)
    const second = line(page, 2)
    await second.getByRole("combobox", { name: "Товар чи послуга" }).click()
    await page.getByRole("option", { name: /Встановлення/ }).click()
    await expect(second.getByLabel("Назва")).toHaveValue("Встановлення")
    await expect(second.getByLabel("Ціна")).toHaveValue("900")
    await expect(second.getByRole("combobox", { name: "Одиниця" })).toHaveText(
      /год/,
    )
  })

  test("знижка на документ ділиться між рядками й зменшує ПДВ", async ({
    page,
  }) => {
    await openEditor(page)
    await expect(totals(page)).toContainText("ПДВ 20%1 923,00 ₴")
    await totals(page).getByLabel("Знижка на документ, у відсотках").fill("10")
    await expect(totals(page)).toContainText("Знижка на документ971,50 ₴")
    await expect(totals(page)).toContainText("ПДВ 20%1 730,70 ₴")
    await expect(totals(page)).toContainText("Разом10 474,20 ₴")
  })

  test("лише для читання: поля без кнопок і панелі", async ({ page }) => {
    await openEditor(page)
    await page.getByRole("checkbox", { name: "Лише для читання" }).check()
    await expect(line(page, 1).getByLabel("Назва")).toHaveAttribute(
      "readonly",
      "",
    )
    await expect(
      form(page).getByRole("button", { name: /Додати|Дії:/ }),
    ).toHaveCount(0)
    await expect(page.locator('[data-slot="save-bar"]')).toHaveCount(0)
  })

  for (const theme of ["light", "dark"] as const)
    test(`axe (${theme})`, async ({ page }) => {
      await openEditor(page, theme)
      await form(page).getByRole("button", { name: "Зберегти" }).click()
      await expectNoA11yViolations(page)
    })
})

test.describe("рядки документа на телефоні", () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test("картки без горизонтальної прокрутки, підписи над кожним полем", async ({
    page,
  }) => {
    await openEditor(page)
    await expectNoHorizontalScroll(page)
    await expect(line(page, 2).getByText("Кількість")).toBeVisible()
    await form(page).getByRole("button", { name: "Додати рядок" }).click()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
