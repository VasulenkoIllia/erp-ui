import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Модуль K2 «Рахунки клієнтам» (ADR-0070, крок K2a): список на місці заглушки `/m/K2`, «Виставити» з
 * номером серії, друк із QR-кодом оплати НБУ, закритий період і сторно, рахунок із замовлення B3, форма
 * зі сторонами; рахунок у валюті з сумою в гривнях поруч (ADR-0071, крок K2b). Годинник — 08.11.2026,
 * закрито по 20.10.2026: давні рахунки засіву лежать у закритому періоді, а номери засіву компанії
 * бухгалтера — РХ-2026-0001…0009 (найстаріший — перший, далі рахунок у євро сьогодні й останнім — другий
 * рахунок клієнта простроченого, оплачений оплатою модуля K4).
 */
const LIST = "/#/m/K2/invoices"
const DRAFT = `${LIST}/inv-zoriana-01`
const ISSUED = `${LIST}/inv-zoriana-03`
/** Виставлений 24.09.2026 — у закритому періоді, номер РХ-2026-0001. */
const CLOSED = `${LIST}/inv-zoriana-10`
const NEXT_NUMBER = "РХ-2026-0010"
/** Рахунки у валюті: чернетка в доларах, виставлений сьогодні в євро, чернетка в злотих без курсу. */
const USD_DRAFT = `${LIST}/inv-zoriana-11`
const EUR_ISSUED = `${LIST}/inv-zoriana-12`
const PLN_NO_RATE = `${LIST}/inv-zoriana-13`
const CONFIRMED_ORDER = "/#/m/B3/orders/so-zoriana-02"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
const flowItems = (page: Page) =>
  page
    .getByRole("list", { name: "Потік документів" })
    .locator('[data-slot="document-flow-item"]')

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

