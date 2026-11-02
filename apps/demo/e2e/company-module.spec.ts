import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль A1 «Компанія й валюти» на місці заглушки `/m/A1` (ADR-0043) з розширенням проекту
 * (`src/extensions/A1-company.ts`): поле курсу «Примітка». У компанії бухгалтерки чотири валюти: USD
 * і EUR із курсами НБУ, PLN вручну, GBP вимкнена. Базова валюта — UAH.
 */
const MODULE = "/#/m/A1"
const COMPANY = "/#/m/A1/company"
const CURRENCIES = "/#/m/A1/currencies"
const RATES = "/#/m/A1/exchange-rates"

const grid = (page: Page, name: string) =>
  page.getByRole("grid", { name, exact: true })
const rows = (page: Page, name: string) =>
  grid(page, name).locator('[role="row"][data-index]')
const rowWith = (page: Page, name: string, text: string | RegExp) =>
  rows(page, name).filter({ hasText: text })
const companyTab = (page: Page, name: string) =>
  page
    .getByRole("tablist", { name: "Розділи компанії" })
    .getByRole("tab", { name, exact: true })
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()
const choose = async (page: Page, label: string, option: string | RegExp) => {
  await page.getByRole("combobox", { name: label }).click()
  await page.getByRole("option", { name: option }).click()
}

test.describe("A1: картка компанії", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("адреса модуля веде на картку: шапка, вкладки, історія збоку", async ({
    page,
  }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/A1\/company$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Зоряна логістика",
    )
    await expect(page.getByText("32855961").first()).toBeVisible()
    for (const tab of [
      "Реквізити",
      "Логотип і печатка",
      "Філії",
      "Локалізація",
    ])
      await expect(companyTab(page, tab)).toBeVisible()
    await expect(page.getByRole("heading", { name: "Історія" })).toBeVisible()
  })

  test("локалізація зберігається, вкладка в адресі, зміна видна після перезавантаження", async ({
    page,
  }) => {
    await openWith(page, {}, COMPANY)
    await companyTab(page, "Локалізація").click()
    await expect(page).toHaveURL(/tab=locale/)
    await choose(page, "Початок фінансового року", "Квітень")
    await page.getByRole("button", { name: "Зберегти локалізацію" }).click()
    await expect(toast(page, "Локалізацію збережено")).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole("combobox", { name: "Початок фінансового року" }),
    ).toHaveText(/Квітень/)
  })

  test("конфлікт збереження: повідомлення, введене лишається, повтор зберігає", async ({
    page,
  }) => {
    await openWith(page, {}, `${COMPANY}?tab=locale`)
    await chooseScenario(page, "Конфлікт збереження")
    await choose(page, "Мова документів", "English")
    await page.getByRole("button", { name: "Зберегти локалізацію" }).click()
    await expect(page.getByRole("alert").first()).toBeVisible()
    await expect(
      page.getByRole("combobox", { name: "Мова документів" }),
    ).toHaveText(/English/)
    await page.getByRole("button", { name: "Зберегти локалізацію" }).click()
    await expect(toast(page, "Локалізацію збережено")).toBeVisible()
  })

  test("без права змінювати — значення текстом, без полів", async ({
    page,
  }) => {
    await openWith(page, {}, `${COMPANY}?tab=locale`, { user: USERS.sales })
    await expect(page.getByText("Змінювати локалізацію може той")).toBeVisible()
    await expect(page.getByText("UAH · ")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Зберегти локалізацію" }),
    ).toBeHidden()
  })

  test("без `audit:read` історії немає", async ({ page }) => {
    await openWith(page, {}, COMPANY, { user: USERS.sales })
    await expect(companyTab(page, "Реквізити")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Історія" })).toBeHidden()
  })
})

