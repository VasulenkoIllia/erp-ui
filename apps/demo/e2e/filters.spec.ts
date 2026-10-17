import { expect, test, type Page } from "@playwright/test"

import { cellOf, expectNoA11yViolations, openWith } from "./helpers"

/**
 * Стрес-сторінка, крок 0.6c1 (ADR-0017): вкладки-статуси з лічильниками, FilterBar із чипами,
 * особисті збережені види, стан списку в адресі.
 */

const DATA = "/#/data"

const grid = (page: Page) =>
  page.getByRole("grid", { name: "Рахунки клієнтам" })
const rows = (page: Page) => grid(page).locator('[role="row"][data-index]')
/** Рядок стану таблиці: кількість після зміни фільтра (live-регіон). */
const count = (page: Page) => page.locator('[data-slot="data-table-status"]')
const digits = (text: string | null) => (text ?? "").replace(/\D/g, "")
const filtersButton = (page: Page) =>
  page.getByRole("button", { name: /^Фільтри/ })
const viewsButton = (page: Page) =>
  page.getByRole("button", { name: /^Вид списку:/ })

async function openViewsMenu(page: Page) {
  await viewsButton(page).click()
  await expect(page.getByRole("menu")).toBeVisible()
}

async function saveViewAs(page: Page, name: string, isDefault = false) {
  await openViewsMenu(page)
  await page.getByRole("menuitem", { name: "Зберегти як новий вид…" }).click()
  const dialog = page.getByRole("dialog", { name: "Новий вид" })
  await dialog.getByLabel("Назва").fill(name)
  if (isDefault)
    await dialog
      .getByRole("checkbox", { name: "Відкривати цей вид за замовчуванням" })
      .check()
  await dialog.getByRole("button", { name: "Зберегти" }).click()
  return dialog
}