test.describe("модуль K2: рахунки клієнтам", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("список на місці заглушки: статуси, «Прострочено» у виставлених із минулим строком", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/K2")
    await expect(page).toHaveURL(/#\/m\/K2\/invoices$/)
    await expect(heading(page)).toHaveText("Рахунки клієнтам")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText("14")
    await page.getByRole("tab", { name: /^Виставлено/ }).click()
    // Шапка й п'ять виставлених: два з минулою «Сплатити до».
    await expect(page.getByRole("row")).toHaveCount(6)
    await expect(
      page.getByRole("row").filter({ hasText: "Прострочено" }),
    ).toHaveCount(2)
    await expectNoA11yViolations(page)
  })

  test("«Виставити» чернетку: підтвердження, номер серії, змінити вже не можна", async ({
    page,
  }) => {
    await openWith(page, {}, DRAFT)
    await expect(heading(page)).toHaveText("Рахунок без номера")
    await actionBar(page).getByRole("button", { name: "Виставити" }).click()
    const confirm = await openConfirm(page, "Виставити рахунок?")
    await confirm.getByRole("button", { name: "Виставити рахунок" }).click()
    await expect(heading(page)).toHaveText(`Рахунок ${NEXT_NUMBER}`)
    await expect(
      page.getByRole("button", { name: "Змінити", exact: true }),
    ).toBeDisabled()
    await expectNoA11yViolations(page)
  })

  test("друк виставленого: «Рахунок на оплату», сторони й QR-код оплати НБУ", async ({
    page,
  }) => {
    await openWith(page, {}, `${ISSUED}/print`)
    await expect(page).toHaveTitle(/Друк: Рахунок РХ-2026-/)
    const sheet = page.locator("[data-print-root]")
    await expect(sheet).toContainText("Рахунок на оплату")
    await expect(sheet).toContainText("Сплатити до")
    await expect(sheet).toContainText("ТОВ «Зоряна логістика»")
    await expect(
      sheet.getByRole("img", { name: /^QR-код оплати рахунку РХ-2026-/ }),
    ).toBeVisible()
    await expect(page.locator('[data-slot="invoice-qr-missing"]')).toHaveCount(
      0,
    )
    await expect(page.getByRole("button", { name: "Друкувати" })).toBeEnabled()
    await expectNoA11yViolations(page)
  })

  test("закритий період: смуга, «Скасувати» неактивна, сторно — проведений рахунок із датою сьогодні", async ({
    page,
  }) => {
    await openWith(page, {}, CLOSED)
    await expect(heading(page)).toHaveText("Рахунок РХ-2026-0001")
    await expect(page.getByText("Період закрито по 20.10.2026")).toBeVisible()
    await expect(
      actionBar(page).getByRole("button", { name: "Скасувати" }),
    ).toHaveAttribute("aria-disabled", "true")
    await actionBar(page).getByRole("button", { name: "Сторнувати" }).click()
    const confirm = await openConfirm(page, "Сторнувати документ?")
    await confirm.getByLabel("Причина").fill("Повернення товару")
    await confirm
      .getByRole("button", { name: "Сторнувати документ", exact: true })
      .click()
    await expect(heading(page)).toHaveText(`Рахунок ${NEXT_NUMBER}`)
    await expect(page.getByText("Період закрито по 20.10.2026")).toHaveCount(0)
    // Рядок самого сторно теж містить номер першого рахунку: шукаємо рядок за посиланням на перший.
    await expect(
      flowItems(page).filter({
        has: page.getByRole("link", { name: "РХ-2026-0001", exact: true }),
      }),
    ).toContainText("Сторновано")
    await expectNoA11yViolations(page)
  })

  test("«Виставити рахунок» із замовлення: чернетка на підставі замовлення; вдруге — неактивна з причиною й посиланням", async ({
    page,
  }) => {
    await openWith(page, {}, CONFIRMED_ORDER)
    await expect(heading(page)).toHaveText(/^Замовлення ЗМ-2026-/)
    const orderNumber = (await heading(page).textContent())?.replace(
      "Замовлення ",
      "",
    )
    await actionBar(page)
      .getByRole("button", { name: "Виставити рахунок" })
      .click()
    await expect(page).toHaveURL(/#\/m\/K2\/invoices\/(?!new)[^/]+$/)
    await expect(heading(page)).toHaveText("Рахунок без номера")
    const current = flowItems(page).filter({ hasText: "Цей документ" })
    await expect(current).toContainText(`На підставі ${orderNumber ?? ""}`)

    await page
      .getByRole("list", { name: "Потік документів" })
      .getByRole("link", { name: orderNumber ?? "" })
      .click()
    await expect(heading(page)).toHaveText(`Замовлення ${orderNumber ?? ""}`)
    const again = actionBar(page).getByRole("button", {
      name: "Виставити рахунок",
    })
    await expect(again).toBeDisabled()
    await expect(again).toHaveAccessibleDescription(
      "Із цього замовлення вже виставлено рахунок",
    )
    await expectNoA11yViolations(page)
    await page.getByRole("link", { name: "Відкрити рахунок" }).click()
    await expect(heading(page)).toHaveText("Рахунок без номера")
  })

  test("новий рахунок: постачальник із профілю компанії, покупець із картки клієнта, «Сплатити до» через 5 днів", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await page.getByRole("link", { name: "Створити рахунок" }).click()
    await expect(heading(page)).toHaveText("Новий рахунок")
    const supplier = page.getByRole("group", {
      name: "Постачальник: наша компанія",
    })
    await expect(supplier.getByLabel("Повна назва")).toHaveValue(
      "ТОВ «Зоряна логістика»",
    )
    await expect(page.getByLabel("Сплатити до")).toHaveValue("13.11.2026")
    await page.getByRole("combobox", { name: "Клієнт" }).click()
    const option = page.getByRole("option").first()
    const client = (await option.textContent()) ?? ""
    await option.click()
    const buyer = page.getByRole("group", { name: "Покупець", exact: true })
    await expect(buyer.getByLabel("Повна назва")).not.toHaveValue("")
    expect(client).toContain(await buyer.getByLabel("Повна назва").inputValue())
    await page.getByRole("button", { name: "Додати рядок" }).click()
    const line = page.getByRole("group", { name: "Рядок 1", exact: true })
    await line.getByLabel("Назва").fill("Сервісне обслуговування")
    await line.getByLabel("Ціна").fill("950")
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(page).toHaveURL(/#\/m\/K2\/invoices\/(?!new)[^/]+$/)
    await expect(heading(page)).toHaveText("Рахунок без номера")
    await expect(page.getByRole("main")).toContainText("ТОВ «Зоряна логістика»")
  })
})

