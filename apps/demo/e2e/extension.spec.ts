import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

/**
 * Крок 1.2 (ADR-0020): приклад розширення проекту на рахунках (`src/extensions/K2-invoices.ts`) —
 * колонка «Менеджер» після «Клієнт», поле в шапці картки, секція «Умови оплати» після рядків і дія
 * «Нагадати клієнту» лише з правом змінювати рахунки. Фікстури детерміновані: менеджер рахунку
 * № n — `mockValues[(n - 1) % 7]`; 2026-2231 — чернетка Андрія Савченка, у 2026-2447 менеджера немає.
 */
const DATA = "/#/data"
const FIRST_CARD = "/#/data/inv-02231"

const row = (page: Page, number: string) =>
  page.locator('[role="row"]', { hasText: number })
const header = (page: Page) => page.locator('[data-slot="record-header"]')

test.describe("розширення рахунків: десктоп", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("список: колонка «Менеджер» одразу після «Клієнт», порожнє значення — «—»", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await expect(row(page, "2026-2231")).toContainText("Андрій Савченко")
    const headers = (
      await page.getByRole("columnheader").allTextContents()
    ).map((text) => text.trim())
    const client = headers.findIndex((text) => text.startsWith("Клієнт"))
    expect(client).toBeGreaterThan(0)
    expect(headers[client + 1]).toBe("Менеджер")
    await expect(row(page, "2026-2447")).toContainText("—")
    await expectNoA11yViolations(page)
  })

  test("картка: поле в шапці, секція після рядків, дія розширення в кінці", async ({
    page,
  }) => {
    await openWith(page, {}, FIRST_CARD)
    await expect(header(page).getByRole("term")).toHaveText([
      "Клієнт",
      "Менеджер",
      "Дата",
      "Сплатити до",
      "Сума",
    ])
    await expect(header(page).getByRole("definition").nth(1)).toHaveText(
      "Андрій Савченко",
    )
    await expect(header(page).getByRole("button")).toHaveText([
      "Погодити",
      "Змінити",
      "Нагадати клієнту",
    ])

    const lines = page.getByRole("region", { name: "Рядки" })
    const terms = page.getByRole("region", { name: "Умови оплати" })
    await expect(terms).toContainText("14 днів")
    await expect(terms).toContainText("Андрій Савченко")
    const linesBox = await lines.boundingBox()
    const termsBox = await terms.boundingBox()
    expect(termsBox?.y).toBeGreaterThan(linesBox?.y ?? Infinity)

    await page.getByRole("button", { name: "Нагадати клієнту" }).click()
    await expect(
      page.getByText("Нагадування для «ТОВ «Смарт Логістик»» надіслано (демо)"),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("без права змінювати рахунки дії розширення немає", async ({ page }) => {
    await openWith(page, {}, FIRST_CARD, { user: USERS.sales })
    await expect(
      page.getByRole("button", { name: "Змінити", exact: true }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(
      page.getByRole("region", { name: "Умови оплати" }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Нагадати клієнту" }),
    ).toHaveCount(0)
  })
})

test.describe("розширення рахунків: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картка списку: «Менеджер» — полем", async ({ page }) => {
    await openWith(page, {}, DATA)
    // Перша за датою — 2026-0866, теж Андрія Савченка.
    const card = page
      .getByRole("feed", { name: "Рахунки клієнтам" })
      .getByRole("article")
      .first()
    await expect(card).toContainText("2026-0866")
    await expect(card).toContainText("Менеджер")
    await expect(card).toContainText("Андрій Савченко")
  })
})
