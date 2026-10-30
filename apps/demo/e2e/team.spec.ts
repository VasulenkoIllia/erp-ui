import { expect, test, type Page } from "@playwright/test"

import {
  confirmWithPassword,
  expectNoA11yViolations,
  openWith,
  USERS,
} from "./helpers"

const ROLES = "/#/settings/roles"
const USERS_PAGE = "/#/settings/users"
const COMPANY = "/#/settings/company"

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

test.describe("ролі й права (ADR-0014)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("матриця: вбудована роль, частково, незбережені зміни, нова роль, видалення", async ({
    page,
  }) => {
    await openWith(page, {}, ROLES)
    const roles = page.getByRole("list", { name: "Ролі" })
    await expect(roles.getByRole("listitem")).toHaveCount(6)

    await roles.getByRole("button", { name: /Адміністратор/ }).click()
    await expect(
      page.getByText("Вбудовану роль змінити не можна"),
    ).toBeVisible()
    await expect(
      page.getByRole("checkbox", { name: "Зміна: Користувачі" }),
    ).toHaveAttribute("aria-readonly", "true")

    await roles.getByRole("button", { name: /Аудитор/ }).click()
    const allInvoices = page.getByRole("checkbox", { name: "Усе: Рахунки" })
    await expect(allInvoices).toHaveAttribute("aria-checked", "mixed")
    await expect(page.getByText("Дозволів: 2")).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole("checkbox", { name: "Експорт: Рахунки" }).check()
    await roles.getByRole("button", { name: /Бухгалтер/ }).click()
    const unsaved = page.getByRole("dialog", {
      name: "Зміни ролі «Аудитор» не збережено",
    })
    await unsaved.getByRole("button", { name: "Повернутися до ролі" }).click()
    await expect(page.getByText("Дозволів: 3")).toBeVisible()
    await allInvoices.check()
    await expect(page.getByText("Дозволів: 7")).toBeVisible()
    await page.getByRole("button", { name: "Зберегти", exact: true }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Роль збережено")).toBeVisible()

    await page.getByRole("button", { name: "Копіювати" }).click()
    const create = page.getByRole("dialog", { name: "Нова роль" })
    await expect(create.getByLabel("Назва")).toHaveValue("Аудитор (копія)")
    await create.getByLabel("Назва").fill("Бухгалтер")
    await create.getByRole("button", { name: "Нова роль" }).click()
    await expect(create.getByText("Роль з такою назвою вже є")).toBeVisible()
    await create.getByLabel("Назва").fill("Склад")
    await create.getByRole("button", { name: "Нова роль" }).click()
    await expect(toast(page, "Роль створено")).toBeVisible()
    await expect(roles.getByRole("listitem")).toHaveCount(7)
    await expect(roles.getByRole("button", { name: /Склад/ })).toHaveAttribute(
      "aria-current",
      "true",
    )
    await expect(allInvoices).toBeChecked()

    await page.getByRole("button", { name: "Видалити" }).click()
    await page
      .getByRole("dialog", { name: "Видалити роль «Склад»?" })
      .getByRole("button", { name: "Видалити" })
      .click()
    await expect(toast(page, "Роль видалено")).toBeVisible()
    await expect(roles.getByRole("listitem")).toHaveCount(6)
  })

  test("ролі користувача в панелі доступу: з підтвердженням, список оновлюється", async ({
    page,
  }) => {
    await openWith(page, {}, USERS_PAGE)
    const people = page.getByRole("list", { name: "Користувачі компанії" })
    await page.getByRole("button", { name: "Доступ: Іван Петренко" }).click()
    const sheet = page.getByRole("dialog", { name: "Доступ: Іван Петренко" })
    const roles = sheet.getByRole("group", { name: "Ролі" })
    await expect(
      roles.getByRole("checkbox", { name: "Менеджер з продажу" }),
    ).toBeChecked()
    const save = sheet.getByRole("button", { name: "Зберегти ролі" })
    await expect(save).toBeDisabled()
    await roles.getByRole("checkbox", { name: "Менеджер з продажу" }).uncheck()
    await save.click()
    await expect(sheet.getByText("Оберіть хоча б одну роль")).toBeVisible()
    await roles.getByRole("checkbox", { name: "Аудитор" }).check()
    await expectNoA11yViolations(page)
    await save.click()
    await confirmWithPassword(page)
    await expect(toast(page, "Ролі змінено")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(
      people.getByText("ivan@zoriana.example · Аудитор"),
    ).toBeVisible()

    // Лічильники ролей теж оновились: в «Аудитора» — четверо колег із фікстур A2 і Іван.
    await openWith(page, {}, ROLES)
    await expect(
      page
        .getByRole("list", { name: "Ролі" })
        .getByRole("listitem")
        .filter({ hasText: "Аудитор" }),
    ).toContainText("5 користувачів")
  })

  test("без права roles:read — сторінка заборонена", async ({ page }) => {
    await openWith(page, {}, ROLES, { user: USERS.sales })
    await expect(page.getByText("Немає доступу")).toBeVisible()
  })
})

