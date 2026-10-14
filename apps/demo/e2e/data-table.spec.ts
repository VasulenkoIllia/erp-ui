import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith } from "./helpers"

/**
 * erp/data-table на стрес-сторінці (SPEC §18.1, ADR-0016): 10 000 рахунків вікнами з сервера,
 * клавіатура гріда за W3C APG, розкладка колонок за шириною контейнера, картки на телефоні.
 */
const DATA = "/#/data"

const grid = (page: Page) =>
  page.getByRole("grid", { name: "Рахунки клієнтам" })
const count = (page: Page) => page.locator('[data-slot="data-table-status"]')

/** Рядок і стовпець клітинки, в якій фокус (data-row: -1 — заголовки). */
const focusedCell = (page: Page) =>
  page.evaluate(() => {
    const cell = document.activeElement?.closest<HTMLElement>("[data-cell]")
    return cell
      ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
      : null
  })

test.describe("таблиця даних: десктоп", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("одна зупинка Tab, стрілки, Home/End і Ctrl+End до рядка 10 000", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")
    await expect(grid(page)).toHaveAttribute("aria-rowcount", "10001")
    await expect(
      page.getByRole("columnheader", { name: "Дата" }),
    ).toHaveAttribute("aria-sort", "descending")

    // Tab з «Оновити» в рядку стану — у грід, на прапорець першої колонки (вибір усіх).
    const selectAll = page.getByRole("checkbox", {
      name: "Вибрати всі за фільтром",
    })
    await page.getByRole("button", { name: "Оновити" }).focus()
    await page.keyboard.press("Tab")
    await expect(selectAll).toBeFocused()
    // Ще один Tab виходить із гріда: усередині — лише одна зупинка.
    await page.keyboard.press("Tab")
    expect(await focusedCell(page)).toBeNull()
    await page.keyboard.press("Shift+Tab")
    await expect(selectAll).toBeFocused()

    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowRight")
    expect(await focusedCell(page)).toEqual({ row: 1, col: 1 })
    await page.keyboard.press("End")
    // Клітинка з одним елементом фокусує сам елемент — «Редагувати…».
    await expect(page.locator(":focus")).toHaveAccessibleName(
      /^Редагувати 2026-/,
    )
    await page.keyboard.press("Home")
    expect(await focusedCell(page)).toEqual({ row: 1, col: 0 })

    await page.keyboard.press("Control+End")
    expect(await focusedCell(page)).toEqual({ row: 9_999, col: 7 })
    const last = grid(page).locator('[aria-rowindex="10001"]')
    // Останнє вікно довантажується, фокус лишається в рядку 10 000.
    await expect(last).toContainText(/2026-\d+/)
    expect(await focusedCell(page)).toEqual({ row: 9_999, col: 7 })
    await page.keyboard.press("PageUp")
    expect((await focusedCell(page))?.row).toBeLessThan(9_999)

    await page.keyboard.press("Control+Home")
    await expect(selectAll).toBeFocused()
  })

  test("сортування з клавіатури: нові дані — з першого рядка", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")
    const amount = page.getByRole("columnheader", { name: "Сума" })
    await amount.getByRole("button").focus()
    await page.keyboard.press("Enter")
    await expect(amount).toHaveAttribute("aria-sort", "descending")
    await expect(amount.getByRole("button")).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(amount).toHaveAttribute("aria-sort", "ascending")
    await expect(
      grid(page).locator('[aria-rowindex="2"] [aria-colindex="6"]'),
    ).toHaveText(/^[\d\s]+,\d\d/)
  })

  test("рядок стану: «Оновлено о…» і «Оновити»", async ({ page }) => {
    await openWith(page, {}, DATA)
    await expect(page.getByText(/^Оновлено о \d\d:\d\d$/)).toBeVisible()
    await page.getByRole("button", { name: "Оновити" }).click()
    await expect(count(page)).toHaveText("10 000 рахунків")
  })
})

test.describe("таблиця даних: планшет", () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test("колонки: «Сплатити до» сховано, «Дата» під рядком, прапорець і «Номер» липкі", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    await expect(count(page)).toHaveText("10 000 рахунків")
    await expect(
      page.getByRole("columnheader", { name: "Сплатити до" }),
    ).toHaveCount(0)
    const first = grid(page).locator('[aria-rowindex="2"]')
    await expect(first.getByText("Дата:")).toBeVisible()
    await expect(first.locator('[aria-colindex="1"]')).toHaveCSS(
      "position",
      "sticky",
    )
    const number = first.locator('[aria-colindex="2"]')
    await expect(number).toHaveCSS("position", "sticky")
    // Прокрутка вбік: номер лишається на місці.
    const before = await number.boundingBox()
    await grid(page).evaluate((el) => {
      el.scrollLeft = 200
    })
    expect((await number.boundingBox())?.x).toBe(before?.x)
    await expectNoA11yViolations(page)
  })
})

test.describe("таблиця даних: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картки: увесь список у aria-setsize, PageDown між картками, сортування", async ({
    page,
  }) => {
    await openWith(page, {}, DATA)
    const feed = page.getByRole("feed", { name: "Рахунки клієнтам" })
    await expect(feed).toBeVisible()
    await expect(page.getByRole("grid")).toHaveCount(0)
    const first = feed.getByRole("article").first()
    await expect(first).toHaveAttribute("aria-setsize", "10000")
    await expect(first).toHaveAccessibleName(/^2026-/)

    await first.focus()
    await page.keyboard.press("PageDown")
    await expect(page.locator(":focus")).toHaveAttribute("aria-posinset", "2")
    await page.keyboard.press("PageUp")
    await expect(page.locator(":focus")).toHaveAttribute("aria-posinset", "1")

    await page.getByRole("combobox", { name: "Сортування" }).click()
    await page.getByRole("option", { name: "Сума, за спаданням" }).click()
    // У тексті кнопки ще й значок ▼.
    await expect(
      page.getByRole("combobox", { name: "Сортування" }),
    ).toContainText("Сума, за спаданням")
    await expect(count(page)).toHaveText("10 000 рахунків")

    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(width).toBeLessThanOrEqual(390)
    await expectNoA11yViolations(page)
  })
})
