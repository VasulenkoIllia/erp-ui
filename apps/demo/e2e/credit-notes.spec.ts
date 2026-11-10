import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Кредит-ноти модуля K2 (ADR-0072, крок K2c): «Створити кредит-ноту» на картці виставленого рахунку,
 * форма чернетки (кількість не більша за рахунок, прибрати рядок), «Виставити» з номером серії «КН-…», сума
 * кредит-нот на картці рахунку, рахунок із кредит-нотою не скасувати; список, друк, телефон. Годинник —
 * 08.11.2026, закрито по 20.10.2026. Засів компанії бухгалтера: виставлена КН-2026-0001 до рахунку
 * `inv-zoriana-05` і чернетка до рахунку в євро `inv-zoriana-12`.
 */
const INVOICES = "/#/m/K2/invoices"
const LIST = "/#/m/K2/credit-notes"
/** Виставлений учора, у відкритому періоді: перший рядок — одна одиниця. */
const ISSUED_INVOICE = `${INVOICES}/inv-zoriana-03`
/** Виставлений 24.09.2026 — у закритому періоді. */
const CLOSED_INVOICE = `${INVOICES}/inv-zoriana-10`
const ISSUED_NOTE = `${LIST}/cn-zoriana-05`
const DRAFT_NOTE = `${LIST}/cn-zoriana-12`
const NEXT_NUMBER = "КН-2026-0002"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
const lines = (page: Page) => page.locator('[data-slot="credit-note-line"]')

/** Base UI переносить фокус у діалог наступним кадром: до того введення піде повз поле. */
async function openConfirm(page: Page, name: string) {
  const dialog = page.getByRole("alertdialog", { name })
  await expect(dialog).toBeVisible()
  await expect(async () => {
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true)
  }).toPass()
  return dialog
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-08T10:00:00Z") })
})

test.describe("модуль K2: кредит-ноти", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("з рахунку: чернетка, кількість не більша за рахунок, «Виставити» з номером; рахунок не скасувати", async ({
    page,
  }) => {
    await openWith(page, {}, ISSUED_INVOICE)
    await expect(heading(page)).toHaveText(/^Рахунок РХ-2026-/)
    const invoiceNumber = (await heading(page).textContent())?.replace(
      "Рахунок ",
      "",
    )
    await actionBar(page)
      .getByRole("button", { name: "Створити кредит-ноту" })
      .click()
    await expect(page).toHaveURL(/#\/m\/K2\/credit-notes\/[^/]+$/)
    await expect(heading(page)).toHaveText("Кредит-нота без номера")
    await expect(
      page
        .getByRole("list", { name: "Потік документів" })
        .locator('[data-slot="document-flow-item"]')
        .filter({ hasText: "Цей документ" }),
    ).toContainText(`На підставі ${invoiceNumber ?? ""}`)
    await expectNoA11yViolations(page)

    await page.getByRole("link", { name: "Змінити", exact: true }).click()
    await expect(heading(page)).toHaveText("Зміна: Кредит-нота без номера")
    await expect(lines(page)).toHaveCount(4)
    const first = lines(page)
      .first()
      .getByLabel(/^Кількість/)
    await first.fill("5")
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(lines(page).first()).toContainText("Не більше 1")
    // Фокус на помилку react-hook-form ставить ще раз таймером: чекаємо його до нового введення.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)))
    await expectNoA11yViolations(page)
    await first.fill("1")
    await lines(page)
      .last()
      .getByRole("button", { name: /^Прибрати рядок/ })
      .click()
    await expect(lines(page)).toHaveCount(3)
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(heading(page)).toHaveText("Кредит-нота без номера")

    await actionBar(page).getByRole("button", { name: "Виставити" }).click()
    const confirm = await openConfirm(page, "Виставити кредит-ноту?")
    await confirm.getByRole("button", { name: "Виставити кредит-ноту" }).click()
    await expect(heading(page)).toHaveText(`Кредит-нота ${NEXT_NUMBER}`)

    await page
      .getByRole("main")
      .getByRole("link", { name: invoiceNumber ?? "", exact: true })
      .first()
      .click()
    await expect(heading(page)).toHaveText(`Рахунок ${invoiceNumber ?? ""}`)
    await expect(page.getByRole("main")).toContainText("Кредит-ноти")
    const cancel = actionBar(page).getByRole("button", { name: "Скасувати" })
    await expect(cancel).toHaveAttribute("aria-disabled", "true")
    await expect(cancel).toHaveAccessibleDescription(
      "До рахунку виставлено кредит-ноти: спершу скасуйте чи сторнуйте їх",
    )
    await expect(
      actionBar(page).getByRole("button", { name: "Створити кредит-ноту" }),
    ).not.toHaveAttribute("aria-disabled", "true")
  })

  test("рахунок у закритому періоді: кредит-нота датою сьогодні", async ({
    page,
  }) => {
    await openWith(page, {}, CLOSED_INVOICE)
    await expect(heading(page)).toHaveText(/^Рахунок РХ-2026-/)
    await actionBar(page)
      .getByRole("button", { name: "Створити кредит-ноту" })
      .click()
    await expect(heading(page)).toHaveText("Кредит-нота без номера")
    await expect(page.getByText("Період закрито по 20.10.2026")).toHaveCount(0)
    await expect(page.getByRole("main")).toContainText("08.11.2026")
  })

  test("список: пункт меню, вкладки, посилання на рахунок; порожній опис без «Створити»", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await expect(heading(page)).toHaveText("Кредит-ноти")
    await expect(
      page
        .getByRole("navigation", { name: "Основна навігація" })
        .getByRole("link", { name: "Кредит-ноти", exact: true }),
    ).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText("2")
    // Шапка й дві кредит-ноти засіву.
    await expect(page.getByRole("row")).toHaveCount(3)
    const issued = page.getByRole("row").filter({
      has: page.getByRole("link", { name: "КН-2026-0001", exact: true }),
    })
    await expect(issued.getByRole("link", { name: /^РХ-2026-/ })).toBeVisible()
    await expect(
      page.getByRole("main").getByRole("link", { name: /^Створити/ }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)
  })

  test("друк: «Кредит-нота», «До рахунку № …», без QR-коду", async ({
    page,
  }) => {
    await openWith(page, {}, `${ISSUED_NOTE}/print`)
    await expect(page).toHaveTitle(/Друк: Кредит-нота КН-2026-0001/)
    const sheet = page.locator("[data-print-root]")
    await expect(sheet).toContainText("Кредит-нота")
    await expect(sheet).toContainText("КН-2026-0001")
    await expect(sheet).toContainText("До рахунку № РХ-2026-")
    await expect(sheet.getByRole("img", { name: /^QR-код/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Друкувати" })).toBeEnabled()
    await expectNoA11yViolations(page)
  })
})

test.describe("модуль K2: кредит-ноти на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("список, картка й форма без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await expect(heading(page)).toHaveText("Кредит-ноти")
    await expectNoHorizontalScroll(page)
    await openWith(page, {}, DRAFT_NOTE)
    await expect(heading(page)).toHaveText("Кредит-нота без номера")
    await expect(page.getByRole("main")).toContainText("У базовій валюті")
    await expectNoHorizontalScroll(page)
    await openWith(page, {}, `${DRAFT_NOTE}/edit`)
    await expect(lines(page)).toHaveCount(3)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
