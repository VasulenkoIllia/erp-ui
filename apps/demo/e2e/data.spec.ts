import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

const DATA = "/#/data"
const PREFS_KEY = "erp-ui:mock-preferences:u-olena"

const grid = (page: Page) =>
  page.getByRole("grid", { name: "Рахунки клієнтам" })
const rows = (page: Page) => grid(page).locator('[role="row"][data-index]')
/** Рядок стану таблиці: кількість, «Оновлюємо…» (live-регіон). */
const count = (page: Page) => page.locator('[data-slot="data-table-status"]')
const range = (page: Page) => page.getByText(/^[\d\s]+-[\d\s]+ з [\d\s]+$/)
const showPages = (page: Page) =>
  page.getByRole("button", { name: "Сторінки", exact: true }).click()

/** Сценарій моків через панель розробника. */
async function chooseScenario(page: Page, name: string) {
  await page.getByRole("button", { name: /^Моки:/ }).click()
  const panel = page.getByRole("dialog", { name: "Панель розробника" })
  await panel.getByRole("combobox", { name: "Усі ресурси" }).click()
  await page.getByRole("option", { name }).click()
  await panel.getByRole("button", { name: "Закрити" }).click()
  await expect(panel).toBeHidden()
}

test.describe("дані: список рахунків", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("пошук, статус, сортування й сторінки", async ({ page }) => {
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")
    await expect(grid(page)).toHaveAttribute("aria-rowcount", "10001")

    await showPages(page)
    await expect(range(page)).toHaveText("1-20 з 10 000")
    await page.getByRole("button", { name: "Наступна сторінка" }).click()
    await expect(range(page)).toHaveText("21-40 з 10 000")

    await page
      .getByRole("searchbox", { name: "Пошук за номером чи клієнтом" })
      .fill("Агросвіт")
    // Новий пошук — знову перша сторінка.
    await expect(range(page)).toHaveText(/^1-20 з [\d\s]+$/)
    for (const client of await rows(page)
      .locator('[aria-colindex="2"]')
      .allTextContents())
      expect(client).toContain("Агросвіт")

    await page.getByRole("tab", { name: /^Прострочені/ }).click()
    // Чекаємо, поки список оновиться: одразу після вибору ще видно попередні рядки.
    const statuses = rows(page).locator('[aria-colindex="6"]')
    await expect(statuses.first()).toHaveText("Прострочено")
    await expect(statuses.filter({ hasNotText: "Прострочено" })).toHaveCount(0)

    const amount = page.getByRole("columnheader", { name: "Сума" })
    await amount.getByRole("button").click()
    await expect(amount).toHaveAttribute("aria-sort", "descending")
    await amount.getByRole("button").click()
    await expect(amount).toHaveAttribute("aria-sort", "ascending")
  })

  test("компанія в X-Company-Id: інша компанія — інші рахунки", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")
    await page.getByRole("button", { name: /^Змінити компанію/ }).click()
    await page.getByRole("menuitemradio", { name: /Коваленко/ }).click()
    await expect(count(page)).toHaveText("2 500 рахунків")
  })

  test("менеджер без права редагування: кнопка неактивна, але в фокусі з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, DATA, { user: USERS.sales })
    await expect(
      page.getByText("Ви увійшли як Іван Петренко — Менеджер з продажу."),
    ).toBeVisible()
    const edit = page.getByRole("button", { name: /^Редагувати 2026-/ }).first()
    await expect(edit).toHaveAttribute("aria-disabled", "true")
    await edit.focus()
    await expect(edit).toBeFocused()
    await expect(
      page.getByText("Редагування доступне для ролі «Бухгалтер»", {
        exact: true,
      }),
    ).toBeVisible()
  })

  test("редагування зберігає з версією", async ({ page }) => {
    await openWith(page, {}, DATA)
    await rows(page)
      .first()
      .getByRole("button", { name: /^Редагувати/ })
      .click()
    const dialog = page.getByRole("dialog", { name: /^Рахунок №/ })
    await dialog.getByLabel("Клієнт").fill("ТОВ «Перевірка»")
    await dialog.getByRole("button", { name: "Зберегти" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText("Рахунок збережено")).toBeVisible()
    await expect(rows(page).first()).toContainText("ТОВ «Перевірка»")
  })

  test("порожнє поле клієнта — помилка біля поля", async ({ page }) => {
    await openWith(page, {}, DATA)
    await rows(page)
      .first()
      .getByRole("button", { name: /^Редагувати/ })
      .click()
    const dialog = page.getByRole("dialog", { name: /^Рахунок №/ })
    await dialog.getByLabel("Клієнт").fill("")
    await dialog.getByRole("button", { name: "Зберегти" }).click()
    await expect(dialog.getByText("Заповніть це поле")).toBeVisible()
    await expect(dialog.getByLabel("Клієнт")).toHaveAttribute(
      "aria-invalid",
      "true",
    )
  })
})

