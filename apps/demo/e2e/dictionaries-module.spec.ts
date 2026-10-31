import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль A6 «Довідники» на місці заглушки `/m/A6` (ADR-0047): п'ять довідників на List Report, форми
 * в діалозі, вимкнення замість видалення, частини оплати й зовнішні коди (UI42), типові значення з
 * липкою панеллю збереження (PF11). Демо додає поле податку «Рядок у звіті» й вид причини «Списання».
 */
const MODULE = "/#/m/A6"
const TAXES = "/#/m/A6/taxes"
const UNITS = "/#/m/A6/units"
const TERMS = "/#/m/A6/payment-terms"
const TAGS = "/#/m/A6/tags"
const REASONS = "/#/m/A6/reasons"
const DEFAULTS = "/#/m/A6/defaults"

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name })
const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const saveBar = (page: Page) => page.locator('[data-slot="save-bar"]')
const barState = (page: Page) => saveBar(page).getByRole("status")
const rowOf = (page: Page, name: string) =>
  page.getByRole("row").filter({ hasText: name })
const combo = (page: Page, name: string) =>
  page.getByRole("combobox", { name, exact: true })
const confirmDefault = (page: Page) =>
  page.getByRole("alertdialog", { name: "Вимкнути типове значення?" })

/** Типове значення вимикається лише після питання. */
async function disableDefault(page: Page, name: string) {
  await page.getByRole("button", { name: `Вимкнути: ${name}` }).click()
  await confirmDefault(page)
    .getByRole("button", { name: "Вимкнути й прибрати з типових" })
    .click()
}

