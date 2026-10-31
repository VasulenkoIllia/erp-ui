import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith } from "./helpers"

const PATH = "/#/forms"

const toast = (page: Page, text: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text })

const textbox = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true })

test.describe("форми: axe", () => {
  for (const theme of ["light", "dark"] as const)
    test(`помилки після відправки, ${theme}`, async ({ page }) => {
      await openWith(page, { theme }, PATH)
      await page
        .getByTestId("invoice-form")
        .getByRole("button", { name: "Зберегти" })
        .click()
      await expect(page.getByText("Виправте 3 помилки")).toBeVisible()
      await expectNoA11yViolations(page)
    })

  test("360px, діалог із введенням слова", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openWith(page, { palette: "graphite" }, PATH)
    await page.getByRole("button", { name: "Видалити компанію" }).click()
    await expect(
      page.getByRole("alertdialog", { name: "Видалити компанію назавжди?" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })
})

test.describe("форми: поведінка (ADR-0015)", () => {
  test("порожня форма: зведення в фокусі, перехід до поля, помилка — при виході з поля", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const number = textbox(page, "Номер рахунку")
    // Помилка з'являється при виході з поля, а не під час введення.
    await number.click()
    await number.press("Tab")
    await expect(number).toHaveAttribute("aria-invalid", "true")
    await expect(number).toHaveAccessibleDescription(
      /^Номер РФ-0001 уже зайнятий.* Заповніть це поле$/,
    )

    // «Зберегти» не вимикається: після спроби — зведення помилок у фокусі.
    await page
      .getByTestId("invoice-form")
      .getByRole("button", { name: "Зберегти" })
      .click()
    const summary = page.locator("[data-slot=form-error-summary]")
    await expect(summary).toBeFocused()
    await expect(summary).toContainText("Виправте 3 помилки")
    await summary
      .getByRole("button", { name: "Контрагент: Заповніть це поле" })
      .click()
    await expect(textbox(page, "Контрагент")).toBeFocused()

    // Виправлене поле зникає зі зведення.
    await textbox(page, "Контрагент").fill("ТОВ «Сонях»")
    await expect(summary).toContainText("Виправте 2 помилки")
    await expect(
      summary.getByRole("button", { name: /^Контрагент/ }),
    ).toHaveCount(0)

    // Поле без прав — лише читання, у фокусі.
    const company = textbox(page, "Компанія")
    await expect(company).toHaveAttribute("readonly")
    await expect(company).toBeEnabled()
  })

  test("сума прописом, серверна помилка біля поля, збереження", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    await textbox(page, "Номер рахунку").fill("РФ-0001")
    await textbox(page, "Контрагент").fill("ТОВ «Сонях»")
    const amount = textbox(page, "Сума")
    await amount.pressSequentially("48600")
    await expect(amount).toHaveAccessibleDescription(
      "₴ Сорок вісім тисяч шістсот гривень 00 копійок",
    )

    const save = page
      .getByTestId("invoice-form")
      .getByRole("button", { name: "Зберегти" })
    await save.click()
    const number = textbox(page, "Номер рахунку")
    await expect(number).toHaveAccessibleDescription(
      /Такий номер уже є, оберіть інший$/,
    )
    await expect(number).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByText("Виправте 1 помилку")).toBeVisible()

    await number.fill("РФ-0002")
    await save.click()
    await expect(toast(page, "Рахунок збережено")).toBeVisible()
    await expect(page.locator("[data-slot=form-error-summary]")).toHaveCount(0)

    // Після збереження змін немає — повторне збереження нічого не робить, вихід без діалогу.
    await save.click()
    await expect(toast(page, "Змін немає, зберігати нічого")).toBeVisible()
    await page.getByRole("link", { name: "Мови й формати" }).click()
    await expect(
      page.getByRole("heading", { level: 1, name: "Мови й формати" }),
    ).toBeVisible()
  })

  test("«Сплатити до» не раніше дати рахунку", async ({ page }) => {
    await openWith(page, {}, PATH)
    const issued = textbox(page, "Дата рахунку")
    const due = textbox(page, "Сплатити до")
    await issued.fill("")
    await issued.pressSequentially("20102026")
    await due.fill("")
    await due.pressSequentially("15102026")
    await due.press("Tab")
    await expect(due).toHaveAccessibleDescription("Не раніше 20.10.2026")
  })

  test("незбережені зміни: «Залишитися» лишає введене, «Вийти без збереження» — переходить", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const comment = textbox(page, "Коментар")
    await comment.fill("Чернетка")
    const nav = page.getByRole("link", { name: "Мови й формати" })
    await nav.click()
    const dialog = page.getByRole("alertdialog", {
      name: "Вийти без збереження?",
    })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Залишитися" }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/#\/forms$/)
    await expect(comment).toHaveValue("Чернетка")

    await nav.click()
    await dialog.getByRole("button", { name: "Вийти без збереження" }).click()
    await expect(
      page.getByRole("heading", { level: 1, name: "Мови й формати" }),
    ).toBeVisible()
  })

  test("три рівні підтвердження: тост «Скасувати», діалог, введення слова", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    // Рівень 1 — зворотна дія без діалогу.
    await page.getByRole("button", { name: "Архівувати рахунок" }).click()
    await toast(page, "Рахунок архівовано")
      .getByRole("button", { name: "Скасувати" })
      .click()
    await expect(toast(page, "Рахунок повернуто з архіву")).toBeVisible()

    // Рівень 2 — кнопка називає наслідок; Escape закриває, фокус — назад на кнопку,
    // з якої відкрили. Відкриваємо з клавіатури: після кліку в тості sonner, втрачаючи фокус,
    // повертає його на «Архівувати рахунок», навіть коли клікнули іншу кнопку.
    const remove = page.getByRole("button", { name: "Видалити 3 рахунки" })
    await remove.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("alertdialog", {
      name: "Видалити 3 рахунки?",
    })
    await expect(dialog).toHaveAccessibleDescription(
      "Рахунки РФ-0012, РФ-0013 і РФ-0014 буде видалено.",
    )
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(remove).toBeFocused()
    await remove.click()
    await dialog.getByRole("button", { name: "Видалити 3 рахунки" }).click()
    await expect(dialog).toBeHidden()
    await expect(toast(page, "3 рахунки видалено")).toBeVisible()

    // Рівень 3 — без слова дія не виконується.
    await page.getByRole("button", { name: "Видалити компанію" }).click()
    const critical = page.getByRole("alertdialog", {
      name: "Видалити компанію назавжди?",
    })
    const confirm = critical.getByRole("button", {
      name: "Видалити компанію назавжди",
    })
    await confirm.click()
    const word = critical.getByRole("textbox", {
      name: "Щоб підтвердити, введіть «ВИДАЛИТИ»",
    })
    await expect(word).toBeFocused()
    await expect(word).toHaveAccessibleDescription(
      "Введіть «ВИДАЛИТИ» точно, як написано",
    )
    await word.fill("ВИДАЛИТИ")
    await confirm.click()
    await expect(critical).toBeHidden()
    await expect(toast(page, "Компанію видалено (демо)")).toBeVisible()

    // Відкритий знову — поле слова порожнє.
    await page.getByRole("button", { name: "Видалити компанію" }).click()
    await expect(word).toHaveValue("")
  })
})
