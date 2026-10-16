import { expect, test, type Page } from "@playwright/test"

import { USERS, expectNoA11yViolations, openWith } from "./helpers"

// Крок 1.3a (ADR-0023): вибір запису з пошуком на сервері (UI40) і значення з «Копіювати» (UI43).
const PATH = "/#/pickers"
const SCENARIOS_KEY = "erp-ui:mock-scenarios"

/** Розділ сторінки за заголовком h2. */
const section = (page: Page, title: string) =>
  page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { level: 2, name: title }) })

const contact = (page: Page) => section(page, "Контакт і компанія")
const companyField = (page: Page) =>
  contact(page).getByRole("combobox", { name: "Компанія" })
const search = (page: Page) =>
  page.getByRole("combobox", { name: "Пошук: Компанія" })

/** Сценарій моків лише для організацій — до завантаження сторінки. */
async function seedScenario(page: Page, scenario: string) {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value)
    },
    [
      SCENARIOS_KEY,
      JSON.stringify({
        global: "success",
        resources: { organizations: scenario },
      }),
    ] as const,
  )
}

test.describe("вибір і реквізити: axe", () => {
  for (const palette of ["sapphire", "graphite"] as const)
    for (const theme of ["light", "dark"] as const)
      test(`${palette} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await openWith(page, { palette, theme }, PATH)
        await expectNoA11yViolations(page)
      })

  for (const width of [360, 768] as const)
    for (const language of ["uk", "en"] as const)
      test(`${width}px ${language}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await openWith(page, { language }, PATH)
        await expectNoA11yViolations(page)
      })

  test("відкритий список і діалог створення", async ({ page }) => {
    await openWith(page, { theme: "dark" }, PATH)
    await companyField(page).click()
    await expect(
      page.getByText("Показано 20 з 31. Уточніть пошук."),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    await search(page).fill("Зоря")
    await page.getByRole("option", { name: "Створити «Зоря»" }).click()
    await expect(
      page.getByRole("dialog", { name: "Нова організація" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })
})

test.describe("вибір запису: поведінка", () => {
  test("пошук на сервері, вибір клавіатурою, перевірка форми", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    // Порожня форма: помилки біля полів.
    await contact(page)
      .getByRole("button", { name: "Зберегти контакт" })
      .click()
    await expect(companyField(page)).toHaveAttribute("aria-invalid", "true")
    await expect(companyField(page)).toHaveAccessibleDescription(
      "Виберіть компанію",
    )

    await companyField(page).focus()
    await page.keyboard.press("Enter")
    await expect(search(page)).toBeFocused()
    await search(page).pressSequentially("агро")
    // Варіанти — з сервера, за назвою; другий рядок — код і місто.
    await expect(page.getByRole("option")).toHaveText([
      /ПП «Агросвіт»ЄДРПОУ \d{8} · Львів/,
      /ТОВ «Буковина Агро»/,
      /ТОВ «Тернопіль Агрохім»/,
      "Створити «агро»",
    ])
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(companyField(page)).toHaveText("ТОВ «Буковина Агро»")
    await expect(companyField(page)).toBeFocused()
    await expect(companyField(page)).not.toHaveAttribute("aria-invalid")

    await contact(page)
      .getByRole("textbox", { name: "Ім'я та прізвище" })
      .fill("Ірина Шевченко")
    await contact(page)
      .getByRole("button", { name: "Зберегти контакт" })
      .click()
    await expect(contact(page).getByRole("status")).toHaveText(
      "Збережено: Ірина Шевченко, ТОВ «Буковина Агро»",
    )
  })

  test("«Створити…»: діалог з текстом пошуку, нова компанія — у полі, фокус на полі", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    await companyField(page).click()
    await search(page).fill("Нова Зоря")
    await page.getByRole("option", { name: "Створити «Нова Зоря»" }).click()
    const dialog = page.getByRole("dialog", { name: "Нова організація" })
    await expect(dialog.getByRole("textbox", { name: "Назва" })).toHaveValue(
      "Нова Зоря",
    )
    // Поле ще заповнюють: помилки «Виберіть компанію» немає. Поки діалог відкритий, сторінка
    // прихована від скрінрідера — поле знаходимо не за роллю.
    await expect(
      // Перше поле вибору на сторінці — «Компанія» контакту.
      page.locator("[data-slot=record-picker] > button").first(),
    ).not.toHaveAttribute("aria-invalid")
    const code = dialog.getByRole("textbox", { name: "ЄДРПОУ" })
    await code.fill("41234004")
    await dialog.getByRole("button", { name: "Створити" }).click()
    await expect(code).toHaveAttribute("aria-invalid", "true")
    await code.fill("41234003")
    await dialog.getByRole("button", { name: "Створити" }).click()
    await expect(dialog).toBeHidden()
    await expect(companyField(page)).toHaveText("Нова Зоря")
    await expect(companyField(page)).toBeFocused()

    // Нова компанія знаходиться пошуком.
    await companyField(page).click()
    await search(page).fill("Нова")
    await expect(page.getByRole("option", { name: /Нова Зоря/ })).toBeVisible()
  })

  test("телефон: нижня шторка, вибір закриває її", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWith(page, {}, PATH)
    await companyField(page).click()
    const sheet = page.getByRole("dialog", { name: "Компанія" })
    await expect(
      sheet.getByRole("combobox", { name: "Пошук: Компанія" }),
    ).toBeFocused()
    await expect(
      sheet.getByText("Показано 20 з 31. Уточніть пошук."),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    await sheet.getByRole("combobox").fill("карпат")
    await sheet.getByRole("option", { name: /Карпатська вода/ }).click()
    await expect(sheet).toBeHidden()
    await expect(companyField(page)).toHaveText("ТОВ «Карпатська вода»")
    await expect(companyField(page)).toBeFocused()
  })

  test("менеджер: «Створити» неактивне з причиною, список користувачів — немає доступу", async ({
    page,
  }) => {
    await openWith(page, {}, PATH, { user: USERS.sales })
    await companyField(page).click()
    const create = page.getByRole("option", { name: /Створити новий…/ })
    await expect(create).toHaveAttribute("aria-disabled", "true")
    await expect(create).toContainText(
      "Створювати організації може роль «Бухгалтер»",
    )
    await page.keyboard.press("Escape")

    await contact(page)
      .getByRole("combobox", { name: "Відповідальний" })
      .click()
    await expect(
      page.getByText("Немає доступу до списку", { exact: true }),
    ).toBeVisible()
  })

  test("стани поля: лише читання, вимкнено, запис видалили, очищення", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const states = section(page, "Стани поля")
    await expect(
      states.getByRole("textbox", { name: "Лише читання" }),
    ).toHaveAttribute("readonly")
    await expect(
      states.getByRole("textbox", { name: "Лише читання" }),
    ).toHaveValue("ПП «Агросвіт»")
    await expect(
      states.getByRole("combobox", { name: "Вимкнено" }),
    ).toBeDisabled()
    await expect(
      states.getByRole("combobox", { name: "Запис видалили" }),
    ).toHaveText("Запис не знайдено")
    const filled = states.getByRole("combobox", { name: "Заповнене" })
    await expect(filled).toHaveText("ТОВ «Дніпро Трейд»")
    await states.getByRole("button", { name: "Очистити: Заповнене" }).click()
    await expect(filled).toHaveText("Виберіть…")
    await expect(filled).toBeFocused()
  })
})

