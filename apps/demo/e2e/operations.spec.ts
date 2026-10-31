import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

const AUDIT = "/#/settings/audit"
const INTEGRATIONS = "/#/settings/integrations"
const NOTIFICATIONS = "/#/settings/notifications"
const USERS_PAGE = "/#/settings/users"
const LOGIN = "/#/login"

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

async function confirmWithPassword(page: Page) {
  const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
  await expect(reauth).toBeVisible()
  await reauth.getByLabel("Пароль", { exact: true }).fill("demo")
  await reauth.getByRole("button", { name: "Підтвердити", exact: true }).click()
  await expect(reauth).toBeHidden()
}

test.describe("журнал аудиту (ADR-0013)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("події, розділ, подробиці «було → стало», пошук, експорт CSV", async ({
    page,
  }) => {
    await openWith(page, {}, AUDIT)
    const list = page.getByRole("list", { name: "Події журналу аудиту" })
    const events = list.locator('[data-slot="audit-event"]')
    await expect(events).toHaveCount(10)
    await expect(page.getByText("Показано 10 з 10")).toBeVisible()

    await page.getByRole("combobox", { name: "Розділ" }).click()
    await page.getByRole("option", { name: "Безпека" }).click()
    await expect(events).toHaveCount(1)
    await page
      .getByRole("button", { name: "Подробиці: Зміна політики безпеки" })
      .click()
    const changes = page.getByRole("list", { name: "Що змінилося" })
    await expect(
      changes
        .getByRole("listitem")
        .filter({ hasText: "Мінімальна довжина пароля" }),
    ).toContainText("Було8Стало10")
    await expectNoA11yViolations(page)

    await page.getByLabel("Пошук у журналі").fill("немає такого")
    await expect(page.getByText("За цими умовами подій немає.")).toBeVisible()
    await page.getByRole("button", { name: "Скинути фільтри" }).click()
    await expect(events).toHaveCount(10)

    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "Експорт CSV" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^audit-\d{4}-\d{2}-\d{2}\.csv$/)
    await expect(toast(page, "Файл журналу завантажено")).toBeVisible()
  })

  test("без права — сторінка заборонена", async ({ page }) => {
    await openWith(page, {}, AUDIT, { user: USERS.sales })
    await expect(page.getByText("Немає доступу")).toBeVisible()
  })
})

