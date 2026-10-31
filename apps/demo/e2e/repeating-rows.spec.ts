import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Повторювані рядки, «ключ–значення» й липка панель збереження в демо «Форми» (UI42, PF11; ADR-0047):
 * те, чого не перевірити без справжнього браузера: фокус і порядок DOM, липкість, елемент у фокусі під
 * панеллю (WCAG 2.4.11).
 */
const FORMS = "/#/forms"

const form = (page: Page) => page.getByTestId("rows-form")
const bar = (page: Page) => page.locator('[data-slot="save-bar"]')
const step = (page: Page, index: number) =>
  form(page).getByRole("group", { name: `Етап ${index}`, exact: true })

async function scrollToForm(page: Page) {
  await form(page).evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 100
    window.scrollTo({ top, behavior: "instant" })
  })
}

/** Елемент у фокусі не перекривається панеллю збереження й нижньою панеллю. */
async function expectFocusNotCovered(page: Page) {
  const covered = await page.evaluate(() => {
    const focused = document.activeElement as HTMLElement
    const box = focused.getBoundingClientRect()
    const panel = document
      .querySelector('[data-slot="save-bar"]')
      ?.getBoundingClientRect()
    return Boolean(panel && box.bottom > panel.top && box.top < panel.bottom)
  })
  expect(covered).toBe(false)
}

test.describe("повторювані рядки", () => {
  test("клавіатурою: додати, заповнити, змінити порядок, вилучити, повернути", async ({
    page,
  }) => {
    await openWith(page, {}, FORMS)
    const add = form(page).getByRole("button", { name: "Додати етап" })
    await add.focus()
    await page.keyboard.press("Enter")
    await expect(step(page, 3).getByLabel("Назва")).toBeFocused()
    await page.keyboard.type("Підписання")

    const up = form(page).getByRole("button", { name: "Підняти: Етап 3" })
    await up.focus()
    await page.keyboard.press("Enter")
    await expect(step(page, 2).getByLabel("Назва")).toHaveValue("Підписання")
    await expect(
      form(page).getByRole("button", { name: "Підняти: Етап 2" }),
    ).toBeFocused()

    await page.keyboard.press("Enter")
    await expect(step(page, 1).getByLabel("Назва")).toHaveValue("Підписання")
    // Рядок став першим: кнопка неактивна, але фокус лишився на ній.
    const first = form(page).getByRole("button", { name: "Підняти: Етап 1" })
    await expect(first).toBeFocused()
    await expect(first).toHaveAttribute("aria-disabled", "true")

    await form(page).getByRole("button", { name: "Вилучити: Етап 1" }).focus()
    await page.keyboard.press("Enter")
    await expect(step(page, 1).getByLabel("Назва")).toHaveValue(
      "Чернетка договору",
    )
    await expect(
      form(page).getByRole("button", { name: "Вилучити: Етап 1" }),
    ).toBeFocused()

    await form(page).getByRole("button", { name: "Повернути" }).click()
    await expect(step(page, 1).getByLabel("Назва")).toHaveValue("Підписання")
    await expect(step(page, 1).getByLabel("Назва")).toBeFocused()
  })

  test("межа 4 етапи: «Додати» неактивна з поясненням", async ({ page }) => {
    await openWith(page, {}, FORMS)
    const add = form(page).getByRole("button", { name: "Додати етап" })
    await add.click()
    await add.click()
    await expect(add).toHaveAttribute("aria-disabled", "true")
    await expect(add).toHaveAccessibleDescription("Не більше 4 рядків")
  })

  test("помилка всієї групи й помилка поля рядка у зведенні", async ({
    page,
  }) => {
    await openWith(page, {}, FORMS)
    await step(page, 1).getByLabel("Днів").fill("40")
    await form(page).getByRole("button", { name: "Зберегти" }).click()
    const summary = form(page).locator('[data-slot="form-error-summary"]')
    await expect(summary).toContainText("Разом етапів понад 30 днів")
    await expect(summary).toBeFocused()
    await summary.getByRole("button").click()
    await expect(step(page, 1).getByLabel("Назва")).toBeFocused()
  })

  test("лише для читання: поля без кнопок і панелі", async ({ page }) => {
    await openWith(page, {}, FORMS)
    await page.getByRole("checkbox", { name: "Лише для читання" }).check()
    await expect(step(page, 1).getByLabel("Назва")).toHaveAttribute(
      "readonly",
      "",
    )
    await expect(
      form(page).getByRole("button", { name: /Додати|Вилучити|Підняти/ }),
    ).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
  })

  for (const theme of ["light", "dark"] as const)
    test(`axe (${theme})`, async ({ page }) => {
      await openWith(page, { theme }, FORMS)
      await step(page, 1).getByLabel("Назва").fill("")
      await form(page).getByRole("button", { name: "Зберегти" }).click()
      await expect(
        form(page).locator('[data-slot="form-error-summary"]'),
      ).toBeVisible()
      await expectNoA11yViolations(page)
    })
})

