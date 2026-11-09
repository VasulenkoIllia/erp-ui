import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль B3, зв'язок пропозиції із замовленням (ADR-0067, крок B3b2): «Створити замовлення» з прийнятої
 * пропозиції, потік документів на картках обох видів, повтор і скасування під кодом `linked` (і масово),
 * «Копіювати документ». Засів демо — від сьогодні: годинник іде від 08.11.2026, тож пропозиція із
 * замовленням — КП-2026-0001 (найстарша), її замовлення — ЗМ-2026-0001.
 */
const QUOTES = "/#/m/B3/quotes"
const ORDERS = "/#/m/B3/orders"
/** Засів компанії бухгалтера: прийнята без замовлення й прийнята з виконаним замовленням. */
const ACCEPTED = `${QUOTES}/qt-zoriana-05`
const ORDERED = `${QUOTES}/qt-zoriana-10`
const ORDERED_NUMBER = "КП-2026-0001"
const ORDER_NUMBER = "ЗМ-2026-0001"
const CONFIRMED_ORDER = `${ORDERS}/so-zoriana-02`
/** Перший рядок пропозиції `qt-zoriana-05` у засіві. */
const FIRST_LINE = "Монтаж обладнання"
/** Масова задача: запуск, черга й опитування раз на секунду. */
const JOB_TIMEOUT_MS = 10_000

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
const flow = (page: Page) =>
  page.getByRole("list", { name: "Потік документів" })
const flowItem = (page: Page, text: string | RegExp) =>
  flow(page).getByRole("listitem").filter({ hasText: text })
/** Клієнт у шапці картки — посилання на картку організації B1. */
const clientLink = (page: Page) =>
  page.locator("main a[href*='/m/B1/organizations/']").first()

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

