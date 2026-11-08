import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  waitForMenuFocus,
} from "./helpers"

/**
 * Великий документ (UI05b, ADR-0060): 500 рядків у розділах, віртуальні рядки у вікні сторінки, меню
 * рядка, перехід зі зведення помилок на рядок далеко внизу, панель збереження над полем у фокусі.
 */
const PAGE = "/#/document-form"

const form = (page: Page) => page.getByTestId("document-form")
const row = (page: Page, index: number) =>
  form(page).getByRole("group", { name: `Рядок ${String(index)}`, exact: true })
const rows = (page: Page) =>
  form(page).locator('[data-slot="repeating-rows"] ol > li')

async function openDocument(page: Page, theme?: "light" | "dark") {
  await openWith(page, theme ? { theme } : {}, PAGE)
  await expect(row(page, 1).getByLabel("Розділ")).toHaveValue("Етап 1")
}

/** Дія з меню рядка лише клавіатурою: Enter на меню, стрілки до пункту, Enter. */
async function rowAction(page: Page, index: number, action: string) {
  await row(page, index)
    .getByRole("button", { name: `Дії: Рядок ${String(index)}` })
    .press("Enter")
  const item = page.getByRole("menuitem", { name: action })
  await expect(item).toBeVisible()
  // Base UI переводить фокус у меню наступним кадром: клавіша раніше пішла б на кнопку.
  await waitForMenuFocus(page)
  for (let step = 0; step < 10; step++) {
    if (await item.evaluate((node) => node === document.activeElement)) break
    await page.keyboard.press("ArrowDown")
  }
  await expect(item).toBeFocused()
  await page.keyboard.press("Enter")
}

/**
 * До кінця документа: висота невиміряних рядків — оцінка, і після виміру сторінка стає довшою, тож
 * прокрутка повторюється, доки останній рядок не з'явиться.
 */
async function scrollToEnd(page: Page) {
  await expect(async () => {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await expect(row(page, 500)).toBeVisible({ timeout: 1_000 })
  }).toPass()
}

/**
 * До рядка далеко в документі: крок прокрутки — з відстані між видимими рядками, бо висоту невиміряних
 * рядків список лише оцінює. Повтор, доки рядок не на екрані.
 */
