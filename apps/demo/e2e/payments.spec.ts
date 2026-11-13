import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль K4 «Оплати» (ADR-0073, крок K4): список на місці заглушки `/m/K4`, «Зареєструвати оплату» з картки
 * рахунку (клієнт і рахунок уже вибрано, сума — борг), «Розписати від найстаршого», сума оплати дорівнює
 * сумі рознесення, «Оплачено» ставить сервер, скасування оплати повертає «Виставлено», без права — неактивна
 * кнопка з причиною. Годинник — 08.11.2026, закрито по 20.10.2026. Засів компанії бухгалтера: ОП-2026-0001…0006,
 * оплата ОП-2026-0003 — на прострочений РХ-2026-0003 наполовину й на РХ-2026-0009 повністю («Оплачено»;
 * далі кредит-нота й повернення ПВ-2026-0001, `refunds.spec.ts`).
 */
const PAYMENTS = "/#/m/K4/payments"
const MULTI = `${PAYMENTS}/pay-zoriana-multi`
const INVOICES = "/#/m/K2/invoices"
/** Прострочений, оплачений наполовину. */
const OVERDUE = `${INVOICES}/inv-zoriana-04`
const OVERDUE_NUMBER = "РХ-2026-0003"
/** Виставлений учора, без оплат, що діють. */
const UNPAID = `${INVOICES}/inv-zoriana-03`
const UNPAID_NUMBER = "РХ-2026-0007"
/** Другий рахунок клієнта простроченого, оплачений повністю. */
const PAID = `${INVOICES}/inv-zoriana-14`
const PAID_NUMBER = "РХ-2026-0009"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
/** Статус у шапці картки: поруч із заголовком. */
const recordStatus = (page: Page) =>
  page.locator('[data-slot="record-header"] h1 + *')
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
const registerLink = (page: Page) =>
  page.getByRole("link", { name: "Зареєструвати оплату", exact: true })
const submitButton = (page: Page) =>
  page.getByRole("button", { name: "Зареєструвати оплату", exact: true })

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

