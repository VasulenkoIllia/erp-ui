import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль A5 «Аудит та історія» на місці заглушки `/m/A5` (ADR-0045) і шухляда історії запису на
 * картках. У журналі компанії «Зоряна» є договір із трьома подіями (фікстури модуля) і зміна адреси
 * організації `org-001` (засів демо).
 */
const MODULE = "/#/m/A5"
const JOURNAL = "/#/m/A5/audit"
const ORGANIZATION = "/#/organizations/org-001?tab=aside"
const OTHER_ORGANIZATION = "/#/organizations/org-002?tab=aside"
const CONTRACT = "Договір 12/2026"

const sheet = (page: Page) =>
  page.getByRole("dialog", { name: "Історія запису" })
type Scope = Page | ReturnType<Page["getByRole"]>
const events = (scope: Scope) => scope.locator('[data-slot="audit-event"]')
const change = (scope: Scope, label: string) =>
  scope.locator('[data-slot="audit-change"]').filter({ hasText: label })
const navItem = (page: Page) => page.locator('a[href="#/m/A5/audit"]')

test.describe("модуль A5", () => {
  test("адреса модуля веде на журнал, пункт навігації є", async ({ page }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/A5\/audit$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Журнал аудиту",
    )
    await expect(navItem(page).first()).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Експорт CSV" }),
    ).toBeVisible()
  })

  test("з рядка журналу: шухляда запису з різницею, фокус повертається", async ({
    page,
  }) => {
    await openWith(page, {}, JOURNAL)
    const open = page
      .getByRole("button", { name: `Історія запису: ${CONTRACT}` })
      .first()
    await open.click()
    const drawer = sheet(page)
    await expect(drawer.getByText(CONTRACT).first()).toBeVisible()
    await expect(events(drawer)).toHaveCount(3)

    const subject = change(drawer, "Предмет договору").first()
    await expect(subject.locator("ins").first()).toHaveText("і візків ")
    await expect(subject.locator("ins").nth(1)).toHaveText(" та Києві")
    await expect(subject.locator("del")).toHaveCount(0)
    await expect(subject.locator("ins").first()).toHaveCSS(
      "text-decoration-line",
      "underline",
    )
    await expect(change(drawer, "Сума").locator("del")).toHaveCSS(
      "text-decoration-line",
      "line-through",
    )

    await expect(change(drawer, "Мітки").locator("ins")).toHaveText("пріоритет")
    await expect(drawer.getByText("Уточнили обсяг із клієнтом")).toBeVisible()
    await expectNoA11yViolations(page)

    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
    await expect(open).toBeFocused()
  })

  test("назва дії проекту — з розширення, важливіша за назву сервера", async ({
    page,
  }) => {
    await openWith(page, {}, JOURNAL)
    await expect(events(page).filter({ hasText: "Новий договір" })).toHaveCount(
      1,
    )
    await expect(page.getByText("Договори: створення")).toHaveCount(0)
  })

  test("без `audit:read`: пункту немає, адреса каже «Немає доступу» без запиту", async ({
    page,
  }) => {
    const requests: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("/audit-events")) requests.push(request.url())
    })
    await openWith(page, {}, JOURNAL, { user: USERS.sales })
    await expect(page.getByText("Немає доступу")).toBeVisible()
    await expect(navItem(page)).toHaveCount(0)
    expect(requests).toEqual([])
  })

  for (const { scenario, text } of [
    { scenario: "Порожньо", text: "Подій ще немає." },
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
  ]) {
    test(`сценарій «${scenario}»`, async ({ page }) => {
      await openWith(page, {}, JOURNAL)
      await expect(events(page).first()).toBeVisible()
      await chooseScenario(page, scenario)
      await page.reload()
      await expect(page.getByText(text).first()).toBeVisible()
      await expect(events(page)).toHaveCount(0)
    })
  }
})

test.describe("шухляда на картці запису", () => {
  test("«Уся історія» відкриває всі зміни, блок на картці лишається", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATION)
    await expect(events(page)).toHaveCount(1)
    const openButton = page.getByRole("button", { name: "Уся історія" })
    await openButton.click()
    const drawer = sheet(page)
    const address = change(drawer, "Юридична адреса")
    await expect(address.locator("del")).toHaveText(["Київ", "5"])
    await expect(address.locator("ins")).toHaveText(["Львів", "7"])
    await expect(
      drawer.getByText("Клієнт надіслав нові реквізити"),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
    await expect(openButton).toBeFocused()
  })

  test("без `audit:read` блок каже «Немає доступу», кнопки немає", async ({
    page,
  }) => {
    await openWith(page, {}, OTHER_ORGANIZATION, { user: USERS.sales })
    await expect(page.getByText("Немає доступу")).toBeVisible()
    await expect(page.getByRole("button", { name: "Уся історія" })).toHaveCount(
      0,
    )
  })

  test("на телефоні шухляда на всю ширину, без горизонтальної прокрутки", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openWith(page, {}, JOURNAL)
    await page
      .getByRole("button", { name: `Історія запису: ${CONTRACT}` })
      .first()
      .click()
    const drawer = sheet(page)
    await expect(events(drawer)).toHaveCount(3)
    const box = await drawer.boundingBox()
    expect(box?.width).toBeCloseTo(360, 0)
    // Довгий список: кнопка закриття лишається на екрані після прокручування.
    await drawer.getByRole("button", { name: "Закрити" }).waitFor()
    await events(drawer).last().scrollIntoViewIfNeeded()
    await expect(
      drawer.getByRole("button", { name: "Закрити" }),
    ).toBeInViewport()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