test.describe("модуль A6: довідники", () => {
  test("адреса модуля веде на податки, у навігації п'ять довідників і типові значення", async ({
    page,
  }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/A6\/taxes$/)
    await expect(heading(page)).toHaveText("Податки")
    for (const path of [
      "taxes",
      "units",
      "payment-terms",
      "tags",
      "reasons",
      "defaults",
    ])
      await expect(
        page.locator(`a[href="#/m/A6/${path}"]`).first(),
      ).toBeAttached()
  })

  test("новий податок: поля, поле розширення, код, тост, рядок у списку", async ({
    page,
  }) => {
    await openWith(page, {}, TAXES)
    await page.getByRole("button", { name: "Додати податок" }).click()
    const form = dialog(page, "Новий податок")
    await form.getByLabel("Назва").fill("Акциз 5%")
    await form.getByLabel("Ставка").fill("5")
    await form.getByRole("checkbox", { name: "Податок уже в ціні" }).check()
    await form.getByLabel("Рядок у звіті").fill("12")
    await form.getByRole("button", { name: "Додати код" }).click()
    await expect(form.getByLabel("Система")).toBeFocused()
    await form.getByLabel("Система").fill("Бухгалтерія")
    await form.getByLabel("Код", { exact: true }).fill("500")
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(form).toBeHidden()
    await expect(page.getByText("Податок додано: Акциз 5%")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Додати податок" }),
    ).toBeFocused()
    const row = rowOf(page, "Акциз 5%")
    await expect(row).toContainText("5")
    await expect(row).toContainText("Так")
    await expect(row).toContainText("Активне")

    await row.getByRole("button", { name: "Змінити: Акциз 5%" }).click()
    const edit = dialog(page, "Зміна податку")
    await expect(edit.getByLabel("Система")).toHaveValue("Бухгалтерія")
    await expect(edit.getByLabel("Рядок у звіті")).toHaveValue("12")
  })

  test("та сама назва: помилка біля поля, форма відкрита, введене лишається", async ({
    page,
  }) => {
    await openWith(page, {}, TAXES)
    await page.getByRole("button", { name: "Додати податок" }).click()
    const form = dialog(page, "Новий податок")
    await form.getByLabel("Назва").fill("пдв 20%")
    await form.getByLabel("Ставка").fill("20")
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(form.getByLabel("Назва")).toHaveAttribute(
      "aria-invalid",
      "true",
    )
    await expect(form).toContainText("Таке значення вже є в іншого запису")
    await expect(form.getByLabel("Ставка")).toHaveValue("20")
  })

  test("зміна без змін закриває форму, запиту немає", async ({ page }) => {
    await openWith(page, {}, TAXES)
    let patches = 0
    page.on("request", (request) => {
      if (request.method() === "PATCH") patches += 1
    })
    await page.getByRole("button", { name: "Змінити: ПДВ 7%" }).click()
    const form = dialog(page, "Зміна податку")
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(form).toBeHidden()
    expect(patches).toBe(0)
  })

  test("конфлікт збереження: порівняння зовнішніх кодів, «Зберегти мої зміни»", async ({
    page,
  }) => {
    await openWith(page, {}, UNITS)
    await chooseScenario(page, "Конфлікт збереження")
    await page.getByRole("button", { name: "Змінити: Метр" }).click()
    const form = dialog(page, "Зміна одиниці")
    await form.getByLabel("Код", { exact: true }).fill("9999")
    await form.getByRole("button", { name: "Зберегти" }).click()
    const conflict = dialog(page, "Запис змінив інший користувач")
    await expect(
      conflict.getByRole("row", { name: /Зовнішні коди/ }),
    ).toContainText("Бухгалтерія: 9999")
    await conflict.getByRole("button", { name: "Зберегти мої зміни" }).click()
    await expect(form).toBeHidden()
    await expect(page.getByText("Одиницю збережено: Метр")).toBeVisible()
  })

  test("частини оплати: залишок у новому рядку, сума, зведення, порядок", async ({
    page,
  }) => {
    await openWith(page, {}, TERMS)
    await page.getByRole("button", { name: "Додати умови" }).click()
    const form = dialog(page, "Нові умови оплати")
    await form.getByLabel("Назва").fill("Три платежі")
    const percent = form.getByLabel("Відсоток")
    await expect(percent).toHaveValue("100")
    await percent.fill("40")
    await expect(form.getByText(/Разом: 40/)).toBeVisible()

    await form.getByRole("button", { name: "Додати частину" }).click()
    const second = form.getByRole("group", { name: "Частина 2" })
    await expect(second.getByLabel("Відсоток")).toBeFocused()
    await expect(second.getByLabel("Відсоток")).toHaveValue("60")
    await second.getByLabel("Відсоток").fill("30")
    await second.getByLabel("Днів").fill("10")

    // Сума не 100: помилка групи й перехід зі зведення.
    await form.getByRole("button", { name: "Створити" }).click()
    const summary = form.locator('[data-slot="form-error-summary"]')
    await expect(summary).toContainText("Сума частин має дорівнювати 100")
    await summary.getByRole("button").click()
    await expect(
      form.getByRole("group", { name: "Частина 1" }).getByLabel("Відсоток"),
    ).toBeFocused()

    await form.getByRole("button", { name: "Додати частину" }).click()
    const third = form.getByRole("group", { name: "Частина 3" })
    await expect(third.getByLabel("Відсоток")).toHaveValue("30")
    await third.getByLabel("Днів").fill("20")
    await third.getByRole("combobox", { name: "Від якої дати" }).click()
    await page.getByRole("option", { name: "Дата поставки" }).click()

    await form.getByRole("button", { name: "Опустити: Частина 1" }).click()
    await expect(
      form.getByRole("button", { name: "Опустити: Частина 2" }),
    ).toBeFocused()
    await expect(
      form.getByRole("group", { name: "Частина 1" }).getByLabel("Відсоток"),
    ).toHaveValue("30")

    await form.getByRole("button", { name: "Створити" }).click()
    await expect(form).toBeHidden()
    await expect(rowOf(page, "Три платежі")).toContainText(
      "30% через 10 днів після рахунку, 40% у день рахунку, 30% через 20 днів після поставки",
    )
  })

  test("умови: вилучена частина зберігається, «Повернути» до збереження", async ({
    page,
  }) => {
    await openWith(page, {}, TERMS)
    await page
      .getByRole("button", {
        name: "Змінити: Половина наперед, решта після поставки",
      })
      .click()
    const form = dialog(page, "Зміна умов оплати")
    await form.getByRole("button", { name: "Вилучити: Частина 2" }).click()
    await expect(form.getByText(/Разом: 50/)).toBeVisible()
    await form.getByRole("button", { name: "Повернути" }).click()
    await expect(form.getByText(/Разом: 100/)).toBeVisible()

    await form.getByRole("button", { name: "Вилучити: Частина 2" }).click()
    await form.getByLabel("Відсоток").fill("100")
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(form).toBeHidden()
    await expect(
      rowOf(page, "Половина наперед, решта після поставки"),
    ).toContainText("100% у день рахунку")
  })

  test("остання частина не вилучається: кнопка неактивна", async ({ page }) => {
    await openWith(page, {}, TERMS)
    await page.getByRole("button", { name: "Додати умови" }).click()
    const form = dialog(page, "Нові умови оплати")
    await expect(
      form.getByRole("button", { name: "Вилучити: Частина 1" }),
    ).toHaveAttribute("aria-disabled", "true")
  })

  test("вимкнення: рядок лишається, фокус на кнопці, «Скасувати» в тості вмикає", async ({
    page,
  }) => {
    await openWith(page, {}, TAGS)
    const row = rowOf(page, "Терміново")
    await row.getByRole("button", { name: "Вимкнути: Терміново" }).click()
    await expect(row).toContainText("Вимкнене")
    await expect(
      row.getByRole("button", { name: "Увімкнути: Терміново" }),
    ).toBeFocused()
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Вимкнено: Терміново" })
      .getByRole("button", { name: "Скасувати" })
      .click()
    await expect(row).toContainText("Активне")
  })

  test("фільтр «Активне»: вимкнений рядок зникає, фокус на заголовку", async ({
    page,
  }) => {
    await openWith(page, {}, `${UNITS}?active=true`)
    await page.getByRole("button", { name: "Вимкнути: Літр" }).click()
    await expect(rowOf(page, "Літр")).toHaveCount(0)
    await expect(heading(page)).toBeFocused()
  })

  test("теги: колір у формі й вигляд у списку", async ({ page }) => {
    await openWith(page, {}, TAGS)
    await page.getByRole("button", { name: "Додати тег" }).click()
    const form = dialog(page, "Новий тег")
    await form.getByLabel("Назва").fill("Партнер")
    await combo(page, "Колір").click()
    await page.getByRole("option", { name: "Зелений" }).click()
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(form).toBeHidden()
    await expect(
      rowOf(page, "Партнер").locator('[data-slot="badge"]').first(),
    ).toHaveText("Партнер")
  })

  test("причини: вид проекту, фільтр у адресі, коментар", async ({ page }) => {
    await openWith(page, {}, REASONS)
    await page.getByRole("button", { name: "Додати причину" }).click()
    const form = dialog(page, "Нова причина")
    await form.getByLabel("Назва").fill("Прострочений товар")
    await combo(page, "Де застосовується").click()
    await page.getByRole("option", { name: "Списання" }).click()
    await form.getByRole("checkbox", { name: "Вимагати коментар" }).check()
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(form).toBeHidden()
    const row = rowOf(page, "Прострочений товар")
    await expect(row).toContainText("Списання")
    await expect(row).toContainText("Так")

    await page.goto(`${REASONS}?kind=write-off`)
    await page.reload()
    await expect(rowOf(page, "Брак товару")).toHaveCount(0)
  })

  test("без права змінювати: «Додати» з причиною, назва текстом, дій у рядках немає", async ({
    page,
  }) => {
    await openWith(page, {}, TAXES, { user: USERS.sales })
    const denied = page.getByRole("button", { name: "Додати податок" })
    await expect(denied).toHaveAttribute("aria-disabled", "true")
    await expect(denied).toHaveAccessibleDescription(
      "Немає права додавати податки",
    )
    await expect(rowOf(page, "ПДВ 20%")).toBeVisible()
    await expect(page.getByRole("button", { name: /^Змінити:/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Вимкнути:/ })).toHaveCount(
      0,
    )
  })

  test("англійською: заголовки й частини оплати", async ({ page }) => {
    await openWith(page, { language: "en" }, TERMS)
    await expect(heading(page)).toHaveText("Payment terms")
    await expect(rowOf(page, "Відстрочка 30 днів")).toContainText(
      "100% 30 days after delivery",
    )
  })

  for (const { scenario, text } of [
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
  ])
    test(`список: ${scenario}`, async ({ page }) => {
      await openWith(page, {}, TAXES)
      await chooseScenario(page, scenario)
      await page.getByRole("link", { name: "Теги" }).first().click()
      await expect(page.getByText(text).first()).toBeVisible()
    })

  test("список: порожньо вперше", async ({ page }) => {
    await openWith(page, {}, TAXES)
    await chooseScenario(page, "Порожньо")
    await page.getByRole("link", { name: "Теги" }).first().click()
    await expect(
      page.getByRole("heading", { name: "Тегів ще немає" }),
    ).toBeVisible()
  })

  test("список: повільно, скелетон, потім дані", async ({ page }) => {
    await openWith(page, {}, TAXES)
    await chooseScenario(page, "Повільно (3 с)")
    await page.getByRole("link", { name: "Теги" }).first().click()
    await expect(rowOf(page, "Терміново")).toBeVisible({ timeout: 10_000 })
  })
})

