import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Повернення клієнтам і посилання на оплату (ADR-0083, крок K4b): «Повернути переплату» з картки рахунку з
 * переплатою (клієнт, рахунок і переплата вже в формі), рядок «Повернено» на картці, скасування повернення
 * повертає переплату, без права — неактивна кнопка з причиною; «Посилання на оплату» — діалог із QR-кодом і
 * посиланням на борг рахунку. Годинник — 08.11.2026, закрито по 20.10.2026. Засів компанії бухгалтера:
 * РХ-2026-0009 оплачено повністю, потім виставлено кредит-ноту — переплата; половину її повернуто ПВ-2026-0001.
 */
const INVOICES = "/#/m/K2/invoices"
const REFUNDS = "/#/m/K4/refunds"
const SEED_REFUND = `${REFUNDS}/ref-zoriana-overpaid`
/** Оплачений рахунок із кредит-нотою: переплата, половину повернуто. */
const OVERPAID = `${INVOICES}/inv-zoriana-14`
const OVERPAID_NUMBER = "РХ-2026-0009"
/** Виставлений, без оплат. */
const UNPAID = `${INVOICES}/inv-zoriana-03`
const UNPAID_NUMBER = "РХ-2026-0007"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
/** Статус у шапці картки: поруч із заголовком. */
const recordStatus = (page: Page) =>
  page.locator('[data-slot="record-header"] h1 + *')
const header = (page: Page) => page.locator('[data-slot="record-header"]')
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
const refundLink = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("link", { name: "Повернути переплату", exact: true })
const refundAmount = (page: Page) =>
  page.getByLabel("Сума повернення", { exact: true })

/** Base UI переносить фокус у діалог наступним кадром: до того введення піде повз поле. */
async function focusedDialog(
  page: Page,
  role: "dialog" | "alertdialog",
  name: string,
) {
  const dialog = page.getByRole(role, { name })
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

test.describe("модуль K4: повернення", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("з картки рахунку з переплатою: переплата вже в формі; після повернення рахунок без переплати", async ({
    page,
  }) => {
    await openWith(page, {}, OVERPAID)
    await expect(heading(page)).toHaveText(`Рахунок ${OVERPAID_NUMBER}`)
    await expect(recordStatus(page)).toHaveText("Оплачено")
    await expect(header(page)).toContainText("Повернено")
    await expect(header(page)).toContainText("Переплата")
    // Платити нічого: посилання на оплату немає.
    await expect(
      page.getByRole("button", { name: "Посилання на оплату" }),
    ).toHaveCount(0)
    await refundLink(page).click()
    await expect(heading(page)).toHaveText("Нове повернення")
    await expect(page).toHaveURL(
      /#\/m\/K4\/refunds\/new\?client=.+&invoice=inv-zoriana-14$/,
    )
    const invoiceAmount = page.getByLabel(
      `Сума повернення для ${OVERPAID_NUMBER}`,
    )
    await expect(invoiceAmount).not.toHaveValue("")
    await expect(refundAmount(page)).toHaveValue(
      await invoiceAmount.inputValue(),
    )
    await expectNoA11yViolations(page)

    // Більше за переплату не повернути.
    const overpayment = await invoiceAmount.inputValue()
    const submit = page.getByRole("button", { name: "Повернути", exact: true })
    await invoiceAmount.fill("999999")
    await refundAmount(page).fill("999999")
    await submit.click()
    await expect(invoiceAmount).toHaveAccessibleDescription(
      /Не більше переплати/,
    )
    await invoiceAmount.fill(overpayment)
    await refundAmount(page).fill(overpayment)
    await submit.click()

    await expect(heading(page)).toHaveText(`Рахунок ${OVERPAID_NUMBER}`)
    await expect(recordStatus(page)).toHaveText("Оплачено")
    await expect(header(page)).not.toContainText("Переплата")
    await expect(refundLink(page)).toHaveCount(0)
    await expect(
      page
        .getByRole("list", { name: "Потік документів" })
        .locator('[data-slot="document-flow-item"]')
        .filter({ hasText: "ПВ-2026-0002" }),
    ).toHaveCount(1)
  })

  test("список: пункт меню, повернення засіву з посиланням на рахунок", async ({
    page,
  }) => {
    await openWith(page, {}, REFUNDS)
    await expect(heading(page)).toHaveText("Повернення")
    await expect(
      page
        .getByRole("navigation", { name: "Основна навігація" })
        .getByRole("link", { name: "Повернення", exact: true }),
    ).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText("1")
    const seeded = page.getByRole("row").filter({
      has: page.getByRole("link", { name: "ПВ-2026-0001", exact: true }),
    })
    await expect(seeded).toContainText(OVERPAID_NUMBER)
    await expect(seeded).toContainText("Повернено")
    await expectNoA11yViolations(page)
  })

  test("картка повернення: «Скасувати» повертає рахунку переплату", async ({
    page,
  }) => {
    await openWith(page, {}, SEED_REFUND)
    await expect(heading(page)).toHaveText("Повернення ПВ-2026-0001")
    await expect(recordStatus(page)).toHaveText("Повернено")
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: OVERPAID_NUMBER, exact: true })
        .first(),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await actionBar(page).getByRole("button", { name: "Скасувати" }).click()
    const confirm = await focusedDialog(
      page,
      "alertdialog",
      "Скасувати документ?",
    )
    await confirm.getByLabel("Причина").fill("Помилкове повернення")
    await confirm
      .getByRole("button", { name: "Скасувати документ", exact: true })
      .click()
    await expect(recordStatus(page)).toHaveText("Скасовано")

    await openWith(page, {}, OVERPAID)
    await expect(heading(page)).toHaveText(`Рахунок ${OVERPAID_NUMBER}`)
    await expect(header(page)).not.toContainText("Повернено")
    await expect(header(page)).toContainText("Переплата")
    await expect(refundLink(page)).toBeVisible()
  })

  test("менеджер без права повертати: кнопка неактивна з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, OVERPAID, { user: USERS.sales })
    await expect(heading(page)).toHaveText(`Рахунок ${OVERPAID_NUMBER}`)
    const denied = page.getByRole("button", {
      name: "Повернути переплату",
      exact: true,
    })
    await expect(denied).toHaveAttribute("aria-disabled", "true")
    await expect(denied).toHaveAccessibleDescription(
      "Немає права повертати гроші клієнтам",
    )
  })
})