test.describe("вибір запису: стани списку", () => {
  test("помилка сервера — повтор після відновлення", async ({ page }) => {
    await openWith(page, {}, PATH)
    const list = section(page, "Стани списку")
    await list
      .getByRole("combobox", { name: "Сценарій списку організацій" })
      .click()
    await page.getByRole("option", { name: "Помилка сервера" }).click()
    await list.getByRole("combobox", { name: "Компанія" }).click()
    await expect(
      page.getByText("Не вдалося завантажити варіанти"),
    ).toBeVisible()
    await page.keyboard.press("Escape")

    await list
      .getByRole("combobox", { name: "Сценарій списку організацій" })
      .click()
    await page.getByRole("option", { name: "Звичайна робота" }).click()
    await list.getByRole("combobox", { name: "Компанія" }).click()
    await expect(page.getByRole("option").first()).toBeVisible()
  })

  for (const [scenario, text] of [
    ["empty", "Нічого не знайдено"],
    ["offline", "Немає з'єднання з сервером"],
    ["forbidden", "Немає доступу до списку"],
  ] as const)
    test(`${scenario}: «${text}»`, async ({ page }) => {
      await seedScenario(page, scenario)
      await openWith(page, {}, PATH)
      await companyField(page).click()
      await expect(page.getByText(text, { exact: true })).toBeVisible()
      // Порожній стан не підміняє помилку; «Створити» лишається.
      await expect(
        page.getByRole("option", { name: "Створити новий…" }),
      ).toBeVisible()
    })

  test("повільно: «Шукаємо…», потім варіанти; «Спробувати ще» повторює запит", async ({
    page,
  }) => {
    await seedScenario(page, "slow")
    await openWith(page, {}, PATH)
    await companyField(page).click()
    await expect(page.getByText("Шукаємо…")).toBeVisible()
    await expect(page.getByRole("option").first()).toBeVisible({
      timeout: 10_000,
    })
  })
})

test.describe("реквізити з «Копіювати»", () => {
  test("IBAN у буфер без пробілів, телефон і email — посилання", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await openWith(page, {}, PATH)
    const requisites = section(page, "Реквізити з «Копіювати»")
    await expect(
      requisites.getByText("UA21 3223 1300 0002 6007 2335 6600 1"),
    ).toBeVisible()
    await requisites.getByRole("button", { name: "Копіювати: IBAN" }).click()
    await expect(requisites.getByRole("status").nth(2)).toHaveText(
      "Скопійовано",
    )
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "UA213223130000026007233566001",
    )
    await expect(
      requisites.getByRole("link", { name: "+380 67 120 43 10" }),
    ).toHaveAttribute("href", "tel:+380671204310")
    await expect(
      requisites.getByRole("link", { name: "office@dnipro-treid.example" }),
    ).toHaveAttribute("href", "mailto:office@dnipro-treid.example")
    await expect(requisites.getByText("Не вказано")).toBeAttached()
  })
})