test.describe("модуль B3: замовлення з пропозиції", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("«Створити замовлення»: чернетка з клієнтом і рядками, потік на обох картках; вдруге — неактивне з причиною й посиланням", async ({
    page,
  }) => {
    await openWith(page, {}, ACCEPTED)
    await expect(heading(page)).toHaveText(/^Пропозиція КП-2026-/)
    const quoteNumber = (await heading(page).textContent())?.replace(
      "Пропозиція ",
      "",
    )
    const client = await clientLink(page).textContent()
    await actionBar(page)
      .getByRole("button", { name: "Створити замовлення" })
      .click()

    await expect(heading(page)).toHaveText("Замовлення без номера")
    await expect(page).toHaveURL(/#\/m\/B3\/orders\/(?!new)[^/]+$/)
    await expect(clientLink(page)).toHaveText(client ?? "")
    await expect(page.getByText(FIRST_LINE).first()).toBeVisible()
    const current = flowItem(page, "Цей документ")
    await expect(current).toHaveAttribute("aria-current", "page")
    await expect(current).toContainText(`На підставі ${quoteNumber ?? ""}`)

    await flow(page)
      .getByRole("link", { name: quoteNumber ?? "" })
      .click()
    await expect(heading(page)).toHaveText(`Пропозиція ${quoteNumber ?? ""}`)
    await expect(flowItem(page, "Чернетка")).toBeVisible()
    const again = actionBar(page).getByRole("button", {
      name: "Створити замовлення",
    })
    await expect(again).toBeDisabled()
    await expect(again).toHaveAccessibleDescription(
      "Із цієї пропозиції вже створено замовлення",
    )
    await expect(
      actionBar(page).getByRole("button", { name: "Скасувати" }),
    ).toHaveAccessibleDescription(
      "Із пропозиції створено замовлення: спершу скасуйте чи видаліть його",
    )
    await expectNoA11yViolations(page)
    await page.getByRole("link", { name: "Відкрити замовлення" }).click()
    await expect(heading(page)).toHaveText("Замовлення без номера")
  })

  test("засів: пропозиція з виконаним замовленням — потік і неактивні дії; масове «Скасувати» називає причину", async ({
    page,
  }) => {
    await openWith(page, {}, ORDERED)
    await expect(heading(page)).toHaveText(`Пропозиція ${ORDERED_NUMBER}`)
    await expect(flowItem(page, ORDER_NUMBER)).toContainText(
      `На підставі ${ORDERED_NUMBER}`,
    )
    await expect(flowItem(page, ORDER_NUMBER)).toContainText("Виконано")
    await expect(
      actionBar(page).getByRole("button", { name: "Створити замовлення" }),
    ).toBeDisabled()

    await openWith(page, {}, QUOTES)
    const rows = page.getByRole("grid", { name: "Пропозиції" }).getByRole("row")
    await rows.filter({ hasText: ORDERED_NUMBER }).getByRole("checkbox").check()
    await rows
      .filter({ hasText: "Прийнято" })
      .filter({ hasNotText: ORDERED_NUMBER })
      .first()
      .getByRole("checkbox")
      .check()
    await page.getByRole("button", { name: "Скасувати", exact: true }).click()
    const confirm = await openConfirm(page, "Скасувати 2 пропозиції?")
    await confirm
      .getByLabel("Причина", { exact: true })
      .fill("Клієнт закрив тендер")
    await confirm
      .getByRole("button", { name: "Скасувати 2 пропозиції" })
      .click()
    await expect(confirm).toBeHidden()
    const toast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Скасування пропозицій" })
    await expect(toast).toContainText("Скасовано 1 з 2, не скасовано: 1", {
      timeout: JOB_TIMEOUT_MS,
    })
    await toast.getByRole("button", { name: "Подробиці" }).click()
    const report = page.getByRole("dialog", { name: "Не вдалося: 1" })
    await expect(report).toContainText(ORDERED_NUMBER)
    await expect(
      report.getByText(/^Із пропозиції створено замовлення/),
    ).toBeVisible()
  })

  test("«Копіювати» пропозицію: заповнена форма, документ лише після «Зберегти»", async ({
    page,
  }) => {
    await openWith(page, {}, ACCEPTED)
    const client = await clientLink(page).textContent()
    await page.getByRole("link", { name: "Копіювати" }).click()
    await expect(heading(page)).toHaveText("Нова пропозиція")
    await expect(page).toHaveURL(/quotes\/new\?copy=qt-zoriana-05$/)
    await expect(
      page.getByText(/^Копія документа «Пропозиція КП-2026-/),
    ).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Клієнт" })).toHaveText(
      client ?? "",
    )
    await expect(
      page
        .getByRole("group", { name: "Рядок 1", exact: true })
        .getByLabel("Назва"),
    ).toHaveValue(FIRST_LINE)
    await expectNoA11yViolations(page)

    // Копія не збережена: вихід питає, а «Залишитися» лишає форму.
    await page.getByRole("link", { name: "До пропозицій" }).click()
    const leave = page.getByRole("alertdialog", {
      name: "Вийти без збереження?",
    })
    await expect(leave).toBeVisible()
    await leave.getByRole("button", { name: "Залишитися" }).click()

    // «Скасувати зміни» повертає значення копії, а не порожню форму.
    const firstName = page
      .getByRole("group", { name: "Рядок 1", exact: true })
      .getByLabel("Назва")
    await firstName.fill("Інша назва")
    await page
      .getByRole("button", { name: "Скасувати зміни", exact: true })
      .click()
    const discard = await openConfirm(page, "Скасувати зміни?")
    await discard
      .getByRole("button", { name: "Скасувати зміни", exact: true })
      .click()
    await expect(firstName).toHaveValue(FIRST_LINE)
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(heading(page)).toHaveText("Пропозиція без номера")
    await expect(clientLink(page)).toHaveText(client ?? "")
    await expect(page.getByText(FIRST_LINE).first()).toBeVisible()
  })

  test("«Копіювати» замовлення: нове замовлення-чернетка з тими самими рядками", async ({
    page,
  }) => {
    await openWith(page, {}, CONFIRMED_ORDER)
    const client = await clientLink(page).textContent()
    await page.getByRole("link", { name: "Копіювати" }).click()
    await expect(heading(page)).toHaveText("Нове замовлення")
    await page.getByRole("button", { name: "Зберегти" }).click()
    await expect(heading(page)).toHaveText("Замовлення без номера")
    await expect(clientLink(page)).toHaveText(client ?? "")
    // Копія — окремий документ, а не «на підставі»: у потоці лише вона.
    await expect(flow(page).getByRole("listitem")).toHaveCount(1)
  })

  test("права ролі: керівник не створює замовлення й не копіює — кнопки неактивні", async ({
    page,
  }) => {
    await openWith(page, {}, ACCEPTED, { user: USERS.lead })
    await expect(
      actionBar(page).getByRole("button", { name: "Створити замовлення" }),
    ).toBeDisabled()
    await expect(page.getByRole("button", { name: "Копіювати" })).toBeDisabled()
  })
})

test("B3 на телефоні: потік на картці вертикально, форма копії без горизонтальної прокрутки", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await openWith(page, {}, ORDERED)
  await expect(flowItem(page, ORDER_NUMBER)).toBeVisible()
  await expectNoHorizontalScroll(page)
  await openWith(page, {}, `${QUOTES}/new?copy=qt-zoriana-10`)
  await expect(
    page.getByRole("group", { name: "Рядок 1", exact: true }),
  ).toBeVisible()
  await expectNoHorizontalScroll(page)
})