test.describe("дані: сценарії моків", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("порожньо, помилка з повтором, немає доступу, офлайн, повернення до успіху", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")

    await chooseScenario(page, "Порожньо")
    await expect(
      page.getByRole("heading", { name: "Тут поки порожньо" }),
    ).toBeVisible()

    await chooseScenario(page, "Помилка сервера")
    const error = page.locator('[data-slot="page-state"][data-kind="error"]')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute("role", "alert")

    await chooseScenario(page, "Немає доступу")
    await expect(page.locator('[data-kind="forbidden"]')).toBeVisible()

    await chooseScenario(page, "Офлайн")
    await expect(page.locator('[data-kind="offline"]')).toBeVisible()
    // Позначка на кнопці: сценарій не «Успіх».
    await expect(
      page.locator('[data-slot="dev-panel-indicator"]'),
    ).toBeVisible()

    await chooseScenario(page, "Успіх")
    await expect(count(page)).toHaveText("10 000 рахунків")
    await expect(page.locator('[data-slot="dev-panel-indicator"]')).toBeHidden()
  })

  test("повільно: сторінка лишається, поки оновлюється, і показує «Оновлюємо…»", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await showPages(page)
    await expect(rows(page)).toHaveCount(20)
    await chooseScenario(page, "Повільно (3 с)")
    await page.getByRole("button", { name: "Наступна сторінка" }).click()
    await expect(count(page)).toHaveText("Оновлюємо…")
    await expect(rows(page)).toHaveCount(20)
    await expect(range(page)).toHaveText("21-40 з 10 000", { timeout: 10_000 })
    await expect(count(page)).toHaveText("10 000 рахунків")
  })

  test("конфлікт: порівняння, «Зберегти мої зміни» перезаписує", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await chooseScenario(page, "Конфлікт збереження")
    await rows(page)
      .first()
      .getByRole("button", { name: /^Редагувати/ })
      .click()
    const dialog = page.getByRole("dialog", { name: /^Рахунок №/ })
    await dialog.getByLabel("Клієнт").fill("ТОВ «Мої зміни»")
    await dialog.getByRole("button", { name: "Зберегти" }).click()

    const conflict = page.getByRole("dialog", {
      name: "Запис змінив інший користувач",
    })
    await expect(conflict).toBeVisible()
    await expect(conflict.getByRole("row", { name: /Клієнт/ })).toContainText(
      "ТОВ «Мої зміни»",
    )
    await expectNoA11yViolations(page)
    await conflict.getByRole("button", { name: "Зберегти мої зміни" }).click()
    await expect(page.getByText("Рахунок збережено")).toBeVisible()
    await expect(rows(page).first()).toContainText("ТОВ «Мої зміни»")
  })

  test("конфлікт: «Взяти збережене» повертає форму до збереженої версії", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await chooseScenario(page, "Конфлікт збереження")
    const first = rows(page).first()
    const original = await first.locator('[aria-colindex="2"]').textContent()
    await first.getByRole("button", { name: /^Редагувати/ }).click()
    const dialog = page.getByRole("dialog", { name: /^Рахунок №/ })
    await dialog.getByLabel("Клієнт").fill("ТОВ «Чернетка»")
    await dialog.getByRole("button", { name: "Зберегти" }).click()
    await page.getByRole("button", { name: "Взяти збережене" }).click()
    await expect(page.getByText("Показано збережену версію")).toBeVisible()
    await expect(
      page.getByRole("dialog", { name: /^Рахунок №/ }).getByLabel("Клієнт"),
    ).toHaveValue(original ?? "")
  })
})

test.describe("вподобання на сервері (PF11)", () => {
  test("тема зберігається в профілі й повертається на чистому браузері", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, { theme: "light" }, "/")
    await page.keyboard.press("Control+k")
    await page
      .getByRole("combobox", { name: "Пошук і команди" })
      .fill("Тема: Темна")
    await page.keyboard.press("Enter")
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), PREFS_KEY))
      .toContain('"theme":"dark"')

    // Інший пристрій: кеш вигляду порожній, сесія та сама.
    await page.evaluate(() => {
      localStorage.removeItem("erp-ui:appearance")
    })
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  })
})

test.describe("дані: axe і ширини", () => {
  for (const width of [360, 768, 1440] as const)
    for (const theme of ["light", "dark"] as const)
      test(`${width}px ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await openWith(page, { theme }, DATA)
        await expect(count(page)).toHaveText("10 000 рахунків")
        await expect(
          page.locator('[data-slot="data-table"] [data-index="0"]'),
        ).toBeVisible()
        await expectNoA11yViolations(page)
        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        )
        expect(scrollWidth).toBeLessThanOrEqual(width)
      })

  test("відкрита панель розробника", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWith(page, {}, DATA)
    await page.getByRole("button", { name: /^Моки:/ }).click()
    await expect(
      page.getByRole("dialog", { name: "Панель розробника" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