test.describe("модуль A6: типові значення", () => {
  test("панель показує зміни, збереження, значення лишається після перезавантаження", async ({
    page,
  }) => {
    await openWith(page, {}, DEFAULTS)
    await expect(heading(page)).toHaveText("Типові значення")
    await expect(barState(page)).toHaveText("Змін немає")
    const unit = combo(page, "Типова одиниця виміру")
    await expect(unit).toContainText("Штука")

    await unit.click()
    await page.getByRole("option", { name: "Кілограм" }).click()
    await expect(barState(page)).toHaveText("Є незбережені зміни")
    await saveBar(page).getByRole("button", { name: "Зберегти" }).click()
    await expect(page.getByText("Типові значення збережено")).toBeVisible()
    await expect(barState(page)).toHaveText("Змін немає")

    await page.getByRole("link", { name: "Теги" }).first().click()
    await expect(heading(page)).toHaveText("Теги")
    await page.getByRole("link", { name: "Типові значення" }).first().click()
    await expect(combo(page, "Типова одиниця виміру")).toContainText("Кілограм")
  })

  test("без змін: «Зберегти» не вимкнено, запиту немає", async ({ page }) => {
    await openWith(page, {}, DEFAULTS)
    let patches = 0
    page.on("request", (request) => {
      if (request.method() === "PATCH") patches += 1
    })
    await expect(barState(page)).toHaveText("Змін немає")
    await saveBar(page).getByRole("button", { name: "Зберегти" }).click()
    await expect(page.getByText("Змін немає").last()).toBeVisible()
    expect(patches).toBe(0)
  })

  test("«Скасувати зміни» питає й повертає збережене", async ({ page }) => {
    await openWith(page, {}, DEFAULTS)
    const unit = combo(page, "Типова одиниця виміру")
    await unit.click()
    await page.getByRole("option", { name: "Метр" }).click()
    const discard = saveBar(page).getByRole("button", {
      name: "Скасувати зміни",
    })
    // Клавіатурою: мишею кнопка фокус не бере (`keepFieldFocus`).
    await discard.focus()
    await page.keyboard.press("Enter")
    const confirm = page.getByRole("alertdialog", { name: "Скасувати зміни?" })
    await confirm.getByRole("button", { name: "Скасувати зміни" }).click()
    await expect(unit).toContainText("Штука")
    await expect(barState(page)).toHaveText("Змін немає")
    await expect(discard).toBeFocused()
  })

  test("незбережені зміни: перехід питає", async ({ page }) => {
    await openWith(page, {}, DEFAULTS)
    await combo(page, "Типова одиниця виміру").click()
    await page.getByRole("option", { name: "Метр" }).click()
    await page.getByRole("link", { name: "Теги" }).first().click()
    await expect(
      page.getByRole("alertdialog", { name: "Вийти без збереження?" }),
    ).toBeVisible()
  })

  test("типове значення: позначка в рядку, вимкнення питає, відмова нічого не змінює", async ({
    page,
  }) => {
    await openWith(page, {}, UNITS)
    await expect(rowOf(page, "Штука")).toContainText("Типове")
    await expect(rowOf(page, "Метр")).not.toContainText("Типове")
    const disable = page.getByRole("button", { name: "Вимкнути: Штука" })
    await disable.click()
    await expect(confirmDefault(page)).toContainText(
      "Штука перестане підставлятись",
    )
    await expectNoA11yViolations(page)
    await confirmDefault(page)
      .getByRole("button", { name: "Скасувати" })
      .click()
    await expect(confirmDefault(page)).toBeHidden()
    await expect(rowOf(page, "Штука")).toContainText("Активне")
    await expect(disable).toBeFocused()
    await disableDefault(page, "Штука")
    await expect(rowOf(page, "Штука")).toContainText("Вимкнене")
    await expect(rowOf(page, "Штука")).not.toContainText("Типове")
  })

  test("звичайне значення вимикається без питання", async ({ page }) => {
    await openWith(page, {}, UNITS)
    await page.getByRole("button", { name: "Вимкнути: Метр" }).click()
    await expect(rowOf(page, "Метр")).toContainText("Вимкнене")
    await expect(confirmDefault(page)).toHaveCount(0)
  })

  test("вибір лише з активних; вимкнене перестає бути типовим", async ({
    page,
  }) => {
    await openWith(page, {}, UNITS)
    await disableDefault(page, "Штука")
    await expect(rowOf(page, "Штука")).toContainText("Вимкнене")
    await page.getByRole("link", { name: "Типові значення" }).first().click()
    await expect(heading(page)).toHaveText("Типові значення")
    const unit = combo(page, "Типова одиниця виміру")
    await expect(unit).toContainText("Не вибрано")
    await unit.click()
    await expect(page.getByRole("option", { name: "Кілограм" })).toBeVisible()
    await expect(page.getByRole("option", { name: "Штука" })).toHaveCount(0)
  })

  test("значення вимкнули, коли типові вже відкривали: форма бере свіжий запис, збереження без конфлікту", async ({
    page,
  }) => {
    await openWith(page, {}, DEFAULTS)
    await expect(combo(page, "Типова одиниця виміру")).toContainText("Штука")
    await page.getByRole("link", { name: "Одиниці виміру" }).first().click()
    await disableDefault(page, "Штука")
    await expect(rowOf(page, "Штука")).toContainText("Вимкнене")
    await page.getByRole("link", { name: "Типові значення" }).first().click()
    await expect(combo(page, "Типова одиниця виміру")).toContainText(
      "Не вибрано",
    )
    await expect(barState(page)).toHaveText("Змін немає")
    await combo(page, "Типова одиниця виміру").click()
    await page.getByRole("option", { name: "Метр" }).click()
    await saveBar(page).getByRole("button", { name: "Зберегти" }).click()
    await expect(page.getByText("Типові значення збережено")).toBeVisible()
    await expect(
      dialog(page, "Запис змінив інший користувач"),
    ).not.toBeVisible()
  })

  test("«Скасувати» діє, поки йде запит до іншого значення", async ({
    page,
  }) => {
    await openWith(page, {}, UNITS)
    await page.getByRole("button", { name: "Вимкнути: Метр" }).click()
    await expect(rowOf(page, "Метр")).toContainText("Вимкнене")
    await chooseScenario(page, "Повільно (3 с)")
    await page.getByRole("button", { name: "Вимкнути: Кілограм" }).click()
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Вимкнено: Метр" })
      .getByRole("button", { name: "Скасувати" })
      .click()
    await expect(rowOf(page, "Метр")).not.toContainText("Вимкнене", {
      timeout: 15_000,
    })
    await expect(rowOf(page, "Кілограм")).toContainText("Вимкнене")
  })

  test("«Скасувати» діє, поки перечитується список", async ({ page }) => {
    await openWith(page, {}, UNITS)
    await chooseScenario(page, "Повільно (3 с)")
    await page.getByRole("button", { name: "Вимкнути: Метр" }).click()
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Вимкнено: Метр" })
      .getByRole("button", { name: "Скасувати" })
      .click({ timeout: 10_000 })
    await expect(
      page.getByRole("button", { name: "Вимкнути: Метр" }),
    ).toBeVisible({ timeout: 20_000 })
  })

  test("«Скасувати» не вдалось: повідомлення каже, що саме", async ({
    page,
  }) => {
    await openWith(page, {}, UNITS)
    await page.getByRole("button", { name: "Вимкнути: Метр" }).click()
    await expect(rowOf(page, "Метр")).toContainText("Вимкнене")
    await chooseScenario(page, "Помилка сервера")
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Вимкнено: Метр" })
      .getByRole("button", { name: "Скасувати" })
      .click()
    await expect(page.getByText(/Не вдалося ввімкнути Метр/)).toBeVisible()
  })

  test("«Скасувати зміни» прибирає помилку збереження", async ({ page }) => {
    await openWith(page, {}, DEFAULTS)
    await combo(page, "Типова одиниця виміру").click()
    await page.getByRole("option", { name: "Метр" }).click()
    await chooseScenario(page, "Помилка сервера")
    await saveBar(page).getByRole("button", { name: "Зберегти" }).click()
    const form = page.locator('[data-slot="record-form-page"]')
    await expect(form.getByRole("alert")).toBeVisible()
    await saveBar(page).getByRole("button", { name: "Скасувати зміни" }).click()
    await page
      .getByRole("alertdialog", { name: "Скасувати зміни?" })
      .getByRole("button", { name: "Скасувати зміни" })
      .click()
    await expect(barState(page)).toHaveText("Змін немає")
    await expect(form.getByRole("alert")).toHaveCount(0)
  })

  test("конфлікт: порівняння, «Взяти збережене»", async ({ page }) => {
    await openWith(page, {}, DEFAULTS)
    await chooseScenario(page, "Конфлікт збереження")
    await combo(page, "Типова одиниця виміру").click()
    await page.getByRole("option", { name: "Метр" }).click()
    await saveBar(page).getByRole("button", { name: "Зберегти" }).click()
    const conflict = dialog(page, "Запис змінив інший користувач")
    await expect(
      conflict.getByRole("row", { name: /Типова одиниця виміру/ }),
    ).toBeVisible()
    await conflict.getByRole("button", { name: "Взяти збережене" }).click()
    await expect(barState(page)).toHaveText("Змін немає")
    await expect(combo(page, "Типова одиниця виміру")).toContainText("Штука")
  })

  test("збій збереження: помилка над формою, зміни лишаються", async ({
    page,
  }) => {
    await openWith(page, {}, DEFAULTS)
    await combo(page, "Типова одиниця виміру").click()
    await page.getByRole("option", { name: "Метр" }).click()
    await chooseScenario(page, "Помилка сервера")
    await saveBar(page).getByRole("button", { name: "Зберегти" }).click()
    await expect(page.getByRole("alert").first()).toBeVisible()
    await expect(barState(page)).toHaveText("Є незбережені зміни")
    await expect(combo(page, "Типова одиниця виміру")).toContainText("Метр")
  })

  test("без права змінювати: поля для читання, панелі немає", async ({
    page,
  }) => {
    await openWith(page, {}, DEFAULTS, { user: USERS.sales })
    await expect(page.getByText("Змінювати типові значення може")).toBeVisible()
    await expect(saveBar(page)).toHaveCount(0)
    await expect(page.getByLabel("Типовий податок")).toHaveAttribute(
      "readonly",
      "",
    )
  })

  for (const { scenario, text } of [
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
  ])
    test(`стан сторінки: ${scenario}`, async ({ page }) => {
      await openWith(page, {}, "/#/m/A6/taxes")
      await chooseScenario(page, scenario)
      await page.getByRole("link", { name: "Типові значення" }).first().click()
      await expect(page.getByText(text).first()).toBeVisible()
    })
})