test.describe("запрошення (ADR-0014)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("перевірки, лист, повтор, прийняття — той, хто запрошував, отримує сповіщення", async ({
    page,
  }) => {
    await openWith(page, {}, USERS_PAGE)
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    const send = dialog.getByRole("button", { name: "Надіслати запрошення" })
    await send.click()
    await expect(dialog.getByText("Заповніть це поле")).toBeVisible()
    await expect(dialog.getByText("Оберіть хоча б одну роль")).toBeVisible()
    await dialog.getByLabel("Email").fill("ivan@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Менеджер з продажу" }).check()
    await send.click()
    await expect(dialog.getByText("Ця людина вже в компанії")).toBeVisible()
    await dialog.getByLabel("Email").fill("olha@zoriana.example")
    await dialog.getByLabel("Ім'я (необов'язково)").fill("Ольга Коваленко")
    await expectNoA11yViolations(page)
    await send.click()
    await confirmWithPassword(page)
    await expect(
      toast(page, "Запрошення надіслано на olha@zoriana.example"),
    ).toBeVisible()

    const list = page.getByRole("list", { name: "Запрошення" })
    await expect(list.getByRole("listitem")).toHaveCount(1)
    await expect(
      list.getByText("Ольга Коваленко · olha@zoriana.example"),
    ).toBeVisible()
    await expect(list.getByText("Менеджер з продажу")).toBeVisible()
    await page
      .getByRole("button", {
        name: "Надіслати ще раз: olha@zoriana.example",
      })
      .click()
    await expect(
      toast(page, "Забагато запитів. Спробуйте за хвилину"),
    ).toBeVisible()

    // Колега відкриває посилання з листа (мок показує лист сповіщенням).
    await toast(page, "Лист на olha@zoriana.example")
      .getByRole("button", { name: "Відкрити посилання з листа" })
      .click()
    await expect(
      page.getByRole("heading", {
        name: "Приєднатися до ТОВ «Зоряна логістика»",
      }),
    ).toBeVisible()
    // Посилання відкрито в сесії Олени: спершу вийти, чужий запис сюди не підставиться (ADR-0040).
    await page.getByRole("button", { name: "Вийти", exact: true }).click()
    await page.getByLabel("Ваше ім'я").fill("Ольга Коваленко")
    await page
      .getByLabel("Новий пароль", { exact: true })
      .fill("мій-перший-пароль-тут")
    await page.getByRole("button", { name: "Приєднатися" }).click()
    await expect(
      page.getByRole("button", { name: "Меню користувача: Ольга Коваленко" }),
    ).toBeVisible()

    // Знову Олена: запрошення прийнято, у дзвіника — нове сповіщення.
    await page.goto("about:blank")
    await openWith(page, {}, USERS_PAGE)
    await expect(page.getByText("Запрошень, що чекають, немає.")).toBeVisible()
    await page.getByRole("button", { name: "Сповіщення: 4 нові" }).click()
    await expect(
      page.getByRole("button", {
        name: "Запрошення прийнято: Ольга Коваленко",
        exact: true,
      }),
    ).toBeVisible()
  })

  test("відкликане запрошення більше не діє", async ({ page }) => {
    await openWith(page, {}, USERS_PAGE)
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("petro@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Аудитор" }).check()
    await dialog.getByRole("button", { name: "Надіслати запрошення" }).click()
    await confirmWithPassword(page)
    await expect(
      toast(page, "Запрошення надіслано на petro@zoriana.example"),
    ).toBeVisible()
    await page
      .getByRole("button", {
        name: "Відкликати запрошення: petro@zoriana.example",
      })
      .click()
    await page
      .getByRole("alertdialog", {
        name: "Відкликати запрошення для petro@zoriana.example?",
      })
      .getByRole("button", { name: "Відкликати" })
      .click()
    await expect(toast(page, "Запрошення відкликано")).toBeVisible()
    await expect(page.getByText("Запрошень, що чекають, немає.")).toBeVisible()

    await toast(page, "Лист на petro@zoriana.example")
      .getByRole("button", { name: "Відкрити посилання з листа" })
      .click()
    // Заголовок — про запрошення, а не «Реєстрація» (аудит хвилі 0, №20).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Запрошення недійсне",
    )
    await expect(page.getByText(/вже використане/)).toBeVisible()
  })
})

