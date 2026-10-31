import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/** Модуль N5 «Сповіщення» на місці заглушки `/m/N5` (ADR-0046). Push — `push-device.spec.ts`. */
const MODULE = "/#/m/N5"
const INBOX = "/#/m/N5/inbox"
const SETTINGS = "/#/m/N5/notification-settings"

const section = (page: Page) => page.locator('[data-slot="push-device"]')

test.describe("модуль N5", () => {
  test("адреса модуля веде на сповіщення, пункти навігації є", async ({
    page,
  }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/N5\/inbox$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Сповіщення",
    )
    await expect(
      page.locator('a[href="#/m/N5/notification-settings"]').first(),
    ).toBeVisible()
    await expect(
      page.getByRole("list", { name: "Сповіщення" }).getByRole("listitem"),
    ).toHaveCount(6)
    await expectNoA11yViolations(page)
  })

  test("розширення: 10 на сторінку, «Показати ще» не потрібне для малого списку", async ({
    page,
  }) => {
    await openWith(page, {}, INBOX)
    await expect(page.getByText("Показано 6 з 6")).toBeVisible()
    await expect(page.getByRole("button", { name: "Показати ще" })).toBeHidden()
  })

  test("фікстури модуля: керівник відділу бачить свої сповіщення", async ({
    page,
  }) => {
    await openWith(page, {}, INBOX, { user: USERS.lead })
    await expect(
      page.getByRole("list", { name: "Сповіщення" }).getByRole("listitem"),
    ).toHaveCount(3)
    await expect(page).toHaveTitle("(2) Сповіщення")
  })

  test("лічильник у вкладці: переходи його не губить, «Прочитати все» прибирає", async ({
    page,
  }) => {
    await openWith(page, {}, INBOX)
    await expect(page).toHaveTitle("(3) Сповіщення")
    await page.goto(SETTINGS)
    await expect(page).toHaveTitle("(3) Налаштування сповіщень")
    await page.goto(INBOX)
    await page.getByRole("button", { name: "Прочитати все" }).click()
    await expect(page).toHaveTitle("Сповіщення")
  })

  test("на телефоні без горизонтальної прокрутки", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openWith(page, {}, SETTINGS)
    await expect(section(page)).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.goto(INBOX)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Сповіщення",
    )
    await expectNoHorizontalScroll(page)
  })
})

test.describe("стани сторінок N5", () => {
  for (const { scenario, text } of [
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
    { scenario: "Порожньо", text: "Сповіщень немає." },
  ])
    test(`сповіщення: ${scenario}`, async ({ page }) => {
      await openWith(page, {}, INBOX)
      await chooseScenario(page, scenario)
      await page.reload()
      await expect(page.getByText(text).first()).toBeVisible()
      await expectNoA11yViolations(page)
    })

  for (const { scenario, text } of [
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
  ])
    test(`налаштування: ${scenario}`, async ({ page }) => {
      await openWith(page, {}, SETTINGS)
      await chooseScenario(page, scenario)
      await page.reload()
      await expect(page.getByText(text).first()).toBeVisible()
    })

  test("повільно: скелетон, потім список", async ({ page }) => {
    await openWith(page, {}, INBOX)
    await chooseScenario(page, "Повільно (3 с)")
    await page.reload()
    await expect(
      page.locator('[data-slot="notification-inbox"] [data-slot="skeleton"]'),
    ).not.toHaveCount(0)
    await expect(
      page.getByRole("list", { name: "Сповіщення" }).getByRole("listitem"),
    ).toHaveCount(6, { timeout: 15_000 })
  })

  test("конфлікт: збереження налаштувань каже про відмову, вибір лишається", async ({
    page,
  }) => {
    await openWith(page, {}, SETTINGS)
    await chooseScenario(page, "Конфлікт збереження")
    const form = page.locator('[data-slot="notification-settings"]')
    const channel = form
      .getByRole("checkbox")
      .and(form.getByLabel(/Push/))
      .first()
    await channel.click()
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(form.getByRole("alert").first()).toBeVisible()
    await expect(form.getByRole("button", { name: "Зберегти" })).toBeEnabled()
  })
})
