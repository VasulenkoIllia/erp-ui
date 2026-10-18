import { expect, test, type Page } from "@playwright/test"

import {
  cellOf,
  chooseScenario,
  expectNoA11yViolations,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок 1.4b2 (ADR-0027): сегменти модуля B1 — мультивибір у формах організації й контакту
 * (`erp/multi-select`) і довідник сегментів (List Report, форма в діалозі, назва не повторюється).
 * Моки живуть у пам'яті сторінки: між сторінками модуля переходимо без перезавантаження.
 */
const SEGMENTS = "/#/m/B1/segments"
const CONTACTS = "/#/m/B1/contacts"
/** Юрособа з фікстур із сегментом «Клієнт». */
const LEGAL_CARD = "/#/m/B1/organizations/org-013"

const dialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true })
const grid = (page: Page) =>
  page.getByRole("grid", { name: "Сегменти", exact: true })
const rows = (page: Page) => grid(page).locator('[role="row"][data-index]')
/** Перехід усередині застосунку: моки (і створене в них) лишаються. */
const goInApp = (page: Page, hash: string) =>
  page.evaluate((target) => {
    location.hash = target.replace(/^\/#/, "#")
  }, hash)

test.describe("B1: довідник сегментів", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("створення, назва, яка вже є, перейменування; новий сегмент — у формі організації й у картці", async ({
    page,
  }) => {
    await openWith(page, {}, SEGMENTS)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сегменти")
    await expect(await cellOf(grid(page), rows(page), "Назва")).toHaveText([
      "Клієнт",
      "Ключовий",
      "Новий",
      "Партнер",
      "Постачальник",
    ])
    await expectNoA11yViolations(page)

    const create = page.getByRole("button", { name: "Створити сегмент" })
    await create.click()
    const form = dialog(page, "Новий сегмент")
    const name = form.getByRole("textbox", { name: "Назва" })
    await expect(name).toBeFocused()
    // Назва, яка вже є, — без урахування регістру й пробілів: помилка біля поля.
    await name.fill(" клієнт ")
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(name).toHaveAccessibleDescription(
      "Таке значення вже є в іншого запису",
    )
    await name.fill("VIP")
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(form).toBeHidden()
    await expect(page.getByText("Сегмент створено: VIP")).toBeVisible()
    await expect(create).toBeFocused()
    await expect(
      grid(page).getByRole("button", { name: "Змінити сегмент «VIP»" }),
    ).toBeVisible()

    await grid(page)
      .getByRole("button", { name: "Змінити сегмент «Новий»" })
      .click()
    const edit = dialog(page, "Змінити сегмент")
    await edit.getByRole("textbox", { name: "Назва" }).fill("Нові клієнти")
    await edit.getByRole("button", { name: "Зберегти" }).click()
    await expect(edit).toBeHidden()
    await expect(
      grid(page).getByRole("button", {
        name: "Змінити сегмент «Нові клієнти»",
      }),
    ).toBeFocused()

    // Довідник у формах перечитується: новий сегмент — серед варіантів.
    await goInApp(page, LEGAL_CARD)
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const organization = dialog(page, "Змінити організацію")
    const segments = organization.getByRole("combobox", { name: "Сегменти" })
    await expect(segments).toHaveText("Клієнт")
    await segments.click()
    await page.getByRole("option", { name: "VIP", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(segments).toHaveText("КлієнтVIP")
    await organization.getByRole("button", { name: "Зберегти" }).click()
    await expect(organization).toBeHidden()
    await expect(page.getByRole("tabpanel")).toContainText("СегментиКлієнтVIP")
  })

  test("без права: «Створити сегмент» неактивне з причиною, назва — текст", async ({
    page,
  }) => {
    await openWith(page, {}, SEGMENTS, { user: USERS.sales })
    const create = page.getByRole("button", { name: "Створити сегмент" })
    await expect(create).toHaveAttribute("aria-disabled", "true")
    await expect(create).toHaveAccessibleDescription(
      "Немає права створювати сегменти",
    )
    await expect(grid(page).getByText("Клієнт", { exact: true })).toBeVisible()
    await expect(
      grid(page).getByRole("button", { name: /^Змінити сегмент/ }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)
  })
})

test.describe("B1: сегменти у формах", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("конфлікт: порівняння показує назви сегментів", async ({ page }) => {
    await openWith(page, {}, LEGAL_CARD)
    await chooseScenario(page, "Конфлікт збереження")
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const form = dialog(page, "Змінити організацію")
    await form.getByRole("combobox", { name: "Сегменти" }).click()
    await page.getByRole("option", { name: "Новий", exact: true }).click()
    await page.keyboard.press("Escape")
    await form.getByRole("button", { name: "Зберегти" }).click()

    const conflict = dialog(page, "Запис змінив інший користувач")
    const row = conflict.getByRole("row", { name: /Сегменти/ })
    await expect(row).toContainText("Клієнт, Новий")
    await expect(row.getByRole("cell").last()).toHaveText("Клієнт")
    await conflict.getByRole("button", { name: "Взяти збережене" }).click()
    await expect(form.getByRole("combobox", { name: "Сегменти" })).toHaveText(
      "Клієнт",
    )
  })

  test("зняти й знову вибрати сегмент — форма без змін, запиту немає", async ({
    page,
  }) => {
    // org-001 має два сегменти: «Клієнт» і «Ключовий».
    await openWith(page, {}, "/#/m/B1/organizations/org-001")
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const form = dialog(page, "Змінити організацію")
    const segments = form.getByRole("combobox", { name: "Сегменти" })
    await expect(segments).toHaveText("КлієнтКлючовий")
    await segments.click()
    const client = page.getByRole("option", { name: "Клієнт", exact: true })
    await client.click()
    await client.click()
    await page.keyboard.press("Escape")
    let patched = false
    page.on("request", (request) => {
      if (request.method() === "PATCH") patched = true
    })
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Змін немає, зберігати нічого" }),
    ).toBeVisible()
    await expect(form).toBeHidden()
    expect(patched).toBe(false)
  })

  test("новий контакт із сегментами — вони в картці", async ({ page }) => {
    await openWith(page, {}, CONTACTS)
    await page.getByRole("button", { name: "Створити контакт" }).click()
    const form = dialog(page, "Новий контакт")
    await form.getByRole("textbox", { name: "Ім'я" }).fill("Ірина Сегментна")
    await form.getByRole("combobox", { name: "Сегменти" }).click()
    await page.getByRole("option", { name: "Партнер", exact: true }).click()
    await page.getByRole("option", { name: "Ключовий", exact: true }).click()
    await page.keyboard.press("Escape")
    await form.getByRole("button", { name: "Створити" }).click()

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ірина Сегментна",
    )
    await expect(page.getByText("СегментиПартнерКлючовий")).toBeVisible()
  })
})

test.describe("B1: сегменти на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("довідник картками; у формі — шторка поверх діалогу, без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, SEGMENTS)
    await expect(
      page.getByRole("button", { name: "Змінити сегмент «Клієнт»" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await goInApp(page, LEGAL_CARD)
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const form = dialog(page, "Змінити організацію")
    const segments = form.getByRole("combobox", { name: "Сегменти" })
    await segments.click()
    const sheet = dialog(page, "Сегменти")
    await sheet.getByRole("option", { name: "Партнер", exact: true }).click()
    await sheet.getByRole("button", { name: "Готово" }).click()
    await expect(sheet).toBeHidden()
    await expect(segments).toHaveText("КлієнтПартнер")
    await expect(form).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