test.describe("модуль K4: оплати", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("список на місці заглушки: оплата на два рахунки, сума сторно з мінусом", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/K4")
    await expect(page).toHaveURL(/#\/m\/K4\/payments$/)
    await expect(heading(page)).toHaveText("Оплати")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText("6")
    const multi = page.getByRole("row").filter({
      has: page.getByRole("link", { name: "ОП-2026-0003", exact: true }),
    })
    await expect(multi).toContainText(OVERDUE_NUMBER)
    await expect(multi).toContainText(PAID_NUMBER)
    await expect(
      page.getByRole("row").filter({
        has: page.getByRole("link", { name: "ОП-2026-0006", exact: true }),
      }),
    ).toContainText("Сторно")
    await expectNoA11yViolations(page)
  })

  test("з картки рахунку: клієнт, рахунок і борг уже в формі; після реєстрації рахунок «Оплачено»", async ({
    page,
  }) => {
    await openWith(page, {}, OVERDUE)
    await expect(heading(page)).toHaveText(`Рахунок ${OVERDUE_NUMBER}`)
    await expect(recordStatus(page)).toHaveText("Виставлено")
    const header = page.locator('[data-slot="record-header"]')
    await expect(header).toContainText("Оплачено")
    await expect(header).toContainText("До сплати")
    await registerLink(page).click()
    await expect(heading(page)).toHaveText("Нова оплата")
    await expect(page).toHaveURL(
      /#\/m\/K4\/payments\/new\?client=.+&invoice=inv-zoriana-04$/,
    )
    const amount = page.getByLabel(`Сума з оплати для ${OVERDUE_NUMBER}`)
    await expect(amount).not.toHaveValue("")
    await expect(page.getByLabel("Сума оплати", { exact: true })).toHaveValue(
      await amount.inputValue(),
    )
    await expect(page.getByRole("link", { name: "До рахунку" })).toBeVisible()
    await expectNoA11yViolations(page)

    await submitButton(page).click()
    await expect(heading(page)).toHaveText(`Рахунок ${OVERDUE_NUMBER}`)
    await expect(recordStatus(page)).toHaveText("Оплачено")
    await expect(header).not.toContainText("До сплати")
    await expect(registerLink(page)).toHaveCount(0)
    // Нова оплата — у потоці документів рахунку.
    await expect(
      page
        .getByRole("list", { name: "Потік документів" })
        .locator('[data-slot="document-flow-item"]')
        .filter({ hasText: "ОП-2026-0007" }),
    ).toHaveCount(1)
  })

  test("часткова оплата: «Розписати від найстаршого», рахунок лишається «Виставлено» з боргом", async ({
    page,
  }) => {
    await openWith(page, {}, UNPAID)
    await expect(heading(page)).toHaveText(`Рахунок ${UNPAID_NUMBER}`)
    await registerLink(page).click()
    await expect(heading(page)).toHaveText("Нова оплата")
    const invoiceAmount = page.getByLabel(`Сума з оплати для ${UNPAID_NUMBER}`)
    await expect(invoiceAmount).not.toHaveValue("")
    await page.getByLabel("Сума оплати", { exact: true }).fill("1000")
    const allocations = page.locator('[data-slot="payment-allocations"]')
    await expect(allocations).toContainText("більше за суму оплати")
    await page
      .getByRole("button", { name: "Розписати від найстаршого" })
      .click()
    await expect(allocations).not.toContainText("більше за суму оплати")
    await expect(allocations).not.toContainText("Лишилось розписати")

    await invoiceAmount.fill("")
    await submitButton(page).click()
    await expect(
      page.getByLabel("Сума оплати", { exact: true }),
    ).toHaveAccessibleDescription(/Розпишіть на рахунки всю суму оплати/)
    await page
      .getByRole("button", { name: "Розписати від найстаршого" })
      .click()
    await submitButton(page).click()
    await expect(heading(page)).toHaveText(`Рахунок ${UNPAID_NUMBER}`)
    await expect(recordStatus(page)).toHaveText("Виставлено")
    const header = page.locator('[data-slot="record-header"]')
    await expect(header).toContainText("Оплачено")
    await expect(header).toContainText("До сплати")
    await expect(registerLink(page)).toBeVisible()
  })

  test("картка оплати: рахунки з посиланнями; «Скасувати» повертає рахунку «Виставлено»", async ({
    page,
  }) => {
    await openWith(page, {}, MULTI)
    await expect(heading(page)).toHaveText("Оплата ОП-2026-0003")
    await expect(recordStatus(page)).toHaveText("Отримано")
    const main = page.getByRole("main")
    await expect(
      main.getByRole("link", { name: OVERDUE_NUMBER, exact: true }).first(),
    ).toBeVisible()
    await expect(
      main.getByRole("link", { name: PAID_NUMBER, exact: true }).first(),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await actionBar(page).getByRole("button", { name: "Скасувати" }).click()
    const confirm = await openConfirm(page, "Скасувати документ?")
    await confirm.getByLabel("Причина").fill("Помилкова оплата")
    await confirm
      .getByRole("button", { name: "Скасувати документ", exact: true })
      .click()
    await expect(recordStatus(page)).toHaveText("Скасовано")

    await openWith(page, {}, PAID)
    await expect(heading(page)).toHaveText(`Рахунок ${PAID_NUMBER}`)
    await expect(recordStatus(page)).toHaveText("Виставлено")
    await expect(registerLink(page)).toBeVisible()
  })

  test("друк частково оплаченого: під «Разом» — «Оплачено» й «До сплати», QR-код на борг", async ({
    page,
  }) => {
    await openWith(page, {}, `${OVERDUE}/print`)
    const sheet = page.locator("[data-print-root]")
    const totals = sheet.locator('[data-slot="print-document-totals"]')
    await expect(totals).toContainText("Оплачено")
    await expect(totals).toContainText("До сплати")
    await expect(totals).not.toContainText("Кредит-ноти")
    await expect(
      sheet.getByRole("img", {
        name: `QR-код оплати рахунку ${OVERDUE_NUMBER}`,
      }),
    ).toBeVisible()
    // Оплачений рахунок QR-коду не має; після кредит-ноти й часткового повернення — «Повернено» й «Переплата».
    await openWith(page, {}, `${PAID}/print`)
    const paidTotals = page.locator(
      '[data-print-root] [data-slot="print-document-totals"]',
    )
    await expect(paidTotals).toContainText("Повернено")
    await expect(paidTotals).toContainText("Переплата")
    await expect(paidTotals).not.toContainText("До сплати")
    await expect(
      page.locator('[data-print-root] [data-slot="invoice-payment-qr"]'),
    ).toHaveCount(0)
  })

  test("менеджер без права реєструвати оплати: кнопка неактивна з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, UNPAID, { user: USERS.sales })
    await expect(heading(page)).toHaveText(`Рахунок ${UNPAID_NUMBER}`)
    const denied = page.getByRole("button", {
      name: "Зареєструвати оплату",
      exact: true,
    })
    await expect(denied).toHaveAttribute("aria-disabled", "true")
    await expect(denied).toHaveAccessibleDescription(
      "Немає права реєструвати оплати",
    )
  })
})

test.describe("модуль K4: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("список, картка й форма без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, PAYMENTS)
    await expect(heading(page)).toHaveText("Оплати")
    await expectNoHorizontalScroll(page)
    await openWith(page, {}, MULTI)
    await expect(heading(page)).toHaveText("Оплата ОП-2026-0003")
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
    await openWith(page, {}, UNPAID)
    await registerLink(page).click()
    await expect(heading(page)).toHaveText("Нова оплата")
    await expect(
      page.getByLabel(`Сума з оплати для ${UNPAID_NUMBER}`),
    ).not.toHaveValue("")
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
