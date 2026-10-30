import { expect, test, type Page } from "@playwright/test"

import {
  confirmWithPassword,
  expectNoA11yViolations,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок A2b2b1 (ADR-0033): сторінка «Ролі й права» модуля A2 — список ролей і права вибраної поруч
 * (на телефоні — список над правами), роль в адресі (`?role=`), незбережені зміни, галочки лише
 * для перегляду в порядку Tab з причиною, роль щойно змінив інший адміністратор (сценарій
 * `conflict`), ролі в межах компанії, пункт навігації з правом `roles:read`. Крок A2c2b1 — перемикач
 * «Свої | Усі» поруч з увімкненою дією з вибором.
 */
const ROLES = "/#/m/A2/roles"

const list = (page: Page) => page.getByRole("list", { name: "Ролі" })
const roleButton = (page: Page, name: RegExp) =>
  list(page).getByRole("button", { name })
const roleHeading = (page: Page) =>
  page.getByRole("heading", { level: 2 }).first()
/** Пункт модуля в навігації (у групі кіта є сторінки з тими самими назвами — за адресою). */
const navLink = (page: Page, path: string) =>
  page
    .getByRole("navigation", { name: "Основна навігація" })
    .locator(`a[href$="${path}"]`)
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

/** Сценарій лише для ролей: вхід, профіль і решта працюють як звичайно. */
const withRolesScenario = (page: Page, scenario: string) =>
  page.addInitScript(
    (value) => {
      localStorage.setItem("erp-ui:mock-scenarios", value)
    },
    JSON.stringify({ global: "success", resources: { roles: scenario } }),
  )

const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )

