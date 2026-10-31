import { expect, test } from "@playwright/test"

import { openWith, USERS } from "./helpers"

/**
 * Перший клік кнопки форми  не губиться (ADR-0026, ADR-0027): поле перевіряється при виході з нього,
 * і помилка під ним зсувала кнопку між натисканням і відпусканням миші. Кнопки форм кіта не
 * забирають фокус у поля (`keepFieldFocus` з `erp/form`).
 */
test.describe("форми: перший клік кнопки", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("демо «Форми»: «Зберегти» з порожнім полем у фокусі — одразу зведення помилок", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/forms")
    await page
      .getByRole("textbox", { name: "Номер рахунку", exact: true })
      .click()
    await page
      .getByTestId("invoice-form")
      .getByRole("button", { name: "Зберегти" })
      .click()
    const summary = page.locator("[data-slot=form-error-summary]")
    await expect(summary).toBeFocused()
    await expect(summary).toContainText("Виправте 3 помилки")
  })

  test("профіль: «Зберегти», поки фокус у неправильному телефоні, — одразу перевірка всієї форми", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/settings/profile", { user: USERS.sales })
    const name = page.getByLabel("Ім'я та прізвище")
    await expect(name).toHaveValue("Іван Петренко")
    await name.fill("")
    await page.getByLabel("Контактний телефон").fill("+38067")
    await page.getByRole("button", { name: "Зберегти", exact: true }).click()
    // Спроба відправки веде до першого поля з помилкою.
    await expect(name).toBeFocused()
    await expect(page.getByLabel("Контактний телефон")).toHaveAttribute(
      "aria-invalid",
      "true",
    )
  })

  test("новий вид: «Скасувати» з порожньою назвою в фокусі закриває діалог з першого кліку", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/data")
    await page.getByRole("button", { name: /^Вид списку:/ }).click()
    await page.getByRole("menuitem", { name: "Зберегти як новий вид…" }).click()
    const dialog = page.getByRole("dialog", { name: "Новий вид" })
    // Фокус у полі — кліком: тест не залежить від того, коли діалог сам ставить початковий фокус
    // (під навантаженням ×10 він інколи запізнювався).
    const name = dialog.getByLabel("Назва")
    await name.click()
    await expect(name).toBeFocused()
    // Біля верхнього краю кнопки: діалог посередині екрана росте на висоту помилки, і футер
    // зсувається на половину її.
    await dialog
      .getByRole("button", { name: "Скасувати" })
      .click({ position: { x: 8, y: 2 } })
    await expect(dialog).toBeHidden()
  })
})
