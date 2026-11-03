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

test.describe("великий документ", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

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