test.describe("A1: валюти", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("список: базова в заголовку, стан, курс, посилання на курси валюти", async ({
    page,
  }) => {
    await openWith(page, {}, CURRENCIES)
    await expect(page.getByText("Базова валюта: UAH.")).toBeVisible()
    await expect(rows(page, "Валюти компанії")).toHaveCount(4)
    await expect(rowWith(page, "Валюти компанії", "GBP")).toContainText(
      "Вимкнена",
    )
    await expect(rowWith(page, "Валюти компанії", "GBP")).toContainText(
      "Курсу ще немає",
    )
    await rowWith(page, "Валюти компанії", "USD")
      .getByRole("link", { name: "USD" })
      .click()
    await expect(page).toHaveURL(/#\/m\/A1\/exchange-rates\?currency=USD/)
    await expect(rows(page, "Курси валют").first()).toContainText("USD")
    await expect(rowWith(page, "Курси валют", "EUR")).toHaveCount(0)
  })

  test("додати валюту: зайнятих кодів і базової у виборі немає, новий рядок у списку", async ({
    page,
  }) => {
    await openWith(page, {}, CURRENCIES)
    await page.getByRole("button", { name: "Додати валюту" }).click()
    const dialog = page.getByRole("dialog", { name: "Нова валюта" })
    await dialog.getByRole("combobox", { name: "Валюта" }).click()
    await page.getByRole("combobox", { name: "Валюта" }).fill("USD")
    await expect(page.getByRole("option", { name: /USD/ })).toHaveCount(0)
    await page.getByRole("combobox", { name: "Валюта" }).fill("CHF")
    await page.getByRole("option", { name: /CHF/ }).click()
    await dialog.getByRole("button", { name: "Додати валюту" }).click()
    await expect(toast(page, "Валюту CHF додано")).toBeVisible()
    await expect(rowWith(page, "Валюти компанії", "CHF")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Додати валюту" }),
    ).toBeFocused()
  })

  test("вимкнути й увімкнути; вимкненої немає у формі курсу", async ({
    page,
  }) => {
    await openWith(page, {}, CURRENCIES)
    const pln = rowWith(page, "Валюти компанії", "PLN")
    await pln.getByRole("button", { name: "Вимкнути PLN" }).click()
    await expect(toast(page, "Валюту PLN вимкнено")).toBeVisible()
    await expect(pln).toContainText("Вимкнена")
    await page.goto(RATES)
    await page.getByRole("button", { name: "Додати курс" }).click()
    const dialog = page.getByRole("dialog", { name: "Новий курс" })
    await dialog.getByRole("combobox", { name: "Валюта" }).click()
    await expect(page.getByRole("option", { name: "PLN" })).toHaveCount(0)
    await expect(page.getByRole("option", { name: "USD" })).toBeVisible()
  })

  test("без права — кнопка з причиною, без дій у рядках", async ({ page }) => {
    await openWith(page, {}, CURRENCIES, { user: USERS.sales })
    await expect(rows(page, "Валюти компанії")).toHaveCount(4)
    await expect(page.getByRole("button", { name: /Вимкнути/ })).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Додати валюту" }),
    ).toHaveAttribute("aria-disabled", "true")
  })
})

