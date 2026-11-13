import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Борги клієнтів — старіння боргу (ADR-0084, крок K2d): рядок на клієнта й валюту, кошики днів після
 * «Сплатити до», «Разом» і «Разом у базовій валюті»; назва клієнта веде до його рахунків, що чекають оплати;
 * фільтр «Валюта» у звіті й у списку рахунків. Годинник — 08.11.2026. Засів компанії бухгалтера: п'ять боргів,
 * один у євро (114,67 EUR за курсом рахунку — 5 515,63 ₴), переплачений рахунок у звіт не йде.
 */
const DEBTS = "/#/m/K2/client-debts"
const INVOICES = "/#/m/K2/invoices"
const EUR_CLIENT = "ТОВ «Черкаси Енерго»"
const BUCKETS = [
  "Строк не настав",
  "1-30 днів",
  "31-60 днів",
  "61-90 днів",
  "Понад 90 днів",
]

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const filtersButton = (page: Page) =>
  page.getByRole("button", { name: /^Фільтри/ })
const chips = (page: Page) =>
  page.getByRole("list", { name: "Активні фільтри" })
const clientLink = (page: Page, name: string) =>
  page.getByRole("main").getByRole("link", { name: new RegExp(`^${name}`) })

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-08T10:00:00Z") })
})

test.describe("модуль K2: борги клієнтів", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("пункт меню, кошики днів і суми в базовій валюті поруч; переплачений рахунок не борг", async ({
    page,
  }) => {
    await openWith(page, {}, DEBTS)
    await expect(heading(page)).toHaveText("Борги клієнтів")
    await expect(
      page
        .getByRole("navigation", { name: "Основна навігація" })
        .getByRole("link", { name: "Борги клієнтів", exact: true }),
    ).toHaveAttribute("aria-current", "page")
    for (const name of [
      "Клієнт",
      ...BUCKETS,
      "Разом",
      "Разом у базовій валюті",
    ])
      await expect(
        page.getByRole("columnheader", { name, exact: true }),
      ).toBeVisible()
    // Шапка й п'ять боргів засіву.
    await expect(page.getByRole("row")).toHaveCount(6)
    const eur = page.getByRole("row").filter({ hasText: EUR_CLIENT })
    await expect(eur).toContainText("114,67 EUR")
    await expect(eur).toContainText("5 515,63 ₴")
    await expectNoA11yViolations(page)
  })

  test("фільтр «Валюта», потім назва клієнта — його рахунки в цій валюті, що чекають оплати", async ({
    page,
  }) => {
    await openWith(page, {}, DEBTS)
    await filtersButton(page).click()
    const panel = page.getByRole("dialog", { name: "Фільтри" })
    await panel.getByRole("checkbox", { name: "EUR · євро" }).check()
    await panel.getByRole("button", { name: "Застосувати" }).click()
    await expect(panel).toBeHidden()
    await expect(chips(page).getByRole("listitem").first()).toHaveText(
      "Валюта: EUR · євро",
    )
    await expect(page.getByRole("row")).toHaveCount(2)

    await clientLink(page, EUR_CLIENT).click()
    await expect(heading(page)).toHaveText("Рахунки клієнтам")
    await expect(page).toHaveURL(/currency=EUR/)
    await expect(
      page.getByRole("tab", { name: /^Виставлено/ }),
    ).toHaveAttribute("aria-selected", "true")
    await expect(chips(page)).toContainText("Валюта: EUR · євро")
    await expect(chips(page)).toContainText(`Клієнт: ${EUR_CLIENT}`)
    await expect(page.getByRole("row")).toHaveCount(2)
    await expectNoA11yViolations(page)
  })

  test("список рахунків: фільтр «Валюта» лишає рахунки лише в цій валюті", async ({
    page,
  }) => {
    await openWith(page, {}, `${INVOICES}?currency=EUR`)
    await expect(chips(page).getByRole("listitem").first()).toHaveText(
      "Валюта: EUR · євро",
    )
    const amounts = page.getByRole("row").filter({ hasText: "EUR" })
    await expect(amounts).not.toHaveCount(0)
    await expect(page.getByRole("row")).toHaveCount((await amounts.count()) + 1)
  })
})

test.describe("модуль K2: борги клієнтів на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картки: клієнт заголовком, кошики й суми підписані, без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, DEBTS)
    await expect(heading(page)).toHaveText("Борги клієнтів")
    await expect(clientLink(page, EUR_CLIENT)).toBeVisible()
    await expect(page.getByRole("main")).toContainText("Понад 90 днів")
    await expect(page.getByRole("main")).toContainText("5 515,63 ₴")
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
