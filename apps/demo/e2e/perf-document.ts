import { expect, type Page } from "@playwright/test"

/**
 * Дії з великим документом для `pnpm perf` (UI05b, ADR-0060): 500 рядків у розділах і 11 рядків, усі в
 * DOM. Заміри й межі — `perf.spec.ts`. Курсор у полі ставить клік, без End: на macOS End прокручує
 * сторінку до кінця документа, і локальний замір показав би прокрутку, а не введення.
 */
export const DOCUMENT_FORM = "/#/document-form"

export const documentRow = (page: Page) => (index: number) =>
  page
    .getByTestId("document-form")
    .getByRole("group", { name: `Рядок ${String(index)}`, exact: true })

/**
 * Документ на 11 рядків — найбільший, де в DOM усі рядки (поріг редактора — 12). «Повернути» вставляє
 * рядок угорі, тож перемальовуються всі рядки нижче: найгірший випадок без віртуалізації. «Додати
 * рядок» — останнім: дванадцятий рядок вмикає віртуальні рядки.
 */
export async function interactWithFullDocument(page: Page) {
  const form = page.getByTestId("document-form")
  const row = documentRow(page)
  const price = row(3).getByLabel("Ціна")
  await price.click()
  await price.pressSequentially("05", { delay: 120 })
  await row(2).getByRole("button", { name: "Дії: Рядок 2" }).click()
  await page.getByRole("menuitem", { name: "Вилучити" }).click()
  await form.getByRole("button", { name: "Повернути" }).click()
  await expect(
    row(2).getByRole("combobox", { name: "Товар чи послуга" }),
  ).toBeFocused()
  const discount = form.getByLabel("Знижка на документ, у відсотках")
  await discount.click()
  await discount.pressSequentially("5", { delay: 120 })
  await form.getByRole("button", { name: "Додати рядок" }).click()
  await expect(
    row(12).getByRole("combobox", { name: "Товар чи послуга" }),
  ).toBeFocused()
}

/**
 * Великий документ на телефоні: введення в поле рядка, вставка рядка з меню, назва нового рядка, «Підняти»,
 * ще раз введення в те саме поле ціни (поле вже торкнуте: форма перевіряє весь документ на кожен
 * символ), «Додати рядок» під 500 рядками й знижка на документ. Рядки — картки, у DOM лише видимі.
 */
export async function interactWithDocument(page: Page) {
  const form = page.getByTestId("document-form")
  const row = documentRow(page)
  const price = row(3).getByLabel("Ціна")
  await price.click()
  await price.pressSequentially("05", { delay: 120 })
  await row(3).getByRole("button", { name: "Дії: Рядок 3" }).click()
  await page.getByRole("menuitem", { name: "Вставити рядок нижче" }).click()
  const name = row(4).getByLabel("Назва")
  await expect(name).toHaveValue("")
  await name.click()
  await name.pressSequentially("Монтаж", { delay: 120 })
  await row(4).getByRole("button", { name: "Дії: Рядок 4" }).click()
  await page.getByRole("menuitem", { name: "Підняти" }).click()
  await expect(row(3).getByLabel("Назва")).toHaveValue("Монтаж")
  const touched = row(4).getByLabel("Ціна")
  await touched.click()
  await touched.pressSequentially("1", { delay: 120 })
  await form.getByRole("button", { name: "Додати рядок" }).click()
  await expect(
    row(502).getByRole("combobox", { name: "Товар чи послуга" }),
  ).toBeFocused()
  const discount = form.getByLabel("Знижка на документ, у відсотках")
  await discount.click()
  await discount.pressSequentially("5", { delay: 120 })
}