test.describe("A1: курси", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("новіші згори, джерело видно, фільтр за джерелом", async ({ page }) => {
    await openWith(page, {}, RATES)
    await expect(page.getByText(/Скільки UAH коштує/)).toBeVisible()
    await expect(rows(page, "Курси валют").first()).toBeVisible()
    await openWith(page, {}, `${RATES}?source=manual`)
    await expect(rows(page, "Курси валют").first()).toContainText("Вручну")
    await expect(rowWith(page, "Курси валют", "НБУ")).toHaveCount(0)
  })

  test("курс із НБУ лише для перегляду: причина на обох кнопках", async ({
    page,
  }) => {
    await openWith(page, {}, `${RATES}?currency=USD`)
    const row = rows(page, "Курси валют").first()
    await expect(row.getByRole("button", { name: /Змінити/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    await expect(row.getByRole("button", { name: /Видалити/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    await row.getByRole("button", { name: /Змінити/ }).hover()
    await expect(
      page.getByText("Курс із джерела «НБУ» оновлює сервер").first(),
    ).toBeVisible()
  })

  test("новий курс із полем розширення; вже зайнята дата — помилка біля дати", async ({
    page,
  }) => {
    await openWith(page, {}, `${RATES}?currency=PLN`)
    await page.getByRole("button", { name: "Додати курс" }).click()
    const dialog = page.getByRole("dialog", { name: "Новий курс" })
    await choose(page, "Валюта", "PLN")
    await dialog.getByLabel(/^Курс:/).fill("11,25")
    await dialog.getByLabel("Примітка").fill("Договір 7")
    await dialog.getByRole("button", { name: "Створити" }).click()
    await expect(dialog.locator('[data-slot="field-error"]')).toHaveText(
      "Таке значення вже є в іншого запису",
    )
    const date = dialog.getByRole("textbox", { name: "Дата" })
    await expect(date).toHaveAttribute("aria-invalid", "true")
    // Нова дата знімає помилку: курс стає першим рядком разом із полем розширення.
    // Пояс браузера з конфігурації: раннер у UTC ввечері бачив би завтрашню дату як сьогоднішню в Києві.
    await date.fill(
      new Date(Date.now() + 86_400_000).toLocaleDateString("uk-UA", {
        timeZone: "Europe/Kyiv",
      }),
    )
    await dialog.getByRole("button", { name: "Створити" }).click()
    await expect(toast(page, "Курс PLN додано")).toBeVisible()
    await expect(rows(page, "Курси валют").first()).toContainText("Договір 7")
  })

  test.describe("після півночі за Києвом", () => {
    test.use({ timezoneId: "Europe/Kyiv" })

    test("зайнята дата та сама, що у формі: у UTC ще вчора", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-10-30T22:30:00Z"))
      await openWith(page, {}, RATES)
      await page.getByRole("button", { name: "Додати курс" }).click()
      const dialog = page.getByRole("dialog", { name: "Новий курс" })
      await dialog.getByLabel(/^Курс:/).fill("41,25")
      await dialog.getByRole("button", { name: "Створити" }).click()
      await expect(dialog.locator('[data-slot="field-error"]')).toHaveText(
        "Таке значення вже є в іншого запису",
      )
    })
  })

  test("зміна й видалення ручного курсу: підтвердження, найновіший курс валюти оновлено", async ({
    page,
  }) => {
    await openWith(page, {}, `${RATES}?currency=PLN`)
    const first = rows(page, "Курси валют").first()
    await first.getByRole("button", { name: /Змінити/ }).click()
    const dialog = page.getByRole("dialog", { name: "Зміна курсу" })
    await dialog.getByLabel(/^Курс:/).fill("12")
    await dialog.getByRole("button", { name: "Зберегти" }).click()
    await expect(toast(page, "Курс PLN збережено")).toBeVisible()
    await expect(first).toContainText("12,00")

    await first.getByRole("button", { name: /Видалити/ }).click()
    const confirm = page.getByRole("alertdialog")
    await confirm.getByRole("button", { name: "Видалити курс" }).click()
    await expect(toast(page, /видалено/)).toBeVisible()
    await expect(first).not.toContainText("12,00")
  })

  test("без права — кнопка з причиною, без дій у рядках", async ({ page }) => {
    await openWith(page, {}, RATES, { user: USERS.sales })
    await expect(rows(page, "Курси валют").first()).toBeVisible()
    await expect(
      rows(page, "Курси валют").first().getByRole("button"),
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Додати курс" }),
    ).toHaveAttribute("aria-disabled", "true")
  })

  test("англійською: заголовки й джерела", async ({ page }) => {
    await openWith(page, { language: "en" }, RATES)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Exchange rates",
    )
    await expect(rows(page, "Exchange rates").first()).toContainText("NBU")
  })
})

test.describe("A1: збої", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("збій профілю: не підставляємо типову валюту, повтор повертає сторінку", async ({
    page,
  }) => {
    await openWith(page, {}, CURRENCIES)
    await expect(rows(page, "Валюти компанії")).toHaveCount(4)
    await chooseScenario(page, "Помилка сервера")
    await page.reload()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Валюти")
    await expect(page.getByText(/Базова валюта/)).toHaveCount(0)
    await expect(grid(page, "Валюти компанії")).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Додати валюту" }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(
      page.getByRole("button", { name: "Спробувати ще" }),
    ).toBeVisible()
    await chooseScenario(page, "Успіх")
    await expect(page.getByText("Базова валюта: UAH.")).toBeVisible()
    await expect(rows(page, "Валюти компанії")).toHaveCount(4)
  })

  test("збій довідника валют: причина на кнопці, а не «спершу додайте валюту»", async ({
    page,
  }) => {
    await openWith(page, {}, RATES)
    await chooseScenario(page, "Помилка сервера")
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Додати курс" }),
    ).toHaveAttribute("aria-disabled", "true")
    await page.getByRole("button", { name: "Додати курс" }).hover()
    await expect(
      page.getByText("Не вдалося отримати перелік валют").first(),
    ).toBeVisible()
    await expect(page.getByText("Спершу додайте валюту")).toHaveCount(0)
  })

  test("після видалення курсу фокус не губиться", async ({ page }) => {
    await openWith(page, {}, `${RATES}?currency=PLN`)
    await rows(page, "Курси валют")
      .first()
      .getByRole("button", { name: /Видалити/ })
      .click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Видалити курс" })
      .click()
    await expect(toast(page, /видалено/)).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
  })

  test("збереження без змін не шле запит", async ({ page }) => {
    await openWith(page, {}, `${COMPANY}?tab=locale`)
    await page.getByRole("button", { name: "Зберегти локалізацію" }).click()
    await expect(toast(page, "Змін немає, зберігати нічого")).toBeVisible()
  })
})

test.describe("A1: адаптив і доступність", () => {
  for (const [width, height] of [
    [360, 740],
    [768, 1024],
    [1440, 900],
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${String(width)} px, ${theme}: axe, без горизонтальної прокрутки`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ colorScheme: theme })
        for (const path of [
          COMPANY,
          `${COMPANY}?tab=locale`,
          CURRENCIES,
          RATES,
        ]) {
          await openWith(page, { theme }, path)
          await expectNoHorizontalScroll(page)
          await expectNoA11yViolations(page)
        }
        await page.getByRole("button", { name: "Додати курс" }).click()
        await expect(
          page.getByRole("dialog", { name: "Новий курс" }),
        ).toBeVisible()
        await expectNoA11yViolations(page)
      })
    }
  }
})
