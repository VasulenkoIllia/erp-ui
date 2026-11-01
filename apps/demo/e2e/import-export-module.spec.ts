import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль A4 «Імпорт і експорт» на місці заглушки `/m/A4` (ADR-0050): цілі B1 і A6, ціль проекту
 * «Товари» з розширення демо, майстер на адресі цілі, рядок заголовків під шапкою файла, експорт і
 * його зворотний імпорт, історія запусків із подробицями, дії за правами.
 */
const MODULE = "/#/m/A4"
const TARGETS = "/#/m/A4/import-export"
const HISTORY = "/#/m/A4/import-history"

const CONTACTS_CSV = [
  "Контакти з виставки;;;",
  "Ім'я;Посада;Телефон;Email",
  "Марія Шевчук;Директорка;067 123 45 67;maria@zoriana.example",
  "Петро Бондар;;не номер;petro@zoriana.example",
  "Ганна Мороз;Менеджерка;;",
].join("\n")

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const wizard = (page: Page) => page.locator('[data-slot="wizard"]')
const stepHeading = (page: Page, name: string) =>
  wizard(page).getByRole("heading", { level: 2, name })
const rowOf = (page: Page, name: string) =>
  page.getByRole("row").filter({ hasText: name })
const target = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Що можна імпортувати й експортувати" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })

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