test.describe("липка панель збереження", () => {
  test("390 px: панель липне над нижньою панеллю й не перекриває поле у фокусі", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWith(page, {}, FORMS)
    await scrollToForm(page)
    const boxes = await page.evaluate(() => ({
      bar: document
        .querySelector('[data-slot="save-bar"]')
        ?.getBoundingClientRect().bottom,
      nav: document
        .querySelector('[data-slot="bottom-nav"]')
        ?.getBoundingClientRect().top,
    }))
    expect(boxes.bar).toBeLessThanOrEqual(boxes.nav ?? 0)
    expect(boxes.bar).toBeGreaterThan((boxes.nav ?? 0) - 24)

    // Tab іде полями вниз: кожне поле лишається видимим над панеллю (WCAG 2.4.11).
    await step(page, 1).getByLabel("Назва").focus()
    for (let press = 0; press < 12; press += 1) {
      await page.keyboard.press("Tab")
      await expectFocusNotCovered(page)
    }
    await expectNoHorizontalScroll(page)
  })

  test("1440 px: панель липне до низу екрана", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 })
    await openWith(page, {}, FORMS)
    await scrollToForm(page)
    const bottom = await bar(page).evaluate(
      (element) => element.getBoundingClientRect().bottom,
    )
    expect(bottom).toBeLessThanOrEqual(500)
    expect(bottom).toBeGreaterThan(480)
    await expect(
      bar(page).getByRole("button", { name: "Зберегти" }),
    ).toBeInViewport()
  })

  test("стани: зміни, збереження, знову без змін, фокус лишається на кнопці", async ({
    page,
  }) => {
    await openWith(page, {}, FORMS)
    const state = bar(page).getByRole("status")
    await expect(state).toHaveText("Змін немає")
    await step(page, 1).getByLabel("Назва").fill("Нова назва")
    await expect(state).toHaveText("Є незбережені зміни")
    const save = bar(page).getByRole("button", { name: "Зберегти" })
    await save.focus()
    await page.keyboard.press("Enter")
    await expect(state).toHaveText("Зберігаємо…")
    await expect(save).toBeFocused()
    await expect(state).toHaveText("Змін немає")
    await expect(save).toBeFocused()
  })

  test("«Скасувати зміни» мишею з фокусом у рядку: фокус на кнопці, а не на сторінці", async ({
    page,
  }) => {
    await openWith(page, {}, FORMS)
    await step(page, 1).getByLabel("Назва").fill("Нова назва")
    const discard = bar(page).getByRole("button", { name: "Скасувати зміни" })
    await discard.click()
    await page
      .getByRole("alertdialog", { name: "Скасувати зміни?" })
      .getByRole("button", { name: "Скасувати зміни" })
      .click()
    await expect(bar(page).getByRole("status")).toHaveText("Змін немає")
    await expect(discard).toBeFocused()
  })

  test("збереження клавішею Enter у рядку: фокус лишається в цьому рядку", async ({
    page,
  }) => {
    await openWith(page, {}, FORMS)
    const field = step(page, 2).getByLabel("Назва")
    await field.fill("Нова назва")
    await field.press("Enter")
    await expect(bar(page).getByRole("status")).toHaveText("Змін немає")
    await expect(step(page, 2).getByLabel("Назва")).toBeFocused()
  })

  test("360 px англійською: кнопки переносяться, панель у межах екрана", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openWith(page, { language: "en" }, FORMS)
    await scrollToForm(page)
    await expectNoHorizontalScroll(page)
    await expect(
      bar(page).getByRole("button", { name: "Discard changes" }),
    ).toBeInViewport()
    await expect(
      bar(page).getByRole("button", { name: "Save" }),
    ).toBeInViewport()
    // Відступ прокрутки сталий: він має покривати панель у два ряди разом із нижньою панеллю.
    const { padding, covered } = await bar(page).evaluate((element) => ({
      padding: parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingBottom,
      ),
      covered: window.innerHeight - element.getBoundingClientRect().top,
    }))
    expect(padding).toBeGreaterThanOrEqual(covered)
  })
})