test.describe("модуль K2: посилання на оплату", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("діалог: QR-код, сума до сплати й посилання НБУ; закривається", async ({
    page,
  }) => {
    await openWith(page, {}, UNPAID)
    await expect(heading(page)).toHaveText(`Рахунок ${UNPAID_NUMBER}`)
    const open = page.getByRole("button", { name: "Посилання на оплату" })
    await open.click()
    const dialog = await focusedDialog(
      page,
      "dialog",
      `Оплата рахунку ${UNPAID_NUMBER}`,
    )
    await expect(
      dialog.getByRole("img", {
        name: `QR-код оплати рахунку ${UNPAID_NUMBER}`,
      }),
    ).toBeVisible()
    await expect(dialog).toContainText("До сплати:")
    await expect(
      dialog.getByRole("link", { name: /^https:\/\/bank\.gov\.ua\/qr\// }),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(open).toBeFocused()
  })
})

test.describe("модуль K4: повернення на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("список, картка, форма й діалог посилання без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, REFUNDS)
    await expect(heading(page)).toHaveText("Повернення")
    await expectNoHorizontalScroll(page)
    await openWith(page, {}, SEED_REFUND)
    await expect(heading(page)).toHaveText("Повернення ПВ-2026-0001")
    await expectNoHorizontalScroll(page)
    await openWith(page, {}, OVERPAID)
    await refundLink(page).click()
    await expect(heading(page)).toHaveText("Нове повернення")
    await expect(refundAmount(page)).not.toHaveValue("")
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)

    await openWith(page, {}, UNPAID)
    await page.getByRole("button", { name: "Посилання на оплату" }).click()
    await focusedDialog(page, "dialog", `Оплата рахунку ${UNPAID_NUMBER}`)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