test.describe("модуль A4: цілі", () => {
  test("адреса модуля веде на цілі, ціль проекту стоїть на своєму місці", async ({
    page,
  }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/A4\/import-export$/)
    await expect(heading(page)).toHaveText("Імпорт і експорт")
    await expect(
      page
        .getByRole("list", { name: "Що можна імпортувати й експортувати" })
        .getByRole("heading"),
    ).toHaveText([
      "Контакти",
      "Організації",
      "Товари",
      "Податки",
      "Одиниці виміру",
      "Теги",
      "Причини",
    ])
    await expect(
      page.getByRole("link", { name: "Історія імпорту" }).first(),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("без права створювати імпорт неактивний і пояснює чому", async ({
    page,
  }) => {
    await openWith(page, {}, TARGETS, { user: USERS.lead })
    const contacts = target(page, "Контакти")
    await expect(
      contacts.getByRole("button", { name: "Імпортувати: Контакти" }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(
      contacts.getByRole("button", { name: "Експортувати: Контакти" }),
    ).toBeEnabled()
    await expect(page.getByRole("link", { name: "Історія" })).toHaveCount(0)
    await expect(target(page, "Товари")).toHaveCount(0)
    await expectNoA11yViolations(page)
  })

  test("вузький екран без горизонтальної прокрутки", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openWith(page, {}, TARGETS)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})

test.describe("модуль A4: імпорт", () => {
  test("файл із шапкою: від рядка заголовків до запуску в історії", async ({
    page,
  }) => {
    await openWith(page, {}, TARGETS)
    await page.getByRole("link", { name: "Імпортувати: Контакти" }).click()
    await expect(heading(page)).toHaveText("Імпорт: Контакти")
    await expect(heading(page)).toBeFocused()

    await upload(page, "виставка.csv", CONTACTS_CSV)
    await expect(wizard(page).getByText("4 рядки")).toBeVisible()
    await wizard(page)
      .getByRole("combobox", { name: "Рядок із назвами колонок" })
      .click()
    await page
      .getByRole("option", { name: "Рядок 2: Ім'я, Посада, Телефон, Email" })
      .click()
    await expect(wizard(page).getByText("3 рядки")).toBeVisible()
    await expectNoA11yViolations(page)

    await next(page)
    await expect(stepHeading(page, "Колонки")).toBeFocused()
    await expect(wizard(page).getByText("Приклад: Марія Шевчук")).toBeVisible()
    await next(page)
    await expect(stepHeading(page, "Перевірка")).toBeFocused()
    await expect(wizard(page).getByText("Рядок 4")).toBeVisible()
    await next(page)
    await expect(stepHeading(page, "Перегляд")).toBeFocused()
    await next(page, "Імпортувати 2 записи")
    await expect(stepHeading(page, "Звіт")).toBeFocused()
    await expect(
      wizard(page).getByText("Створено 2, оновлено 0, пропущено 0"),
    ).toBeVisible()

    await next(page, "Готово")
    await expect(page).toHaveURL(/#\/m\/A4\/import-history$/)
    await expect(heading(page)).toBeFocused()
    const run = rowOf(page, "виставка.csv")
    await expect(run).toContainText("Контакти")
    await expect(run).toContainText("Готово")
    await run.getByRole("button", { name: /виставка\.csv/ }).click()
    const details = page.getByRole("dialog", { name: "виставка.csv" })
    await expect(details.getByText("Створено", { exact: true })).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("невідома ціль — не знайдено", async ({ page }) => {
    await openWith(page, {}, `${TARGETS}/unknown`)
    await expect(heading(page)).toHaveText("Сторінку не знайдено")
  })

  test("ціль без права створювати — немає доступу", async ({ page }) => {
    await openWith(page, {}, `${TARGETS}/taxes`, { user: USERS.sales })
    await expect(heading(page)).toHaveText("Немає доступу")
  })

  test("вузький екран: довгий рядок заголовків не ламає сторінку", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openWith(page, {}, `${TARGETS}/contacts`)
    await upload(page, "виставка.csv", CONTACTS_CSV)
    await expect(
      wizard(page).getByRole("combobox", { name: "Рядок із назвами колонок" }),
    ).toBeVisible()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})

test.describe("модуль A4: експорт", () => {
  test("файл податків читається майстром, рядки впізнаються як наявні", async ({
    page,
  }) => {
    await openWith(page, {}, TARGETS)
    const open = page.getByRole("button", { name: "Експортувати: Податки" })
    await open.click()
    const dialog = page.getByRole("dialog", { name: "Експорт: Податки" })
    await expect(dialog).toBeVisible()
    await expectNoA11yViolations(page)
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Експортувати" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^taxes-.+\.xlsx$/)
    await expect(dialog).toBeHidden()
    await expect(open).toBeFocused()
    const saved = await readFile(await file.path())

    await page.getByRole("link", { name: "Імпортувати: Податки" }).click()
    await expect(heading(page)).toHaveText("Імпорт: Податки")
    await upload(page, "податки.xlsx", saved)
    await expect(wizard(page).getByText("4 рядки")).toBeVisible()
    await next(page)
    await expect(stepHeading(page, "Колонки")).toBeFocused()
    await next(page)
    await expect(stepHeading(page, "Перевірка")).toBeFocused()
    await expect(
      wizard(page).getByText("Пропустити", { exact: true }),
    ).toBeVisible()
  })

  test("Escape закриває діалог і повертає фокус на кнопку цілі", async ({
    page,
  }) => {
    await openWith(page, {}, TARGETS)
    const open = page.getByRole("button", { name: "Експортувати: Теги" })
    await open.click()
    const dialog = page.getByRole("dialog", { name: "Експорт: Теги" })
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(open).toBeFocused()
  })
})

test.describe("модуль A4: історія", () => {
  test("список, пошук, подробиці з причинами й рядками", async ({ page }) => {
    await openWith(page, {}, HISTORY)
    await expect(heading(page)).toHaveText("Історія імпорту")
    await expect(page.getByText("4 запуски")).toBeVisible()
    await expect(rowOf(page, "контрагенти.csv")).toContainText("Частково")
    await expect(rowOf(page, "податки.csv")).toContainText("Не виконано")
    await expectNoA11yViolations(page)

    const open = page.getByRole("button", {
      name: "Подробиці запуску: контрагенти.csv",
    })
    await open.click()
    const details = page.getByRole("dialog", { name: "контрагенти.csv" })
    await expect(details.getByText("Чому не пройшли рядки")).toBeVisible()
    await expect(details.getByText("Рядки у файлі: 12, 31")).toBeVisible()
    await expectNoA11yViolations(page)
    await page.keyboard.press("Escape")
    await expect(details).toBeHidden()
    await expect(open).toBeFocused()

    await page.getByPlaceholder("Пошук за назвою файла").fill("податки")
    await expect(page.getByText("1 запуск")).toBeVisible()
    await expect(rowOf(page, "контрагенти.csv")).toHaveCount(0)
  })

  test("`read:own`: чужих запусків немає, порожній стан пояснює", async ({
    page,
  }) => {
    await openWith(page, {}, HISTORY, { user: USERS.sales })
    await expect(
      page.getByRole("heading", { name: "Імпорту ще не було" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("без права — немає доступу, пункту в навігації теж немає", async ({
    page,
  }) => {
    await openWith(page, {}, HISTORY, { user: USERS.lead })
    await expect(page.getByText("Немає доступу").first()).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Історія імпорту" }),
    ).toHaveCount(0)
  })

  for (const { scenario, text } of [
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
  ])
    test(`список: ${scenario}`, async ({ page }) => {
      await openWith(page, {}, TARGETS)
      await chooseScenario(page, scenario)
      await page.getByRole("link", { name: "Історія імпорту" }).first().click()
      await expect(page.getByText(text).first()).toBeVisible()
    })

  test("список: порожньо вперше", async ({ page }) => {
    await openWith(page, {}, TARGETS)
    await chooseScenario(page, "Порожньо")
    await page.getByRole("link", { name: "Історія імпорту" }).first().click()
    await expect(
      page.getByRole("heading", { name: "Імпорту ще не було" }),
    ).toBeVisible()
  })

  test("вузький екран: картки без горизонтальної прокрутки", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openWith(page, {}, HISTORY)
    await expect(page.getByText("контрагенти.csv")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