async function scrollToRow(page: Page, index: number) {
  await expect(async () => {
    await page.evaluate((target) => {
      const shown = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-slot="repeating-rows"] li[data-row-index]',
        ),
      ]
        .map((item) => ({
          index: Number(item.dataset.rowIndex) + 1,
          top: item.getBoundingClientRect().top,
        }))
        .filter((item) => item.top > 0 && item.top < window.innerHeight)
        .sort((a, b) => a.index - b.index)
      const first = shown[0]
      const last = shown.at(-1)
      if (!first || !last) return
      const rowHeight =
        last.index > first.index
          ? (last.top - first.top) / (last.index - first.index)
          : 80
      window.scrollBy(0, (target - first.index - 2) * rowHeight)
    }, index)
    await expect(row(page, index)).toBeInViewport({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
}

test.describe("великий документ", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("підписи колонок липнуть угорі: видно над рядком 400, поле у фокусі не ховають", async ({
    page,
  }) => {
    await openDocument(page)
    await scrollToRow(page, 400)
    const header = form(page).locator('[data-slot="repeating-rows-header"]')
    await expect(header).toBeInViewport()
    await expect(header).toContainText("Ціна")
    const [headerBox, noteBox] = await Promise.all([
      header.boundingBox(),
      row(page, 400).boundingBox(),
    ])
    expect(headerBox && noteBox).toBeTruthy()
    if (!headerBox || !noteBox) return
    // Підписи стоять під топбаром і над рядком 400 (нотатка), не перекриваючи його.
    expect(headerBox.y).toBeGreaterThan(0)
    expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(noteBox.y)
    // «Ціна» — над колонкою цін (рядок 402 — товар після розділу).
    const price = row(page, 402).getByLabel("Ціна")
    const [label, priceBox] = await Promise.all([
      header.getByText("Ціна", { exact: true }).boundingBox(),
      price.boundingBox(),
    ])
    expect(label && priceBox).toBeTruthy()
    if (label && priceBox)
      expect(Math.abs(label.x - priceBox.x)).toBeLessThan(4)
    // Фокус іде вгору по рядках: сторінка прокручується так, що поле нижче підписів.
    await price.focus()
    for (let step = 0; step < 30; step++) await page.keyboard.press("Shift+Tab")
    const focused = await page.locator(":focus").boundingBox()
    const stuck = await header.boundingBox()
    expect(focused && stuck).toBeTruthy()
    if (focused && stuck)
      expect(focused.y).toBeGreaterThanOrEqual(stuck.y + stuck.height)
    await expectNoHorizontalScroll(page)
  })

  test("500 рядків: у DOM лише видимі, місце й кількість для скрінрідера", async ({
    page,
  }) => {
    await openDocument(page)
    expect(await rows(page).count()).toBeLessThan(40)
    await expect(rows(page).first()).toHaveAttribute("aria-setsize", "500")
    await expect(rows(page).first()).toHaveAttribute("aria-posinset", "1")
    await scrollToEnd(page)
    await expect(row(page, 500).getByLabel("Нотатка")).toBeVisible()
    await expect(row(page, 1)).toHaveCount(0)
    await expectNoHorizontalScroll(page)
  })

  test("Tab іде з рядка в рядок: наступні рядки з'являються під фокусом", async ({
    page,
  }) => {
    await openDocument(page)
    await row(page, 2).getByLabel("Назва").focus()
    for (let step = 0; step < 120; step++) await page.keyboard.press("Tab")
    const focusedRow = await page.evaluate(() =>
      Number(
        document.activeElement
          ?.closest("[data-row-index]")
          ?.getAttribute("data-row-index") ?? -1,
      ),
    )
    expect(focusedRow).toBeGreaterThan(10)
    await expect(page.locator(":focus")).toBeInViewport()
  })

  test("зведення помилок переводить на рядок далеко внизу", async ({
    page,
  }) => {
    await openDocument(page)
    await scrollToEnd(page)
    await row(page, 495).getByLabel("Назва").fill("")
    await page.getByRole("heading", { level: 1 }).click()
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    // Рядок із першою помилкою лишається в DOM поза екраном: на нього переходить зведення.
    await expect(row(page, 495)).not.toBeInViewport()
    await form(page).getByRole("button", { name: "Зберегти" }).click()
    const summary = form(page).locator('[data-slot="form-error-summary"]')
    await expect(summary).toBeFocused()
    await summary
      .getByRole("button", { name: /^Рядки документа: Заповніть це поле/ })
      .click()
    const name = row(page, 495).getByLabel("Назва")
    await expect(name).toBeFocused()
    await expect(name).toBeInViewport()
  })

  test("меню рядка клавіатурою: вставити нотатку нижче, підняти; сума розділу", async ({
    page,
  }) => {
    await openDocument(page)
    const sectionSum = row(page, 1).getByText(/₴$/)
    const before = await sectionSum.textContent()
    await rowAction(page, 2, "Вставити нотатку нижче")
    const noteField = row(page, 3).getByLabel("Нотатка")
    await expect(noteField).toBeFocused()
    await page.keyboard.type("Монтаж після поставки")
    await rowAction(page, 3, "Підняти")
    await expect(
      row(page, 2).getByRole("button", { name: "Дії: Рядок 2" }),
    ).toBeFocused()
    await expect(row(page, 2).getByLabel("Нотатка")).toHaveValue(
      "Монтаж після поставки",
    )
    await expect(rows(page).first()).toHaveAttribute("aria-setsize", "501")
    // Нотатка сум не має; кількість рядка розділу змінює й суму розділу.
    await expect(sectionSum).toHaveText(before ?? "")
    const quantity = row(page, 3).getByLabel("Кількість")
    await quantity.fill("100")
    await expect(sectionSum).not.toHaveText(before ?? "")
  })

  test("поріг 12 рядків: рядки на екрані зберігають стан, фокус іде за діями", async ({
    page,
  }) => {
    // Усі 12 рядків на екрані: стан рядка поза екраном не тримається (ADR-0060), тут — лише видимих.
    await page.setViewportSize({ width: 1440, height: 1600 })
    await openWith(page, {}, `${PAGE}?lines=11`)
    await expect(rows(page)).toHaveCount(11)
    await expect(rows(page).first()).not.toHaveAttribute("aria-setsize")
    // Вид нульової знижки живе лише в рядку: перемонтування повернуло б «%».
    await row(page, 10)
      .getByRole("combobox", { name: "Вид знижки: Рядок 10" })
      .click()
    await page.getByRole("option", { name: "сумою" }).click()
    const amount = row(page, 10).getByLabel("Знижка, сумою")
    await expect(amount).toBeVisible()

    await form(page).getByRole("button", { name: "Додати рядок" }).click()
    await expect(
      row(page, 12).getByRole("combobox", { name: "Товар чи послуга" }),
    ).toBeFocused()
    await expect(rows(page).first()).toHaveAttribute("aria-setsize", "12")
    await expect(amount).toBeVisible()

    await rowAction(page, 12, "Вилучити")
    await expect(
      row(page, 11).getByRole("button", { name: "Дії: Рядок 11" }),
    ).toBeFocused()
    await expect(rows(page).first()).not.toHaveAttribute("aria-setsize")
    await expect(amount).toBeVisible()

    await form(page).getByRole("button", { name: "Повернути" }).click()
    await expect(
      row(page, 12).getByRole("combobox", { name: "Товар чи послуга" }),
    ).toBeFocused()
    await expect(amount).toBeVisible()
  })

  test("з поля рядка 3 до знижки документа — Ctrl+End, дві клавіші", async ({
    page,
  }) => {
    await openDocument(page)
    await row(page, 3).getByLabel("Кількість").focus()
    await page.keyboard.press("Control+End")
    const discount = form(page).getByLabel("Знижка на документ, у відсотках")
    await expect(discount).toBeFocused()
    await expect(discount).toBeInViewport()
    // Кнопка над рядками веде туди само.
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await form(page)
      .getByRole("button", { name: /^До підсумків/ })
      .click()
    await expect(discount).toBeFocused()
  })

  test("пошук знаходить рядок 450 і ставить на нього фокус; Ctrl+F у рядках — у пошук", async ({
    page,
  }) => {
    await openDocument(page)
    const search = form(page).getByRole("combobox", { name: "Пошук у рядках" })
    await row(page, 2).getByLabel("Назва").focus()
    await page.keyboard.press("ControlOrMeta+f")
    await expect(search).toBeFocused()
    await page.keyboard.type("450")
    const first = page.getByRole("option").first()
    await expect(first).toHaveText(/^Рядок 450/)
    // Enter вибирає підсвічений рядок: Base UI підсвічує перший, коли список уже намальовано.
    await expect(first).toHaveAttribute("data-highlighted")
    await page.keyboard.press("Enter")
    // Рядка 450 не було в DOM: він з'являється, і фокус прокручує до нього сторінку.
    const picker = row(page, 450).getByRole("combobox", {
      name: "Товар чи послуга",
    })
    await expect(picker).toBeFocused()
    await expect(picker).toBeInViewport()
    await expect(search).toHaveValue("450")

    // Назва розділу: фокус на поле зі збігом.
    await search.fill("Етап 19")
    await page.getByRole("option", { name: /^Рядок 451/ }).click()
    await expect(row(page, 451).getByLabel("Розділ")).toBeFocused()
    await expect(row(page, 451).getByLabel("Розділ")).toHaveValue("Етап 19")
  })

  test("розділ із рядками переноситься вгору й назад, фокус іде за розділом", async ({
    page,
  }) => {
    await openDocument(page)
    await scrollToRow(page, 26)
    await expect(row(page, 26).getByLabel("Розділ")).toHaveValue("Етап 2")
    await rowAction(page, 26, "Перенести розділ із рядками вище")
    const firstMenu = row(page, 1).getByRole("button", { name: "Дії: Рядок 1" })
    await expect(firstMenu).toBeFocused()
    await expect(firstMenu).toBeInViewport()
    await expect(row(page, 1).getByLabel("Розділ")).toHaveValue("Етап 2")

    await rowAction(page, 1, "Перенести розділ із рядками нижче")
    const backMenu = row(page, 26).getByRole("button", {
      name: "Дії: Рядок 26",
    })
    await expect(backMenu).toBeFocused()
    await expect(backMenu).toBeInViewport()
    await expect(row(page, 26).getByLabel("Розділ")).toHaveValue("Етап 2")
    await expect(form(page).getByText("Змін немає")).toBeVisible()
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await expect(row(page, 1).getByLabel("Розділ")).toHaveValue("Етап 1")
  })

  for (const theme of ["light", "dark"] as const)
    test(`axe (${theme})`, async ({ page }) => {
      await openDocument(page, theme)
      await expectNoA11yViolations(page)
    })
})

test.describe("великий документ на телефоні", () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test("картки без горизонтальної прокрутки, панель збереження не ховає поле у фокусі", async ({
    page,
  }) => {
    await openDocument(page)
    await expectNoHorizontalScroll(page)
    await row(page, 2).getByLabel("Назва").focus()
    for (let step = 0; step < 25; step++) await page.keyboard.press("Tab")
    const focused = await page.locator(":focus").boundingBox()
    const bar = await form(page).locator('[data-slot="save-bar"]').boundingBox()
    expect(focused && bar).toBeTruthy()
    if (focused && bar)
      expect(focused.y + focused.height).toBeLessThanOrEqual(bar.y)
    await expectNoA11yViolations(page)
  })
})
