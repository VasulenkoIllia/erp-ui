import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/** Реальний час (ADR-0051): канал подій, живе оновлення запису, «Редагує …». */
const PAGE = "/#/realtime"
const INVOICE = "#/data/inv-00001"
const NOTICE = /Запис зараз редагує Марта Шевчук/
const notice = (page: Page) =>
  page.locator('[data-slot="edit-lock-notice"]').getByText(NOTICE)

const status = (page: Page) => page.getByTestId("realtime-status")
const press = (page: Page, name: string) =>
  page.getByRole("button", { name }).click()

const openPage = async (page: Page) => {
  await openWith(page, {}, PAGE)
  await expect(status(page)).toHaveText("Підключено")
}

/** Перехід у межах застосунку: сервер моків живе в цій вкладці, перезавантаження його скине. */
const goInside = (page: Page, hash: string) =>
  page.evaluate((target) => {
    window.location.hash = target
  }, hash)

test.describe("реальний час", () => {
  test("зміна колеги видна без перезавантаження", async ({ page }) => {
    await openPage(page)
    await expect(page.getByTestId("realtime-version")).toHaveText("1")
    await press(page, "Колега змінює рахунок")
    await expect(page.getByTestId("realtime-version")).toHaveText("2")
    await expect(page.getByTestId("realtime-client")).toHaveText("ТОВ «Зоря»")
    await expect(page.getByTestId("realtime-log")).toContainText(
      "invoices.updated",
    )
    await expectNoA11yViolations(page)
  })

  test("обрив: перепідключення, далі видно й зміни за час обриву", async ({
    page,
  }) => {
    await openPage(page)
    await press(page, "Обірвати з'єднання")
    await expect(status(page)).toHaveText("Перепідключення")
    await expect(status(page)).toHaveText("Підключено")
    await expect(page.getByTestId("realtime-log")).toContainText(
      "realtime.resync",
    )
  })

  test("нове сповіщення змінює лічильник у назві вкладки", async ({ page }) => {
    await openPage(page)
    await expect(page).toHaveTitle(/^\(3\)/)
    await press(page, "Надіслати сповіщення")
    await expect(page).toHaveTitle(/^\(4\)/)
  })

  test("«Редагує …»: смуга й неактивна дія, поки колега не закінчить", async ({
    page,
  }) => {
    await openPage(page)
    const edit = page.getByRole("link", { name: "Редагувати рахунок" })
    await expect(edit).toBeVisible()
    await press(page, "Колега почав редагувати")
    await expect(notice(page)).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Редагувати рахунок" }),
    ).toBeDisabled()
    await expectNoA11yViolations(page)
    await press(page, "Колега закінчив")
    await expect(notice(page)).toBeHidden()
    await expect(edit).toBeVisible()
  })

  test("картка рахунку під час редагування колеги — режим перегляду", async ({
    page,
  }) => {
    await openPage(page)
    await press(page, "Колега почав редагувати")
    await expect(notice(page)).toBeVisible()
    await goInside(page, INVOICE)
    await expect(notice(page)).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Редагувати" }),
    ).toBeDisabled()
  })

  test("своя форма тримає блокування, закриття його відпускає", async ({
    page,
  }) => {
    await openWith(page, {}, `/${INVOICE}`)
    const taken = page.waitForRequest(
      (request) =>
        request.method() === "PUT" && request.url().endsWith("/lock"),
    )
    await page.getByRole("button", { name: "Редагувати" }).click()
    await taken
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    const released = page.waitForRequest(
      (request) =>
        request.method() === "DELETE" && request.url().endsWith("/lock"),
    )
    await page.keyboard.press("Escape")
    await released
    await expect(dialog).toBeHidden()
  })

  test("друга вкладка не відкриває свого каналу", async ({ page, context }) => {
    await openPage(page)
    const second = await context.newPage()
    const streams: string[] = []
    second.on("request", (request) => {
      if (request.url().endsWith("/api/v1/events")) streams.push(request.url())
    })
    await openPage(second)
    expect(streams).toEqual([])
    await second.close()
  })

  test("без каналу сторінка працює, стан чесний", async ({ page }) => {
    await openPage(page)
    await chooseScenario(page, "Немає доступу")
    await page.reload()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Реальний час",
    )
    await expect(status(page)).toHaveText("Вимкнено")
  })

  test("вузький екран без горизонтальної прокрутки", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openPage(page)
    await press(page, "Колега почав редагувати")
    await expect(notice(page)).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})
