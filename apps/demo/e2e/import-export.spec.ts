import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Імпорт і експорт (ADR-0049): те, що модульні тести не бачать: справжній файл через поле браузера,
 * бібліотека xlsx окремим чанком, збережений файл, axe, вузький екран.
 */
const PAGE = "/#/import-export"

const CSV = [
  "Артикул;Назва;Ціна;Коментар",
  "SKU-001;Кавоварка нова;4300;старий",
  "SKU-100;Набір ложок;1 250,50;новий",
  "SKU-101;Без ціни;;",
  "SKU-102;Ложка;1,234;",
  "",
  "SKU-103;Тарілка;99;",
].join("\n")

const wizard = (page: Page) => page.locator('[data-slot="wizard"]')
const stepHeading = (page: Page, name: string) =>
  wizard(page).getByRole("heading", { level: 2, name })

async function upload(page: Page, name: string, content: string | Buffer) {
  await wizard(page)
    .getByTestId("file-drop-input")
    .setInputFiles({
      name,
      mimeType: "text/csv",
      buffer: Buffer.from(content),
    })
}

async function next(page: Page, name = "Далі") {
  await wizard(page).getByRole("button", { name }).click()
}

async function toCheck(page: Page) {
  await upload(page, "товари.csv", CSV)
  await expect(wizard(page).getByText("5 рядків")).toBeVisible()
  await next(page)
  await expect(stepHeading(page, "Колонки")).toBeFocused()
  await next(page)
  await expect(stepHeading(page, "Перевірка")).toBeFocused()
}

test.describe("майстер імпорту", () => {
  test("проходить від файла до звіту, новий запис з'являється", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await expect(page.getByTestId("count")).toHaveText("Товарів у моках: 5")
    await toCheck(page)

    await expect(wizard(page).getByText("Рядок 4")).toBeVisible()
    await expect(
      wizard(page).getByText("Ціна: обов'язкове поле порожнє"),
    ).toBeVisible()
    await expect(
      wizard(page).getByText(/Ціна: незрозуміле число/),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await next(page)
    await expect(stepHeading(page, "Перегляд")).toBeFocused()
    await expect(wizard(page).getByText("Набір ложок")).toBeVisible()
    await expectNoA11yViolations(page)

    await next(page, "Імпортувати 2 записи")
    await expect(stepHeading(page, "Звіт")).toBeFocused()
    await expect(
      wizard(page).getByText("Створено 2, оновлено 0, пропущено 1"),
    ).toBeVisible()
    await expect(
      wizard(page).getByRole("button", { name: "Назад" }),
    ).toHaveCount(0)
    await expect(page.getByTestId("count")).toHaveText("Товарів у моках: 7")

    await next(page, "Готово")
    await expect(stepHeading(page, "Файл")).toBeVisible()
  })

  test("рядки з помилками зберігаються у файл для виправлення", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await toCheck(page)
    const download = page.waitForEvent("download")
    await wizard(page)
      .getByRole("button", { name: "Завантажити файл помилок" })
      .click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^помилки-імпорту-.+\.xlsx$/)
    const saved = await readFile(await file.path())
    await wizard(page).getByRole("button", { name: "Назад" }).click()
    await expect(stepHeading(page, "Колонки")).toBeFocused()
    await wizard(page).getByRole("button", { name: "Назад" }).click()
    await expect(stepHeading(page, "Файл")).toBeFocused()
    await upload(page, "помилки.xlsx", saved)
    await expect(wizard(page).getByText("2 рядки")).toBeVisible()
  })

  test("битий файл показує причину й не йде далі", async ({ page }) => {
    await openWith(page, {}, PAGE)
    await upload(page, "дані.xlsx", "не таблиця")
    await expect(
      wizard(page).getByText(/Не вдалося прочитати файл/),
    ).toBeVisible()
    await next(page)
    await expect(stepHeading(page, "Файл")).toBeVisible()
  })

  test("вузький екран без горизонтальної прокрутки", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openWith(page, {}, PAGE)
    await upload(page, "товари.csv", CSV)
    await expect(wizard(page).getByText("5 рядків")).toBeVisible()
    await next(page)
    await expect(stepHeading(page, "Колонки")).toBeFocused()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})

test.describe("діалог експорту", () => {
  test("зберігає файл, який читає майстер імпорту", async ({ page }) => {
    await openWith(page, {}, PAGE)
    await page.getByRole("button", { name: "Експорт усіх товарів" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expectNoA11yViolations(page)
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Експортувати" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^products-.+\.xlsx$/)
    await expect(page.getByText("Експортовано 5 записів")).toBeVisible()
    await expect(dialog).toBeHidden()

    await upload(page, "експорт.xlsx", await readFile(await file.path()))
    await expect(wizard(page).getByText("5 рядків")).toBeVisible()
  })

  test("вибрані записи й CSV", async ({ page }) => {
    await openWith(page, {}, PAGE)
    await page.getByRole("button", { name: "Експорт двох вибраних" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("combobox", { name: "Формат файла" }).click()
    await page.getByRole("option", { name: "CSV (.csv)" }).click()
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Експортувати" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^products-.+\.csv$/)
    const text = await readFile(await file.path(), "utf-8")
    expect(text.split("\r\n")).toHaveLength(3)
    expect(text).toContain("Кавоварка")
  })

  test("без колонок помилка біля списку, файла немає", async ({ page }) => {
    await openWith(page, {}, PAGE)
    await page.getByRole("button", { name: "Експорт усіх товарів" }).click()
    const dialog = page.getByRole("dialog")
    const all = dialog.getByRole("checkbox", { name: "Усі колонки" })
    await all.click()
    await all.click()
    await dialog.getByRole("button", { name: "Експортувати" }).click()
    await expect(dialog.getByText("Виберіть хоча б одну колонку")).toBeVisible()
  })
})
