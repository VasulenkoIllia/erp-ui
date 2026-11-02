import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок PF03b (ADR-0058): налаштування нумерації на моках і номер, який дає проведення документа.
 */
const NUMBERING = "/#/settings/numbering"

const template = (page: Page) =>
  page.getByRole("textbox", { name: "Шаблон номера" })
const preview = (page: Page) =>
  page.getByRole("status", { name: "Наступний номер" })

test.describe("PF03b: нумерація документів", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("новий шаблон із мітками: перегляд, збереження, номер на проведенні", async ({
    page,
  }) => {
    await openWith(page, {}, NUMBERING)
    await expect(
      page.getByRole("heading", { level: 3, name: "Документи" }),
    ).toBeVisible()
    // Засів уже видав шість номерів цього року.
    await expect(preview(page)).toHaveText("ДОК-2026-0007")
    await expectNoA11yViolations(page)

    await template(page).fill("РФ-")
    const tokens = page.getByRole("group", { name: "Вставити мітку" })
    await tokens.getByRole("button", { name: /^Вставити \{YYYY\}/ }).click()
    await template(page).press("End")
    await template(page).pressSequentially("-")
    await tokens.getByRole("button", { name: /^Вставити \{####\}/ }).click()
    await expect(template(page)).toHaveValue("РФ-{YYYY}-{####}")
    await expect(preview(page)).toHaveText("РФ-2026-0007")
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(page.getByText("Нумерацію збережено")).toBeVisible()

    await page
      .getByRole("navigation", { name: "Основна навігація" })
      .getByRole("link", { name: "Документ", exact: true })
      .click()
    const card = page.getByTestId("document-card")
    const heading = card.getByRole("heading", { level: 3 })
    await expect(heading).toHaveText("Без номера")
    await card
      .getByRole("group", { name: "Дії документа" })
      .getByRole("button", { name: "Провести" })
      .click()
    await page
      .getByRole("alertdialog", { name: "Провести документ?" })
      .getByRole("button", { name: "Провести документ" })
      .click()
    await expect(heading).toHaveText("РФ-2026-0007")
  })

  test("шаблон без року при скиданні щороку: помилка біля поля, збереження не йде", async ({
    page,
  }) => {
    await openWith(page, {}, NUMBERING)
    await template(page).fill("ДОК-{####}")
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(template(page)).toHaveAccessibleDescription(
      /Додайте рік \{YYYY\} чи \{YY\}/,
    )
    await expect(preview(page)).toHaveText(
      "Виправте шаблон, щоб побачити номер",
    )
    await expectNoA11yViolations(page)
    await page.getByRole("switch", { name: "Щороку з 1" }).click()
    await expect(template(page)).not.toHaveAccessibleDescription(/Додайте рік/)
    // Без скидання щороку — інший лічильник: новий відлік з 1, зайняті номери сервер пропустить.
    await expect(preview(page)).toHaveText("ДОК-0001")
  })

  test("керівник відділу лише дивиться", async ({ page }) => {
    await openWith(page, {}, NUMBERING, { user: USERS.lead })
    await expect(
      page.getByText(/Ви бачите нумерацію, але змінювати її/),
    ).toBeVisible()
    await expect(template(page)).not.toBeEditable()
    await expect(page.getByRole("button", { name: "Зберегти" })).toHaveCount(0)
    await expect(preview(page)).toHaveText("ДОК-2026-0007")
  })

  test("менеджер з продажу без права на нумерацію — «Немає доступу»", async ({
    page,
  }) => {
    await openWith(page, {}, NUMBERING, { user: USERS.sales })
    await expect(
      page.getByRole("heading", { name: "Немає доступу" }),
    ).toBeVisible()
  })
})

test.describe("PF03b: нумерація на телефоні", () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test("список і форма одне під одним, без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, { theme: "dark" }, NUMBERING)
    await expect(preview(page)).toHaveText("ДОК-2026-0007")
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