test.describe("списки: вкладки, фільтри, збережені види", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("вкладка-статус: лічильник, адреса, «Назад»", async ({ page }) => {
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")
    const overdue = page.getByRole("tab", { name: /^Прострочені \d/ })
    const expected = digits(await overdue.textContent())
    await overdue.click()
    await expect(page).toHaveURL(/[?&]tab=overdue/)
    await expect(overdue).toHaveAttribute("aria-selected", "true")
    await expect(count(page)).toHaveText(/^[\d\s]+ рахунк/)
    expect(digits(await count(page).textContent())).toBe(expected)
    const statuses = await cellOf(grid(page), rows(page), "Статус")
    await expect(statuses.first()).toHaveText("Прострочено")
    await expect(statuses.filter({ hasNotText: "Прострочено" })).toHaveCount(0)

    await page.goBack()
    await expect(page.getByRole("tab", { name: /^Усі/ })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(count(page)).toHaveText("10 000 рахунків")
  })

  test("фільтри в панелі: чип, лічильники вкладок, оновлення сторінки, «Прибрати» з клавіатури", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    const all = page.getByRole("tab", { name: /^Усі/ })
    await expect(all).toHaveText(/10\s000/)
    await filtersButton(page).click()
    const panel = page.getByRole("dialog", { name: "Фільтри" })
    await panel.getByRole("checkbox", { name: "ПП «Агросвіт»" }).check()
    await panel.getByRole("checkbox", { name: "ФОП Шевчук І. М." }).check()
    await expectNoA11yViolations(page)
    await panel.getByRole("button", { name: "Застосувати" }).click()
    await expect(panel).toBeHidden()

    const chips = page.getByRole("list", { name: "Активні фільтри" })
    await expect(chips.getByRole("listitem").first()).toHaveText(
      "Клієнт: ПП «Агросвіт», ФОП Шевчук І. М.",
    )
    // «Скинути фільтри» — не пункт списку: скрінрідер чує «1 елемент».
    await expect(chips.getByRole("listitem")).toHaveCount(1)
    await expect(filtersButton(page)).toHaveAccessibleName(
      "Фільтри, 1 активний",
    )
    await expect(page).toHaveURL(/client=/)
    // Лічильник «Усі» тепер рахує лише цих клієнтів.
    await expect(all).not.toHaveText(/10\s000/)
    const clients = await cellOf(grid(page), rows(page), "Клієнт")
    for (const client of await clients.allTextContents())
      expect(client).toMatch(/Агросвіт|Шевчук/)

    await page.reload()
    await expect(chips).toBeVisible()
    await expectNoA11yViolations(page)

    await chips
      .getByRole("button", { name: "Прибрати фільтр «Клієнт»" })
      .focus()
    await page.keyboard.press("Enter")
    await expect(chips).toBeHidden()
    await expect(filtersButton(page)).toBeFocused()
    await expect(count(page)).toHaveText("10 000 рахунків")
  })

  test("діапазон суми: початок більший за кінець — помилка біля поля, панель лишається", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await filtersButton(page).click()
    const panel = page.getByRole("dialog", { name: "Фільтри" })
    await panel.getByLabel("Від", { exact: true }).fill("50000")
    await panel.getByLabel("До", { exact: true }).fill("10000")
    await panel.getByRole("button", { name: "Застосувати" }).click()
    await expect(
      panel.getByText("Початок не може бути більшим за кінець"),
    ).toBeVisible()
    await expect(panel.getByLabel("Від", { exact: true })).toBeFocused()
    await panel.getByLabel("До", { exact: true }).fill("100000")
    await panel.getByRole("button", { name: "Застосувати" }).click()
    await expect(panel).toBeHidden()
    await expect(
      page.getByRole("list", { name: "Активні фільтри" }),
    ).toContainText("Сума: від 50 000,00 ₴ до 100 000,00 ₴")
  })

  test("пошук застосовується з паузою і не ламає введення", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    const search = page.getByRole("searchbox", {
      name: "Пошук за номером чи клієнтом",
    })
    await search.pressSequentially("Агросвіт", { delay: 50 })
    await expect(page).toHaveURL(/q=/)
    await expect(search).toHaveValue("Агросвіт")
    await expect(count(page)).not.toHaveText("10 000 рахунків")
  })

  test("збережений вид: за замовчуванням, «змінено», зберегти зміни, назва, яка вже є, видалити й «Скасувати»", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await page.getByRole("tab", { name: /^Прострочені/ }).click()
    await expect(viewsButton(page)).toHaveAccessibleName(
      "Вид списку: Стандартний (змінено)",
    )
    const dialog = await saveViewAs(page, "Прострочені", true)
    await expect(dialog).toBeHidden()
    await expect(page.getByText("Вид «Прострочені» збережено")).toBeVisible()
    await expect(viewsButton(page)).toHaveAccessibleName(
      "Вид списку: Прострочені",
    )

    // Відкрили сторінку без параметрів — вид за замовчуванням.
    await page.goto("/#/")
    await page.goto(DATA)
    await expect(page).toHaveURL(/view=view-[^&]+&tab=overdue/)
    await expect(
      page.getByRole("tab", { name: /^Прострочені/ }),
    ).toHaveAttribute("aria-selected", "true")

    // Назва, яка вже є, — помилка біля поля.
    const duplicate = await saveViewAs(page, "прострочені")
    await expect(duplicate.getByText("Вид із такою назвою вже є")).toBeVisible()
    await duplicate.getByRole("button", { name: "Скасувати" }).click()
    // Діалог відкрили з меню: фокус повертається на кнопку виду (WCAG 2.4.3).
    await expect(viewsButton(page)).toBeFocused()

    await page.getByRole("tab", { name: /^Чернетки/ }).click()
    await expect(viewsButton(page)).toHaveAccessibleName(
      "Вид списку: Прострочені (змінено)",
    )
    await openViewsMenu(page)
    await page.getByRole("menuitem", { name: "Зберегти зміни у виді" }).click()
    await expect(
      page.getByText("Зміни збережено у виді «Прострочені»"),
    ).toBeVisible()
    await expect(viewsButton(page)).toHaveAccessibleName(
      "Вид списку: Прострочені",
    )

    await openViewsMenu(page)
    await page.getByRole("menuitem", { name: "Видалити вид" }).click()
    const toast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Вид «Прострочені» видалено" })
    await expect(toast).toBeVisible()
    // Фільтри лишились, вид — ні.
    await expect(viewsButton(page)).toHaveAccessibleName(
      "Вид списку: Стандартний (змінено)",
    )
    await toast.getByRole("button", { name: "Скасувати" }).click()
    await expect(viewsButton(page)).toHaveAccessibleName(
      "Вид списку: Прострочені",
    )
    await openViewsMenu(page)
    await expect(
      page.getByRole("menuitemradio", { name: /Прострочені/ }),
    ).toHaveAttribute("aria-checked", "true")
    await expectNoA11yViolations(page)
  })

  test("види не завантажились — список працює, меню пропонує повтор", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "erp-ui:mock-scenarios",
        JSON.stringify({ global: "success", resources: { views: "error" } }),
      )
    })
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")
    await openViewsMenu(page)
    await expect(
      page.getByRole("menuitem", {
        name: "Не вдалося завантажити види. Спробувати ще",
      }),
    ).toBeVisible()
  })
})

test.describe("списки на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("шторка фільтрів, вкладки прокручуються, без горизонтальної прокрутки сторінки", async ({
    page,
  }) => {
    await openWith(page, {}, `${DATA}?tab=overdue`)
    await expect(
      page.getByRole("tab", { name: /^Прострочені/ }),
    ).toBeInViewport()
    await filtersButton(page).click()
    const sheet = page.getByRole("dialog", { name: "Фільтри" })
    await sheet.getByRole("checkbox", { name: "USD" }).check()
    await expectNoA11yViolations(page)
    await sheet.getByRole("button", { name: "Застосувати" }).click()
    await expect(sheet).toBeHidden()
    await expect(
      page.getByRole("list", { name: "Активні фільтри" }),
    ).toContainText("Валюта: USD")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })
})
