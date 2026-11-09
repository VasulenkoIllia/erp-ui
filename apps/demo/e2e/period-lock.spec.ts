import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок PF13 (ADR-0069): закриті періоди на моках — у демо закрито по 20.10.2026. Дія в закритому періоді
 * дає 422 біля поля дати й причину на кнопці; виняток — лише з правом, і з ним документ знову змінюється.
 */
const PAGE = "/#/settings/period-lock"
const REASON =
  "Період закрито: документ із датою в закритому періоді не змінюють"

const sample = (page: Page) => page.getByTestId("period-lock-document")
const actions = (page: Page) =>
  sample(page).getByRole("group", { name: "Дії документа" })

test.describe("PF13: закриті періоди", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("закрита чернетка: смуга, «Провести» неактивна з причиною; дата закритого періоду — 422 біля поля", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await expect(page.getByText("Закрито по 20.10.2026 включно.")).toBeVisible()
    await expect(
      sample(page).getByText("Період закрито по 20.10.2026"),
    ).toBeVisible()
    const submit = actions(page).getByRole("button", { name: "Провести" })
    await expect(submit).toHaveAttribute("aria-disabled", "true")
    await expect(submit).toHaveAccessibleDescription(REASON)
    await expect(sample(page).getByLabel("Дата документа")).toHaveAttribute(
      "readonly",
    )
    await expectNoA11yViolations(page)

    await sample(page)
      .getByRole("button", { name: "Чернетка, 02.11.2026" })
      .click()
    const date = sample(page).getByLabel("Дата документа")
    await expect(date).toHaveValue("02.11.2026")
    await expect(date).toHaveAccessibleDescription(
      /Період по 20\.10\.2026 закрито/,
    )
    await date.fill("15.10.2026")
    await sample(page).getByRole("button", { name: "Зберегти" }).click()
    await expect(date).toHaveAttribute("aria-invalid", "true")
    await expect(date).toHaveAccessibleDescription(
      /Цей період закрито: виберіть дату після закритого періоду/,
    )
  })

  test("сторно закритого документа проходить, скасувати — ні", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/document?id=doc-8")
    const card = page.getByTestId("document-card")
    await expect(card.getByText("Період закрито по 20.10.2026")).toBeVisible()
    const bar = card.getByRole("group", { name: "Дії документа" })
    await expect(
      bar.getByRole("button", { name: "Скасувати" }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(
      bar.getByRole("button", { name: "Сторнувати" }),
    ).not.toHaveAttribute("aria-disabled", "true")
  })

  test("виняток собі — документ закритого періоду знову змінюється, видача в журналі", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await page.getByRole("button", { name: "Дати виняток" }).click()
    const dialog = page.getByRole("dialog", { name: "Новий виняток" })
    await dialog.getByRole("combobox", { name: "Кому" }).click()
    await page.getByRole("combobox", { name: "Пошук: Кому" }).fill("Олена")
    await page.getByRole("option", { name: /Олена Коваль/ }).click()
    await dialog.getByLabel("Причина").fill("Виправити акт за жовтень")
    await dialog.getByRole("button", { name: "Дати виняток" }).click()
    await expect(dialog).toBeHidden()
    const list = page.getByRole("list", { name: "Чинні винятки" })
    await expect(list.getByText("Олена Коваль", { exact: true })).toBeVisible()

    await expect(sample(page).getByText(/Для вас діє виняток до/)).toBeVisible()
    await expect(
      actions(page).getByRole("button", { name: "Провести" }),
    ).not.toHaveAttribute("aria-disabled", "true")
    await expectNoA11yViolations(page)

    // Перехід у застосунку: мок і журнал живуть у цій сторінці, перезавантаження їх скинуло б.
    await page
      .getByRole("navigation", { name: "Основна навігація" })
      .getByRole("link", { name: "Журнал аудиту" })
      // Журнал демо (`/settings/audit`); другий такий пункт — модуль A5 з тим самим журналом.
      .first()
      .click()
    await expect(
      page.getByText("Виняток закритого періоду").first(),
    ).toBeVisible()
  })

  test("відкрити закритий період знову — лише з причиною", async ({ page }) => {
    await openWith(page, {}, PAGE)
    const field = page.getByLabel("Закрито по")
    await field.fill("30.09.2026")
    const reason = page.getByLabel("Причина відкриття")
    await expect(reason).toBeVisible()
    await page.getByRole("button", { name: "Зберегти" }).first().click()
    await expect(reason).toHaveAttribute("aria-invalid", "true")
    await reason.fill("Пропущений акт за вересень")
    await page.getByRole("button", { name: "Зберегти" }).first().click()
    await expect(page.getByText("Закрито по 30.09.2026 включно.")).toBeVisible()
  })

  test("керівник відділу: лише перегляд, винятків не бачить", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE, { user: USERS.lead })
    await expect(
      page.getByText(
        "Змінювати закриті періоди може лише людина з правом на їх налаштування.",
      ),
    ).toBeVisible()
    await expect(page.getByLabel("Закрито по")).toHaveAttribute("readonly")
    await expect(
      page.getByRole("button", { name: /^Закрити рік/ }),
    ).toHaveCount(0)
    await expect(page.getByText("Немає доступу").first()).toBeVisible()
  })

  test("телефон: без горизонтальної прокрутки, axe", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openWith(page, { theme: "dark" }, PAGE)
    await expect(
      sample(page).getByText("Період закрито по 20.10.2026"),
    ).toBeVisible()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
