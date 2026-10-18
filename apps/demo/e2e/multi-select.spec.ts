import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith } from "./helpers"

// Крок 1.4b2 (ADR-0027): мультивибір із довідника (UI40) на сторінці «Вибір і реквізити».
const PATH = "/#/pickers"

/** Розділ сторінки за заголовком h2. */
const section = (page: Page, title: string) =>
  page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { level: 2, name: title }) })

const tagsForm = (page: Page) => section(page, "Кілька значень із довідника")
const states = (page: Page) => section(page, "Стани мультивибору")
const tagsField = (page: Page) =>
  tagsForm(page).getByRole("combobox", { name: "Теги клієнта" })

test.describe("мультивибір: поле у формі", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("вибір кількох значень, пошук, список не закривається, перевірка й збереження", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    // Закрити список без вибору — вийти з поля: обов'язкове поле показує помилку.
    await tagsField(page).click()
    const search = page.getByRole("combobox", { name: "Пошук: Теги клієнта" })
    await expect(search).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(tagsField(page)).toHaveAttribute("aria-invalid", "true")
    await expect(tagsField(page)).toHaveAccessibleDescription(
      "Хоча б один Виберіть хоча б один тег",
    )

    await tagsField(page).click()
    await page.getByRole("option", { name: "VIP", exact: true }).click()
    await page.getByRole("option", { name: "Опт", exact: true }).click()
    // Список лишається відкритим, вибрані позначено.
    await expect(
      page.getByRole("option", { name: "VIP", exact: true }),
    ).toHaveAttribute("aria-selected", "true")
    await search.fill("роз")
    await expect(page.getByRole("option")).toHaveText(["Роздріб"])
    await page.keyboard.press("Enter")
    await search.fill("ххх")
    await expect(page.getByText("За «ххх» нічого не знайдено")).toBeVisible()
    await expectNoA11yViolations(page)
    await page.keyboard.press("Escape")

    await expect(tagsField(page)).toHaveText("VIPОптРоздріб")
    await expect(tagsField(page)).not.toHaveAttribute("aria-invalid")
    await tagsForm(page).getByRole("button", { name: "Зберегти теги" }).click()
    await expect(
      tagsForm(page).getByText("Збережено: VIP, Опт, Роздріб"),
    ).toBeVisible()

    // «Очистити» прибирає все, фокус — на полі.
    await tagsForm(page)
      .getByRole("button", { name: "Очистити: Теги клієнта" })
      .click()
    await expect(tagsField(page)).toHaveText("Виберіть…")
    await expect(tagsField(page)).toBeFocused()
  })

  test("клавіатура: літера на закритому полі відкриває пошук із неї, стрілка й Enter вибирають, Esc закриває", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    await tagsField(page).focus()
    await page.keyboard.press("v")
    const search = page.getByRole("combobox", { name: "Пошук: Теги клієнта" })
    await expect(search).toHaveValue("v")
    await expect(page.getByRole("option")).toHaveText(["VIP"])
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(page.getByRole("option", { name: "VIP" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await page.keyboard.press("Escape")
    await expect(tagsField(page)).toBeFocused()
    await expect(tagsField(page)).toHaveText("VIP")
  })
})

test.describe("мультивибір: стани", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("значення поза довідником, лише читання, вимкнено", async ({ page }) => {
    await openWith(page, {}, PATH)
    const missing = states(page).getByRole("combobox", { name: "Тег видалили" })
    await expect(missing).toHaveText("VIPtag-archived")
    await missing.click()
    const archived = page.getByRole("option", { name: /^tag-archived/ })
    await expect(archived).toContainText("Немає в довіднику")
    await archived.click()
    await page.keyboard.press("Escape")
    await expect(missing).toHaveText("VIP")

    const readOnly = states(page).getByRole("textbox", {
      name: "Лише читання",
    })
    await expect(readOnly).toHaveValue("Ключовий клієнт, Партнер")
    await expect(readOnly).toHaveAttribute("readonly")
    await expect(
      states(page).getByRole("combobox", { name: "Вимкнено" }),
    ).toBeDisabled()
  })

  test("довідник: вантажиться, не завантажився з повтором, порожній", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const loading = states(page).getByRole("combobox", {
      name: "Довідник вантажиться",
    })
    await expect(loading).toHaveText("Завантаження…")
    await loading.click()
    await expect(
      page.getByRole("status").getByText("Завантаження…"),
    ).toBeVisible()
    await page.keyboard.press("Escape")

    await states(page)
      .getByRole("combobox", { name: "Довідник не завантажився" })
      .click()
    await expect(
      page.getByText("Не вдалося завантажити варіанти"),
    ).toBeVisible()
    await page.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(page.getByRole("option", { name: "VIP" })).toBeVisible()
    await page.keyboard.press("Escape")

    await states(page)
      .getByRole("combobox", { name: "Довідник порожній" })
      .click()
    await expect(
      page.getByText("Довідник порожній", { exact: true }).last(),
    ).toBeVisible()
  })
})

test.describe("мультивибір: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("нижня шторка: вибір не закриває її, «Готово» закриває, без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    await tagsField(page).click()
    const sheet = page.getByRole("dialog", { name: "Теги клієнта" })
    await expect(
      sheet.getByRole("combobox", { name: "Пошук: Теги клієнта" }),
    ).toBeVisible()
    await sheet.getByRole("option", { name: "Новий", exact: true }).click()
    await sheet.getByRole("option", { name: "Експорт", exact: true }).click()
    await expect(sheet).toBeVisible()
    await expectNoA11yViolations(page)
    await sheet.getByRole("button", { name: "Готово" }).click()
    await expect(sheet).toBeHidden()
    await expect(tagsField(page)).toHaveText("НовийЕкспорт")
    await expect(tagsField(page)).toBeFocused()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
