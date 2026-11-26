import { expect, test, type Page } from "@playwright/test"

import {
  USERS,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Дошка (UI07, ADR-0100) на сторінці «Дошка» демо: воронка угод ресурсу `pipeline`. Перенесення й
 * швидке створення — з клавіатури, згорнуті колонки — в особистих налаштуваннях списку, на телефоні —
 * одна колонка з перемикачем, стани колекції — зі сценаріїв моків ресурсу.
 */
const BOARD = "/#/board"

const board = (page: Page) => page.locator('[data-slot="kanban"]')
const cardsIn = (page: Page, column: string) =>
  page.locator(`[data-kanban-cards="${column}"] [data-kanban-card]`)
const menusIn = (page: Page, column: string) =>
  page.locator(`[data-kanban-cards="${column}"] [data-kanban-card-menu]`)
/** Назва колонки (h2): «Нові» і прихована кількість — «Нові, 23». */
const columnHeading = (page: Page, label: string) =>
  board(page).getByRole("heading", {
    level: 2,
    name: new RegExp(`^${label}\\s*,`),
  })
const announcer = (page: Page) => page.locator("#erp-ui-announcer")

/** Сценарій моків лише для ресурсу `pipeline` (панель розробника). */
async function pipelineScenario(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /^Моки:/ }).click()
  const panel = page.getByRole("dialog", { name: "Панель розробника" })
  await panel.getByRole("combobox", { name: "pipeline", exact: true }).click()
  await page.getByRole("option", { name, exact: true }).click()
  await panel.getByRole("button", { name: "Закрити" }).click()
  await expect(panel).toBeHidden()
}

test.describe("дошка: дії з клавіатури", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, BOARD)
    await expect(cardsIn(page, "qualified").first()).toBeVisible()
  })

  test("«Перемістити в…»: картка в новій колонці, оголошення, фокус на її меню", async ({
    page,
  }) => {
    const before = await cardsIn(page, "proposal").count()
    const menu = menusIn(page, "qualified").first()
    const title = (await menu.getAttribute("aria-label"))?.replace(/^Дії: /, "")
    await menu.focus()
    await page.keyboard.press("Enter")
    await expect(
      page.getByRole("menuitemradio", { name: "Кваліфікація" }),
    ).toHaveAttribute("aria-checked", "true")
    await page.getByRole("menuitemradio", { name: "Пропозиція" }).press("Enter")

    await expect(cardsIn(page, "proposal")).toHaveCount(before + 1)
    await expect(announcer(page)).toContainText(
      `«${title ?? ""}» тепер у колонці «Пропозиція»`,
    )
    await expect(
      page.locator(
        '[data-kanban-cards="proposal"] [data-kanban-card-menu]:focus',
      ),
    ).toHaveCount(1)
  })

  test("причина замість колонок: виграна угода й угода, яку редагує колега", async ({
    page,
  }) => {
    await menusIn(page, "won").first().click()
    await expect(
      page.getByRole("menuitem", {
        name: "Виграну угоду не переносять в інший етап",
      }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByRole("menuitemradio")).toHaveCount(0)
    await page.keyboard.press("Escape")

    const locked = cardsIn(page, "negotiation").filter({
      hasText: "Редагує Тарас Мельник",
    })
    await expect(locked).toHaveCount(1)
    await locked.locator("[data-kanban-card-menu]").click()
    await expect(
      page.getByRole("menuitem", {
        name: "Картку зараз редагує Тарас Мельник",
      }),
    ).toHaveAttribute("aria-disabled", "true")
  })

  test("швидке створення в колонці: поле з фокусом, Enter додає картку, Escape повертає фокус", async ({
    page,
  }) => {
    const open = page.getByRole("button", {
      name: "Додати картку в колонку «Переговори»",
    })
    await open.click()
    const field = page.getByRole("textbox", { name: "Назва угоди" })
    await expect(field).toBeFocused()
    await field.fill("Оренда складу")
    await field.press("Enter")
    await expect(announcer(page)).toContainText(
      "Створено «Оренда складу» у колонці «Переговори»",
    )
    await expect(
      cardsIn(page, "negotiation").filter({ hasText: "Оренда складу" }),
    ).toHaveCount(1)
    await expect(field).toHaveValue("")
    await field.press("Escape")
    await expect(open).toBeFocused()
  })

  test("згортання: фокус на кнопку-пару, вибір лишається після перезавантаження", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", {
        name: /^Програно, \d+ карт\S*, розгорнути колонку$/,
      }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Згорнути колонку «Нові»" }).click()
    const expand = page.getByRole("button", {
      name: /^Нові, \d+ карт\S*, розгорнути колонку$/,
    })
    await expect(expand).toBeFocused()
    await expect(cardsIn(page, "new")).toHaveCount(0)

    await page.reload()
    await expect(cardsIn(page, "qualified").first()).toBeVisible()
    await expect(expand).toBeVisible()
    await expect(cardsIn(page, "new")).toHaveCount(0)
  })

  test("доріжки за відповідальним; axe", async ({ page }) => {
    await page
      .getByRole("switch", { name: "Доріжки за відповідальним" })
      .click()
    await expect(
      board(page).getByRole("heading", {
        level: 3,
        name: "Без відповідального",
      }),
    ).toBeVisible()
    await expect(columnHeading(page, "Нові")).toHaveCount(1)
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await expectNoA11yViolations(page)
  })
})

test.describe("дошка: права й телефон", () => {
  test("лише перегляд: причина в меню картки, без швидкого створення", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, BOARD, { user: USERS.lead })
    await menusIn(page, "qualified").first().click()
    await expect(
      page.getByRole("menuitem", { name: "Немає права переносити картки" }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByRole("menuitemradio")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("button", { name: /^Додати картку/ }),
    ).toHaveCount(0)
  })

  for (const theme of ["light", "dark"] as const)
    test(`телефон ${theme}: одна колонка з перемикачем, без прокрутки вбік, axe`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 })
      await openWith(page, { theme }, BOARD)
      const switcher = page.getByRole("combobox", {
        name: "Колонка",
        exact: true,
      })
      await expect(switcher).toBeVisible()
      await expect(board(page).getByRole("heading", { level: 2 })).toHaveCount(
        1,
      )
      await expect(page.getByRole("button", { name: /^Згорнути/ })).toHaveCount(
        0,
      )
      await switcher.click()
      await page.getByRole("option", { name: /^Переговори/ }).click()
      await expect(columnHeading(page, "Переговори")).toBeVisible()
      await expect(cardsIn(page, "negotiation").first()).toBeVisible()
      await expectNoHorizontalScroll(page)
      await expectNoA11yViolations(page)
    })

  for (const theme of ["light", "dark"] as const)
    test(`1440 ${theme}: axe`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openWith(page, { theme }, BOARD)
      await expect(cardsIn(page, "qualified").first()).toBeVisible()
      await expectNoA11yViolations(page)
    })
})

test.describe("дошка: стани зі сценаріїв моків", () => {
  for (const { scenario, text } of [
    { scenario: "Порожньо", text: "Тут поки порожньо" },
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
  ]) {
    test(`сценарій «${scenario}»`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openWith(page, {}, BOARD)
      await expect(cardsIn(page, "qualified").first()).toBeVisible()
      await pipelineScenario(page, scenario)
      await page.reload()
      await expect(page.getByText(text).first()).toBeVisible()
      await expect(page.locator("[data-kanban-card]")).toHaveCount(0)
    })
  }
})