test.describe("A2: ролі й права", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("пункт навігації, роль в адресі, фокус на ролі, незбережені зміни", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/A2/users")
    await expect(navLink(page, "/m/A2/roles")).toHaveText("Ролі й права")
    await navLink(page, "/m/A2/roles").click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ролі й права",
    )
    await expect(roleHeading(page)).toHaveText("Бухгалтер")
    await expect(roleButton(page, /Бухгалтер/)).toHaveAttribute(
      "aria-current",
      "true",
    )

    await roleButton(page, /Аудитор/).click()
    await expect(page).toHaveURL(/[?&]role=auditor/)
    await expect(roleHeading(page)).toHaveText("Аудитор")
    await expect(roleHeading(page)).toBeFocused()
    await page.reload()
    await expect(roleHeading(page)).toHaveText("Аудитор")

    // Інша роль зі списку — свій діалог; «Не зберігати» — одразу до неї, без другого питання.
    await page.getByRole("checkbox", { name: "Експорт: Рахунки" }).check()
    await roleButton(page, /Бухгалтер/).click()
    const unsaved = page.getByRole("dialog", {
      name: "Зміни ролі «Аудитор» не збережено",
    })
    await unsaved.getByRole("button", { name: "Не зберігати" }).click()
    await expect(page).toHaveURL(/[?&]role=accountant/)
    await expect(roleHeading(page)).toHaveText("Бухгалтер")
    await expect(page.getByRole("dialog")).toBeHidden()

    // Піти зі сторінки з незбереженими змінами — питання охорони переходу.
    await page.getByRole("checkbox", { name: "Експорт: Рахунки" }).uncheck()
    await navLink(page, "/m/A2/users").click()
    const leave = page.getByRole("alertdialog", {
      name: "Вийти без збереження?",
    })
    await leave.getByRole("button", { name: "Залишитися" }).click()
    await expect(page).toHaveURL(/#\/m\/A2\/roles/)
    await expect(
      page.getByRole("checkbox", { name: "Експорт: Рахунки" }),
    ).not.toBeChecked()

    // «Нова роль» з незбереженими змінами — те саме питання, «Повернутися» лишає зміни.
    await page.getByRole("button", { name: "Нова роль" }).click()
    const ask = page.getByRole("dialog", {
      name: "Зміни ролі «Бухгалтер» не збережено",
    })
    await ask.getByRole("button", { name: "Повернутися до ролі" }).click()
    await expect(ask).toBeHidden()
    await expect(
      page.getByRole("checkbox", { name: "Експорт: Рахунки" }),
    ).not.toBeChecked()

    // «Копіювати» → «Не зберігати»: чернетку відкинуто, копія — зі збереженої ролі.
    await page.getByRole("button", { name: "Копіювати" }).click()
    await ask.getByRole("button", { name: "Не зберігати" }).click()
    const copy = page.getByRole("dialog", { name: "Нова роль" })
    await copy.getByRole("button", { name: "Скасувати" }).click()
    await expect(copy).toBeHidden()
    await expect(
      page.getByRole("checkbox", { name: "Експорт: Рахунки" }),
    ).toBeChecked()
  })

  test("вбудована роль: галочки лише для перегляду в порядку Tab з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, `${ROLES}?role=owner`)
    const hint =
      "Вбудовану роль змінити не можна. Скопіюйте її й налаштуйте копію."
    await expect(page.getByText(hint)).toBeVisible()
    const users = page.getByRole("checkbox", { name: "Зміна: Користувачі" })
    await expect(users).toHaveAttribute("aria-readonly", "true")
    await expect(users).toHaveAccessibleDescription(hint)
    await users.focus()
    await expect(users).toBeFocused()
    await page.keyboard.press("Space")
    await expect(users).toBeChecked()
    // Наступна галочка — тією ж клавішею Tab, а не стрибком повз матрицю.
    await page.keyboard.press("Tab")
    await expect(
      page.getByRole("checkbox", { name: "Видалення: Користувачі" }),
    ).toBeFocused()
    // Перемикач «Свої | Усі» — одна зупинка Tab на вибраному, лише для перегляду з причиною.
    await page.getByRole("checkbox", { name: "Зміна: Організації" }).focus()
    await page.keyboard.press("Tab")
    const scope = page.getByRole("radiogroup", {
      name: "Які записи: Зміна, Організації",
    })
    await expect(scope).toHaveAttribute("aria-readonly", "true")
    await expect(scope.getByRole("radio", { name: "Усі" })).toBeFocused()
    await expect(scope).toHaveAccessibleDescription(new RegExp(hint))
    await page.keyboard.press("Tab")
    await expect(
      page.getByRole("checkbox", { name: "Видалення: Організації" }),
    ).toBeFocused()
    await expectNoA11yViolations(page)
  })

  test("«Свої / Усі»: перемикач поруч з увімкненою дією, клавіатура, збереження", async ({
    page,
  }) => {
    await openWith(page, {}, `${ROLES}?role=lead`)
    await expect(
      page.getByText(
        "«Свої»: записи, за які людина відповідальна. «Усі»: усі записи компанії.",
      ),
    ).toBeVisible()
    const scope = (action: string) =>
      page.getByRole("radiogroup", {
        name: `Які записи: ${action}, Організації`,
      })
    await expect(
      scope("Перегляд").getByRole("radio", { name: "Усі" }),
    ).toBeChecked()
    await expect(scope("Зміна")).toHaveCount(0)
    // Дія без вибору (рахунки) — без перемикача.
    await expect(
      page.getByRole("radiogroup", { name: /Рахунки$/ }),
    ).toHaveCount(0)
    await scope("Перегляд").getByRole("radio", { name: "Свої" }).click()

    // Нова дія — «Усі»; стрілкою — «Свої».
    await page.getByRole("checkbox", { name: "Зміна: Організації" }).check()
    const all = scope("Зміна").getByRole("radio", { name: "Усі" })
    await expect(all).toBeChecked()
    await all.focus()
    await page.keyboard.press("ArrowLeft")
    await expect(
      scope("Зміна").getByRole("radio", { name: "Свої" }),
    ).toBeChecked()
    await page.getByRole("button", { name: "Зберегти" }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Роль збережено")).toBeVisible()

    await page.reload()
    await expect(
      scope("Перегляд").getByRole("radio", { name: "Свої" }),
    ).toBeChecked()
    await expect(
      scope("Зміна").getByRole("radio", { name: "Свої" }),
    ).toBeChecked()
    await expectNoA11yViolations(page)
  })

  test("роль щойно змінив інший адміністратор: свіжі дані, свої галочки лишились, друге збереження", async ({
    page,
  }) => {
    await withRolesScenario(page, "conflict")
    await openWith(page, {}, `${ROLES}?role=auditor`)
    const exportInvoices = page.getByRole("checkbox", {
      name: "Експорт: Рахунки",
    })
    await exportInvoices.check()
    const save = page.getByRole("button", { name: "Зберегти", exact: true })
    await save.click()
    const conflict = page.getByText(/Цю роль щойно змінив інший адміністратор/)
    await expect(conflict).toBeVisible()
    await expect(exportInvoices).toBeChecked()
    await expectNoA11yViolations(page)
    await save.click()
    await confirmWithPassword(page)
    await expect(toast(page, "Роль збережено")).toBeVisible()
    await expect(conflict).toBeHidden()
    await expect(exportInvoices).toBeChecked()
  })

  test("невідома роль в адресі й порожній список — стан поруч зі списком", async ({
    page,
  }) => {
    await openWith(page, {}, `${ROLES}?role=nope`)
    await expect(page.getByText("Роль не знайдено")).toBeVisible()
    await expect(list(page).getByRole("listitem")).toHaveCount(6)
    await roleButton(page, /Аудитор/).click()
    await expect(roleHeading(page)).toHaveText("Аудитор")

    await withRolesScenario(page, "empty")
    await page.reload()
    await expect(page.getByText("Ролей ще немає")).toBeVisible()
    await expect(page.getByRole("button", { name: "Нова роль" })).toBeVisible()
  })

  test("ролі в межах компанії: лічильник людей і нова роль — лише своєї компанії", async ({
    page,
  }) => {
    await openWith(page, {}, ROLES)
    await expect(roleButton(page, /Бухгалтер/)).toContainText("5 користувачів")
    await page.getByRole("button", { name: "Нова роль" }).click()
    const create = page.getByRole("dialog", { name: "Нова роль" })
    await create.getByLabel("Назва").fill("Склад")
    await create.getByRole("button", { name: "Нова роль" }).click()
    await expect(toast(page, "Роль створено")).toBeVisible()
    await expect(page).toHaveURL(/[?&]role=role-/)
    await expect(roleHeading(page)).toHaveText("Склад")
    // Нова роль одразу в списку: без «Роль не знайдено», фокус — на її заголовку.
    await expect(roleHeading(page)).toBeFocused()
    await expect(page.getByText("Роль не знайдено")).toHaveCount(0)

    await page.getByRole("button", { name: /^Змінити компанію/ }).click()
    await page.getByRole("menuitemradio", { name: /Коваленко/ }).click()
    // У ФОП лише Олена: «Бухгалтер» — одна людина, «Склад» іншої компанії немає.
    await expect(roleButton(page, /Бухгалтер/)).toContainText("1 користувач")
    await expect(roleButton(page, /Склад/)).toHaveCount(0)
    await expect(page.getByText("Роль не знайдено")).toBeVisible()
  })

  test("керівник відділу: лише перегляд з причиною, без «Нова роль»", async ({
    page,
  }) => {
    await openWith(page, {}, `${ROLES}?role=sales`, { user: USERS.lead })
    const hint =
      "Лише перегляд: змінювати ролі може той, хто має право на зміну ролей."
    await expect(page.getByText(hint)).toBeVisible()
    await expect(
      page.getByRole("checkbox", { name: "Перегляд: Рахунки" }),
    ).toHaveAccessibleDescription(hint)
    await expect(page.getByRole("button", { name: "Нова роль" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Зберегти" })).toHaveCount(0)
  })

  test("без права roles:read — пункту немає, сторінка «Немає доступу»", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/A2/users", { user: USERS.sales })
    await expect(navLink(page, "/m/A2/users")).toBeVisible()
    await expect(navLink(page, "/m/A2/roles")).toHaveCount(0)
    await page.goto(ROLES)
    await expect(page.getByText("Немає доступу")).toBeVisible()
  })
})

test.describe("A2: ролі на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("список над правами; вибрана роль — заголовок у фокусі й на екрані", async ({
    page,
  }) => {
    await openWith(page, {}, ROLES)
    await roleButton(page, /Аудитор/).click()
    await expect(roleHeading(page)).toBeFocused()
    await expect(roleHeading(page)).toBeInViewport()
    const listBox = await list(page).boundingBox()
    const headingBox = await roleHeading(page).boundingBox()
    expect(listBox && headingBox && headingBox.y > listBox.y).toBe(true)
    expect(await noHorizontalScroll(page)).toBe(true)
  })
})

test.describe("A2: ролі, axe", () => {
  // Вбудована роль — перемикачі лише для перегляду; «Менеджер з продажу» — редаговані.
  for (const [theme, role] of [
    ["light", "sales"],
    ["dark", "sales"],
    ["dark", "owner"],
  ] as const)
    test(`1440 ${theme} ${role}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const owner = role === "owner"
      await openWith(page, { theme }, `${ROLES}?role=${role}`)
      await expect(roleHeading(page)).toHaveText(
        owner ? "Власник" : "Менеджер з продажу",
      )
      await expectNoA11yViolations(page)
    })

  for (const [width, language] of [
    [360, "en"],
    [768, "uk"],
  ] as const)
    test(`${width}px ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openWith(page, { language }, `${ROLES}?role=owner`)
      await expect(roleHeading(page)).toBeVisible()
      await expectNoA11yViolations(page)
      expect(await noHorizontalScroll(page)).toBe(true)
    })
})