test.describe("модуль K2: рахунок у валюті", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("сума в гривнях поруч: у списку під сумою, на картці з курсом і датою; без курсу — пояснення", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await page.getByRole("tab", { name: /^Виставлено/ }).click()
    const eurRow = page.getByRole("row").filter({
      has: page.getByRole("link", { name: "РХ-2026-0008", exact: true }),
    })
    await expect(eurRow).toContainText("EUR")
    await expect(eurRow).toContainText("₴")

    await openWith(page, {}, EUR_ISSUED)
    await expect(heading(page)).toHaveText("Рахунок РХ-2026-0008")
    const main = page.getByRole("main")
    await expect(main).toContainText("У базовій валюті")
    await expect(main).toContainText("Курс 48,1 на 08.11.2026")
    await expect(main).not.toContainText("закріпиться")
    await expectNoA11yViolations(page)

    await openWith(page, {}, USD_DRAFT)
    await expect(heading(page)).toHaveText("Рахунок без номера")
    await expect(page.getByRole("main")).toContainText(
      "закріпиться, коли рахунок виставлять",
    )

    await openWith(page, {}, PLN_NO_RATE)
    await expect(page.getByRole("main")).toContainText(
      "Курсу PLN на 27.10.2026 чи раніше в таблиці курсів немає",
    )
  })

  test("друк рахунку в євро: без QR-коду, пояснення над аркушем про валютні реквізити", async ({
    page,
  }) => {
    await openWith(page, {}, `${EUR_ISSUED}/print`)
    await expect(page.locator("[data-print-root]")).toContainText(
      "Рахунок на оплату",
    )
    await expect(
      page.locator('[data-slot="invoice-qr-missing"]'),
    ).toContainText("Рахунок у EUR друкується без QR-коду")
  })

  test("новий рахунок у доларах: підказка про курс; «Виставити» закріплює курс", async ({
    page,
  }) => {
    await openWith(page, {}, `${LIST}/new`)
    await expect(heading(page)).toHaveText("Новий рахунок")
    await page.getByRole("combobox", { name: "Клієнт" }).click()
    await page.getByRole("option").first().click()
    await page.getByRole("combobox", { name: "Валюта" }).click()
    await page.getByRole("option", { name: /^USD/ }).click()
    await expect(page.getByRole("main")).toContainText(
      "Сума в UAH рахується за курсом на дату рахунку",
    )
    await page.getByRole("button", { name: "Додати рядок" }).click()
    const line = page.getByRole("group", { name: "Рядок 1", exact: true })
    await line.getByLabel("Назва").fill("Консультація")
    await line.getByLabel("Ціна").fill("100")
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(heading(page)).toHaveText("Рахунок без номера")
    await expect(page.getByRole("main")).toContainText(
      "Курс 41,25 на 08.11.2026",
    )
    await expect(page.getByRole("main")).toContainText("закріпиться")
    await actionBar(page).getByRole("button", { name: "Виставити" }).click()
    const confirm = await openConfirm(page, "Виставити рахунок?")
    await confirm.getByRole("button", { name: "Виставити рахунок" }).click()
    await expect(heading(page)).toHaveText(`Рахунок ${NEXT_NUMBER}`)
    await expect(page.getByRole("main")).toContainText(
      "Курс 41,25 на 08.11.2026",
    )
    await expect(page.getByRole("main")).not.toContainText("закріпиться")
  })
})

test.describe("модуль K2: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("список і картка без горизонтальної прокрутки", async ({ page }) => {
    await openWith(page, {}, LIST)
    await expect(heading(page)).toHaveText("Рахунки клієнтам")
    await expectNoHorizontalScroll(page)
    await openWith(page, {}, ISSUED)
    await expect(heading(page)).toHaveText(/^Рахунок РХ-2026-/)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
    await openWith(page, {}, EUR_ISSUED)
    await expect(page.getByRole("main")).toContainText("У базовій валюті")
    await expectNoHorizontalScroll(page)
  })
})