test.describe("вебхуки (ADR-0013)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("на телефоні журнал доставок на всю ширину, закриття лишається на місці", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openWith(page, {}, INTEGRATIONS)
    await page
      .getByRole("button", {
        name: "Дії: https://1c.zoriana.example/hooks/erp",
      })
      .click()
    await page.getByRole("menuitem", { name: "Журнал доставок" }).click()
    const sheet = page.getByRole("dialog", { name: "Журнал доставок" })
    const deliveries = sheet.getByRole("list", { name: "Доставки" })
    await expect(deliveries.getByRole("listitem").first()).toBeVisible()
    await expect.poll(async () => (await sheet.boundingBox())?.width).toBe(360)
    await deliveries.getByRole("listitem").last().scrollIntoViewIfNeeded()
    await expect(
      sheet.getByRole("button", { name: "Закрити" }),
    ).toBeInViewport()
    await expectNoA11yViolations(page)
  })

  test("створення з перевіркою адреси, секрет один раз, тест, журнал доставок, видалення", async ({
    page,
  }) => {
    await openWith(page, {}, INTEGRATIONS)
    const list = page.getByRole("list", { name: "Вебхуки" })
    await expect(list.getByRole("listitem")).toHaveCount(2)
    await expect(list.getByText("2 невдалі доставки поспіль")).toBeVisible()

    await page.getByRole("button", { name: "Додати вебхук" }).click()
    const dialog = page.getByRole("dialog", { name: "Новий вебхук" })
    await dialog.getByRole("button", { name: "Додати", exact: true }).click()
    await expect(dialog.getByText("Заповніть це поле")).toBeVisible()
    await expect(dialog.getByText("Оберіть хоча б одну подію")).toBeVisible()
    const url = dialog.getByLabel("Адреса")
    await url.fill("http://crm.example.com/hooks")
    await dialog
      .getByRole("group", { name: "Рахунки" })
      .getByRole("checkbox", { name: "Рахунок змінено" })
      .check()
    await dialog.getByRole("button", { name: "Додати", exact: true }).click()
    await expect(
      dialog.getByText(
        "Лише https://, бо дані компанії не надсилаємо відкрито",
      ),
    ).toBeVisible()
    await url.fill("https://crm.example.com/hooks")
    await dialog.getByLabel("Опис (необов'язково)").fill("CRM партнера")
    await expectNoA11yViolations(page)
    await dialog.getByRole("button", { name: "Додати", exact: true }).click()
    await confirmWithPassword(page)

    const secret = page.getByRole("dialog", {
      name: "Збережіть секрет підпису",
    })
    await expect(secret.locator("code")).toHaveText(/^whsec_\w{20,}$/)
    await secret.getByRole("button", { name: "Готово" }).click()
    await expect(list.getByRole("listitem")).toHaveCount(3)

    const actions = page.getByRole("button", {
      name: "Дії: https://crm.example.com/hooks",
    })
    await actions.click()
    await page
      .getByRole("menuitem", { name: "Надіслати тестову подію" })
      .click()
    await expect(toast(page, "Тестову подію доставлено (200)")).toBeVisible()

    await actions.click()
    await page.getByRole("menuitem", { name: "Журнал доставок" }).click()
    const sheet = page.getByRole("dialog", { name: "Журнал доставок" })
    const deliveries = sheet.getByRole("list", { name: "Доставки" })
    await expect(deliveries.getByRole("listitem")).toHaveCount(1)
    await sheet
      .getByRole("button", { name: "Подробиці доставки: Тестова подія" })
      .click()
    await expect(sheet.getByText(/X-Erp-Signature: t=\d+,v1=/)).toBeVisible()
    await expectNoA11yViolations(page)
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()

    await actions.click()
    await page.getByRole("menuitem", { name: "Видалити" }).click()
    await page
      .getByRole("alertdialog", { name: "Видалити вебхук?" })
      .getByRole("button", { name: "Видалити" })
      .click()
    await expect(toast(page, "Вебхук видалено")).toBeVisible()
    await expect(list.getByRole("listitem")).toHaveCount(2)
  })

  test("зміна рахунку доходить до підписки «Рахунок змінено»", async ({
    page,
  }) => {
    await openWith(page, {}, INTEGRATIONS)
    const actions = page.getByRole("button", {
      name: "Дії: https://1c.zoriana.example/hooks/erp",
    })
    await actions.click()
    await page.getByRole("menuitem", { name: "Журнал доставок" }).click()
    const deliveries = page
      .getByRole("dialog", { name: "Журнал доставок" })
      .getByRole("list", { name: "Доставки" })
    await expect(deliveries.getByRole("listitem")).toHaveCount(3)
    await page.keyboard.press("Escape")

    // Зміна запису через API даних (як збереження форми) — подія invoices.updated.
    await page.evaluate(async () => {
      const response = await fetch("/api/v1/invoices?perPage=1", {
        credentials: "include",
        headers: { "X-Company-Id": "zoriana" },
      })
      const { data } = (await response.json()) as {
        data: { id: string; version: number }[]
      }
      const first = data[0]
      if (!first) return
      await fetch(`/api/v1/invoices/${first.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Company-Id": "zoriana",
        },
        body: JSON.stringify({ status: "paid", version: first.version }),
      })
    })
    await actions.click()
    await page.getByRole("menuitem", { name: "Журнал доставок" }).click()
    await expect(deliveries.getByRole("listitem")).toHaveCount(4)
    await expect(
      deliveries.getByRole("listitem").first().getByText("Рахунок змінено"),
    ).toBeVisible()
  })
})

test.describe("сповіщення (ADR-0013)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("матриця подій і каналів, обов'язкові, тихі години, збереження", async ({
    page,
  }) => {
    await openWith(page, {}, NOTIFICATIONS, { user: USERS.sales })
    const required = page.getByRole("checkbox", {
      name: "Email: Вхід з нового пристрою (обов'язково)",
    })
    await expect(required).toBeChecked()
    await expect(required).toBeDisabled()
    const save = page.getByRole("button", { name: "Зберегти", exact: true })
    await expect(save).toBeDisabled()

    const paidEmail = page.getByRole("checkbox", {
      name: "Email: Рахунок оплачено",
    })
    await expect(paidEmail).not.toBeChecked()
    await paidEmail.check()
    await page
      .getByRole("switch", { name: "Не турбувати в тихі години" })
      .click()
    await page.getByLabel("З", { exact: true }).fill("23:00")
    await expectNoA11yViolations(page)
    await save.click()
    await expect(toast(page, "Налаштування сповіщень збережено")).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole("checkbox", { name: "Email: Рахунок оплачено" }),
    ).toBeChecked()
    await expect(page.getByLabel("З", { exact: true })).toHaveValue("23:00")

    await page.getByRole("button", { name: "Повернути типові" }).click()
    await expect(
      page.getByRole("checkbox", { name: "Email: Рахунок оплачено" }),
    ).not.toBeChecked()
    await expect(save).toBeEnabled()
  })

  test("на телефоні — картки з підписами каналів", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWith(page, {}, NOTIFICATIONS, { user: USERS.sales })
    await expect(page.getByText("Email · обов'язково").first()).toBeVisible()
    await expectNoA11yViolations(page)
  })
})

test.describe("доступ користувачів (ADR-0013)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("панель доступу: сесія, блокування з причиною, вхід заблоковано, журнал", async ({
    page,
  }) => {
    await openWith(page, {}, USERS_PAGE)
    await page.getByRole("button", { name: "Доступ: Іван Петренко" }).click()
    const sheet = page.getByRole("dialog", { name: "Доступ: Іван Петренко" })
    await expect(sheet.getByText("Активний", { exact: true })).toBeVisible()
    await expectNoA11yViolations(page)
    await sheet
      .getByRole("button", {
        name: "Завершити сесію: Іван Петренко, Chrome, Android",
      })
      .click()
    await expect(toast(page, "Сесію завершено")).toBeVisible()
    await expect(sheet.getByText("Активних сесій немає.")).toBeVisible()

    await sheet.getByRole("button", { name: "Заблокувати" }).click()
    const block = page.getByRole("dialog", {
      name: "Іван Петренко: заблокувати акаунт?",
    })
    await block.getByRole("button", { name: "Заблокувати" }).click()
    await expect(block.getByText("Заповніть це поле")).toBeVisible()
    await block.getByLabel("Причина").fill("Звільнення 13.10.2026")
    await block.getByRole("button", { name: "Заблокувати" }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Акаунт заблоковано")).toBeVisible()
    await expect(
      sheet.getByText("Причина: Звільнення 13.10.2026"),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(
      page
        .getByRole("list", { name: "Користувачі компанії" })
        .getByRole("listitem")
        .filter({ hasText: "Іван Петренко" })
        .getByText("Заблоковано"),
    ).toBeVisible()

    await page.goto(AUDIT)
    await expect(
      page
        .getByRole("list", { name: "Події журналу аудиту" })
        .getByText("Блокування акаунта"),
    ).toBeVisible()

    await page
      .getByRole("button", { name: "Меню користувача: Олена Коваль" })
      .click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()
    await page.goto("about:blank")
    await page.goto(LOGIN)
    await page.getByLabel("Email").fill("ivan@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(page.getByRole("alert")).toContainText(
      "Акаунт заблоковано. Зверніться до адміністратора компанії.",
    )
  })

  test("активні сесії компанії: пошук і завершення", async ({ page }) => {
    await openWith(page, {}, USERS_PAGE)
    const sessions = page.getByRole("list", {
      name: "Активні сесії користувачів",
    })
    await expect(sessions.getByRole("listitem")).toHaveCount(4)
    await page.getByLabel("Пошук за ім'ям чи email").fill("іван")
    await expect(sessions.getByRole("listitem")).toHaveCount(1)
    await sessions
      .getByRole("button", { name: /Завершити сесію: Іван Петренко/ })
      .click()
    await expect(toast(page, "Сесію завершено")).toBeVisible()
    await expect(page.getByText("Активних сесій немає.")).toBeVisible()
  })
})