test.describe("модуль A6: доступність і телефон", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`axe: список, форма з рядками, типові значення (${theme})`, async ({
      page,
    }) => {
      await openWith(page, { theme }, TERMS)
      await expectNoA11yViolations(page)
      await page
        .getByRole("button", {
          name: "Змінити: Половина наперед, решта після поставки",
        })
        .click()
      await expect(dialog(page, "Зміна умов оплати")).toBeVisible()
      await expectNoA11yViolations(page)
      await openWith(page, { theme }, DEFAULTS)
      await expect(barState(page)).toBeVisible()
      await expectNoA11yViolations(page)
    })
  }

  test("360 px: список картками, форма без горизонтальної прокрутки", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openWith(page, {}, TERMS)
    await expectNoHorizontalScroll(page)
    await page.getByRole("button", { name: "Додати умови" }).click()
    const form = dialog(page, "Нові умови оплати")
    await form.getByRole("button", { name: "Додати частину" }).click()
    await form.getByRole("button", { name: "Додати код" }).click()
    await expectNoHorizontalScroll(page)
    const second = form.getByRole("group", { name: "Частина 2" })
    // Вузький контейнер: підпис над кожним полем.
    await expect(second.getByText("Відсоток", { exact: true })).toBeVisible()
  })

  test("широкий діалог: підписи лише над першим рядком, для скрінрідера — всюди", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, TERMS)
    await page
      .getByRole("button", {
        name: "Змінити: Половина наперед, решта після поставки",
      })
      .click()
    const form = dialog(page, "Зміна умов оплати")
    const first = form.getByRole("group", { name: "Частина 1" })
    const second = form.getByRole("group", { name: "Частина 2" })
    const box = async (scope: typeof first) =>
      (await scope.getByText("Відсоток", { exact: true }).boundingBox())?.height
    expect(await box(first)).toBeGreaterThan(10)
    expect(await box(second)).toBeLessThanOrEqual(1)
    await expect(second.getByLabel("Відсоток")).toBeVisible()
    // Кнопки першого рядка стоять на рівні полів, а не підписів.
    const field = await first.getByLabel("Відсоток").boundingBox()
    const action = await first
      .getByRole("button", { name: "Вилучити: Частина 1" })
      .boundingBox()
    expect(field && action && Math.abs(field.y - action.y)).toBeLessThan(6)
  })
})