test.describe("центр сповіщень (ADR-0014)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("дзвіник: останні, перехід за посиланням; сторінка: фільтр, позначки, «Прочитати все»", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/primitives")
    await page.getByRole("button", { name: "Сповіщення: 3 нові" }).click()
    const preview = page.getByRole("list", { name: "Сповіщення" })
    await expect(preview.getByRole("listitem")).toHaveCount(5)
    await expectNoA11yViolations(page)
    await preview
      .getByRole("button", {
        name: "Рахунок 2026-0012 прострочено",
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(/#\/data$/)
    await expect(
      page.getByRole("button", { name: "Сповіщення: 2 нові" }),
    ).toBeVisible()

    await page.getByRole("button", { name: "Сповіщення: 2 нові" }).click()
    await page.getByRole("button", { name: "Усі сповіщення" }).click()
    await expect(page).toHaveURL(/#\/notifications$/)
    const list = page.getByRole("list", { name: "Сповіщення" })
    await expect(list.getByRole("listitem")).toHaveCount(6)
    await page.getByRole("tab", { name: "Непрочитані: 2" }).click()
    await expect(list.getByRole("listitem")).toHaveCount(2)
    await page
      .getByRole("button", {
        name: "Позначити прочитаним: Вам призначили завдання: звірка з контрагентом",
      })
      .click()
    await expect(list.getByRole("listitem")).toHaveCount(1)
    await expectNoA11yViolations(page)
    await page.getByRole("button", { name: "Прочитати все" }).click()
    await expect(toast(page, "Усе позначено прочитаним")).toBeVisible()
    await expect(page.getByText("Усе прочитано.")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Сповіщення", exact: true }),
    ).toBeVisible()

    await page.getByRole("tab", { name: "Усі" }).click()
    await page
      .getByRole("button", {
        name: "Позначити непрочитаним: Рахунок 2026-0009 оплачено",
      })
      .click()
    await expect(
      page.getByRole("button", { name: "Сповіщення: 1 нове" }),
    ).toBeVisible()
  })
})

test.describe("налаштування компанії (ADR-0014)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("реквізити з перевіркою LC12, логотип, філія", async ({ page }) => {
    await openWith(page, {}, COMPANY)
    const edrpou = page.getByLabel("Код ЄДРПОУ")
    await expect(edrpou).toHaveValue("32855961")
    await expect(page.getByText("МФО банку: 322313")).toBeVisible()
    await expectNoA11yViolations(page)

    await edrpou.fill("32855962")
    await edrpou.blur()
    await expect(
      page.getByText("Помилка в ЄДРПОУ: не збігається контрольна цифра"),
    ).toBeVisible()
    await edrpou.fill("32855961")
    await expect(page.getByText(/не збігається контрольна цифра/)).toBeHidden()

    await page.getByRole("switch", { name: "Платник ПДВ" }).click()
    await expect(page.getByLabel("ІПН платника ПДВ")).toBeHidden()
    await page.getByLabel("Посада керівника").fill("Генеральна директорка")
    await page.getByRole("combobox", { name: "Палітра компанії" }).click()
    await page.getByRole("option", { name: "Бірюза" }).click()
    await page.getByRole("button", { name: "Зберегти", exact: true }).click()
    await expect(toast(page, "Реквізити збережено")).toBeVisible()
    // Палітра компанії — типова для всіх, хто не обрав свою (SPEC §6.2).
    await expect(page.locator("html")).toHaveAttribute("data-palette", "teal")
    await expect(
      page.getByRole("button", { name: "Зберегти", exact: true }),
    ).toBeDisabled()

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "logo.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("GIF89a"),
      })
    await expect(page.getByText("Оберіть PNG, JPG, WebP або SVG")).toBeVisible()
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "logo.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>',
        ),
      })
    await expect(toast(page, "Зображення оновлено")).toBeVisible()
    await expect(
      page.getByRole("img", { name: "Логотип: Зоряна логістика" }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Замінити: Логотип" }),
    ).toBeVisible()

    await page.getByRole("button", { name: "Додати філію" }).click()
    const branch = page.getByRole("dialog", { name: "Нова філія" })
    await branch.getByRole("button", { name: "Зберегти" }).click()
    await expect(branch.getByText("Заповніть це поле")).toBeVisible()
    await branch.getByLabel("Назва").fill("Одеська філія")
    await branch.getByLabel("Адреса").fill("м. Одеса, вул. Морська, 3")
    await branch.getByRole("button", { name: "Зберегти" }).click()
    await expect(toast(page, "Філію збережено")).toBeVisible()
    const branches = page.getByRole("list", { name: "Філії" })
    await expect(branches.getByRole("listitem")).toHaveCount(2)

    await page
      .getByRole("button", { name: "Видалити філію: Одеська філія" })
      .click()
    await page
      .getByRole("dialog", { name: "Видалити філію «Одеська філія»?" })
      .getByRole("button", { name: "Видалити" })
      .click()
    await expect(toast(page, "Філію видалено")).toBeVisible()
    await expect(branches.getByRole("listitem")).toHaveCount(1)

    await page.goto("about:blank")
    await openWith(page, {}, "/#/settings/audit")
    await expect(
      page.getByRole("button", {
        name: /Подробиці: Зміна реквізитів компанії/,
      }),
    ).toBeVisible()
  })

  test("без права — лише перегляд", async ({ page }) => {
    await openWith(page, {}, COMPANY, { user: USERS.sales })
    await expect(
      page.getByText("Змінювати реквізити може адміністратор компанії."),
    ).toBeVisible()
    await expect(page.getByLabel("Код ЄДРПОУ")).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Зберегти", exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Додати філію" }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)
  })
})
