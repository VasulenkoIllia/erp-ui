import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок 1.4b1 (ADR-0026): форми модуля B1 у діалозі з полями розширення проекту
 * (`src/extensions/B1-contacts.ts`): прапорець «Платник ПДВ» після коду, підказка поля «Місто» і
 * назва колонки «Місто клієнта» без заміни (`change`), «Зручний канал» у формі контакту. Створення
 * організації просто з вибору в формі контакту («Створити…»), конфлікт із полем розширення.
 */
const CONTACTS = "/#/m/B1/contacts"
const ORGANIZATIONS = "/#/m/B1/organizations"
/** Юрособа з фікстур (ЄДРПОУ, «Платник ПДВ» — так). */
const LEGAL_CARD = "/#/m/B1/organizations/org-013"
/** Правильний ЄДРПОУ (контрольна цифра збігається), якого немає в фікстурах. */
const NEW_CODE = "12345678"
/** Лінивий чанк форми організації (ADR-0009, ADR-0026). */
const ORGANIZATION_FORM_CHUNK = /\/organization-form-[\w-]+\.js$/

const dialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true })
const headerValue = (page: Page, label: string) =>
  page
    .locator("header dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
const errorSummary = (page: Page) =>
  page.locator('[data-slot="form-error-summary"]')

test.describe("B1: форми", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("нова організація: поле розширення у формі, помилки біля полів, після створення — картка з фокусом на назві", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS)
    await expect(
      page.getByRole("columnheader", { name: "Місто клієнта" }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Створити організацію" }).click()
    const form = dialog(page, "Нова організація")
    const name = form.getByRole("textbox", { name: "Назва" })
    await expect(name).toBeFocused()
    // Поле розширення — одразу після коду; підказка поля модуля — від розширення.
    const order = await form
      .locator("[data-field-name]")
      .evaluateAll((fields) =>
        fields.map((field) => field.getAttribute("data-field-name")),
      )
    expect(order).toEqual([
      "name",
      "type",
      "code",
      "vatPayer",
      "status",
      "phone",
      "email",
      "city",
      "segments",
    ])
    await expect(
      form.getByRole("textbox", { name: "Місто" }),
    ).toHaveAccessibleDescription(
      "Як у виписці з ЄДР: для рахунків і договорів.",
    )
    await expectNoA11yViolations(page)

    await form.getByRole("textbox", { name: "ЄДРПОУ" }).fill("12345679")
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(errorSummary(page)).toBeFocused()
    await expect(errorSummary(page)).toContainText("Виправте 2 помилки")
    await expect(
      form.getByRole("textbox", { name: "ЄДРПОУ" }),
    ).toHaveAccessibleDescription(/не збігається контрольна цифра/)

    await name.fill("ТОВ «Нова форма»")
    await form.getByRole("textbox", { name: "ЄДРПОУ" }).fill(NEW_CODE)
    await form.getByRole("checkbox", { name: "Платник ПДВ" }).click()
    await form.getByRole("textbox", { name: "Місто" }).fill("Полтава")
    await form.getByRole("button", { name: "Створити" }).click()

    await expect(page).toHaveURL(/#\/m\/B1\/organizations\/[\w-]+$/)
    const heading = page.getByRole("heading", { level: 1 })
    await expect(heading).toHaveText("ТОВ «Нова форма»")
    await expect(heading).toBeFocused()
    await expect(
      page.getByText("Організацію створено: ТОВ «Нова форма»"),
    ).toBeVisible()
    await expect(headerValue(page, "Платник ПДВ")).toHaveText("Так")
    await expect(headerValue(page, "Місто")).toHaveText("Полтава")
  })

  test("зміна з картки: конфлікт показує поле розширення, «Зберегти мої зміни» зберігає, фокус — на «Змінити»", async ({
    page,
  }) => {
    await openWith(page, {}, LEGAL_CARD)
    await expect(headerValue(page, "Платник ПДВ")).toHaveText("Так")
    await chooseScenario(page, "Конфлікт збереження")
    const edit = page.getByRole("button", { name: "Змінити", exact: true })
    await edit.click()
    const form = dialog(page, "Змінити організацію")
    await form.getByRole("checkbox", { name: "Платник ПДВ" }).click()
    await form.getByRole("button", { name: "Зберегти" }).click()

    const conflict = dialog(page, "Запис змінив інший користувач")
    await expect(
      conflict.getByRole("row", { name: /Платник ПДВ/ }),
    ).toContainText("Ні")
    await expectNoA11yViolations(page)
    await conflict.getByRole("button", { name: "Зберегти мої зміни" }).click()

    await expect(form).toBeHidden()
    await expect(page.getByText(/^Зміни збережено: /)).toBeVisible()
    await expect(edit).toBeFocused()
    await expect(headerValue(page, "Платник ПДВ")).toHaveText("Ні")
  })

  test("новий контакт: організацію створюють просто з вибору, поле розширення — вибір зі списку", async ({
    page,
  }) => {
    await openWith(page, {}, CONTACTS)
    await page.getByRole("button", { name: "Створити контакт" }).click()
    const form = dialog(page, "Новий контакт")
    await form.getByRole("textbox", { name: "Ім'я" }).fill("Оксана Тестова")
    const picker = form.getByRole("combobox", {
      name: "Організація",
      exact: true,
    })
    await picker.click()
    await page
      .getByRole("combobox", { name: "Пошук: Організація" })
      .fill("Світанок ПП")
    await page.getByRole("option", { name: "Створити «Світанок ПП»" }).click()

    const nested = dialog(page, "Нова організація")
    await expect(nested.getByRole("textbox", { name: "Назва" })).toHaveValue(
      "Світанок ПП",
    )
    await nested.getByRole("textbox", { name: "ЄДРПОУ" }).fill(NEW_CODE)
    await nested.getByRole("button", { name: "Створити" }).click()
    await expect(nested).toBeHidden()
    await expect(picker).toHaveText(/Світанок ПП/)
    await expect(picker).toBeFocused()

    const channel = form.getByRole("combobox", { name: "Зручний канал" })
    await expect(channel).toHaveAccessibleDescription(/зручніше отримувати/)
    await channel.click()
    await page.getByRole("option", { name: "Telegram" }).click()
    await form.getByRole("button", { name: "Створити" }).click()

    await expect(page).toHaveURL(/#\/m\/B1\/contacts\/[\w-]+$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Оксана Тестова",
    )
    await expect(headerValue(page, "Організація")).toHaveText("Світанок ПП")
    await expect(headerValue(page, "Зручний канал")).toHaveText("Telegram")
  })

  test("клавіатура: Esc зі зміненою формою питає, «Повернутися до форми» лишає введене, закриття повертає фокус", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS)
    const create = page.getByRole("button", { name: "Створити організацію" })
    await create.focus()
    await page.keyboard.press("Enter")
    const form = dialog(page, "Нова організація")
    // Форма — лінивим чанком: поки він вантажиться, у діалозі спінер (ADR-0026).
    await expect(form.getByRole("textbox", { name: "Назва" })).toBeFocused()
    await page.keyboard.type("ТОВ «Чернетка»")
    await page.keyboard.press("Escape")
    const confirm = page.getByRole("alertdialog", {
      name: "Закрити без збереження?",
    })
    await confirm.getByRole("button", { name: "Повернутися до форми" }).click()
    await expect(form.getByRole("textbox", { name: "Назва" })).toHaveValue(
      "ТОВ «Чернетка»",
    )
    await page.keyboard.press("Escape")
    await confirm
      .getByRole("button", { name: "Закрити без збереження" })
      .click()
    await expect(form).toBeHidden()
    await expect(create).toBeFocused()
  })

  test("форма не завантажилась — діалог із назвою, «Спробувати ще» вантажить її знову", async ({
    page,
  }) => {
    // Чанк форми блокуємо до відкриття сторінки: попереднє завантаження теж не вдається (ADR-0009).
    // Чанки йдуть через service worker MSW — перехоплюємо на рівні контексту.
    await page
      .context()
      .route(ORGANIZATION_FORM_CHUNK, (route) =>
        route.abort("internetdisconnected"),
      )
    await openWith(page, {}, ORGANIZATIONS)
    await page.getByRole("button", { name: "Створити організацію" }).click()
    const form = dialog(page, "Нова організація")
    const failure = form.getByRole("alert")
    await expect(failure).toContainText("Не вдалося завантажити")
    await page.context().unroute(ORGANIZATION_FORM_CHUNK)
    await failure.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(form.getByRole("textbox", { name: "Назва" })).toBeVisible()
  })

  test("без права: «Створити» і «Змінити» неактивні з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS, { user: USERS.sales })
    const create = page.getByRole("button", { name: "Створити організацію" })
    await expect(create).toHaveAttribute("aria-disabled", "true")
    await expect(create).toHaveAccessibleDescription(
      "Немає права створювати організації",
    )
    await page.goto(LEGAL_CARD)
    const edit = page.getByRole("button", { name: "Змінити", exact: true })
    await expect(edit).toHaveAttribute("aria-disabled", "true")
    await expect(edit).toHaveAccessibleDescription(
      "Немає права змінювати організації",
    )
    await expectNoA11yViolations(page)
  })
})

test.describe("B1: форми на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("форма в одну колонку без горизонтальної прокрутки, поля від 16px", async ({
    page,
  }) => {
    await openWith(page, {}, LEGAL_CARD)
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const form = dialog(page, "Змінити організацію")
    await expect(form.getByRole("textbox", { name: "Назва" })).toBeFocused()
    const layout = await form.evaluate((element) => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      widths: [...element.querySelectorAll("[data-field-name]")].map((field) =>
        Math.round(field.getBoundingClientRect().width),
      ),
      fontSize: getComputedStyle(element.querySelector("input")!).fontSize,
    }))
    expect(layout.overflow).toBeLessThanOrEqual(0)
    expect(new Set(layout.widths).size).toBe(1)
    expect(layout.fontSize).toBe("16px")
    await expectNoA11yViolations(page)
  })
})
