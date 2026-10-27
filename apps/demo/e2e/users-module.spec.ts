import { expect, test, type Page } from "@playwright/test"

import { cellOf, expectNoA11yViolations, openWith, USERS } from "./helpers"

/**
 * Крок A2b1 (ADR-0031): модуль A2 «Користувачі й ролі» на місці заглушки `/m/A2` з розширенням
 * проекту (`src/extensions/A2-users.ts`): поле «Відділ», вкладка «Без другого кроку», інша назва
 * колонки «Посада». У компанії бухгалтерки 20 людей: четверо з демо й 16 колег із фікстур модуля, двоє
 * з них заблоковані, четверо — аудитори. На широкому екрані «Історія» — бічна колонка картки, на
 * телефоні — остання вкладка.
 */
const MODULE = "/#/m/A2"
const LIST = "/#/m/A2/users"
/** Колега з фікстур: активний, менеджер з продажу, без другого кроку. */
const COLLEAGUE = "/#/m/A2/users/u-fixture-01"
const COLLEAGUE_NAME = "Андрій Бондар"
const IVAN = "/#/m/A2/users/u-ivan"
const SELF = "/#/m/A2/users/u-olena"
const SETTINGS_USERS = "/#/settings/users"

const grid = (page: Page) =>
  page.getByRole("grid", { name: "Користувачі", exact: true })
const rows = (page: Page) => grid(page).locator('[role="row"][data-index]')
const listTab = (page: Page, name: RegExp) => page.getByRole("tab", { name })
const cardTabs = (page: Page) =>
  page
    .getByRole("tablist", { name: "Розділи картки користувача" })
    .getByRole("tab")
const cardTab = (page: Page, name: string) =>
  page
    .getByRole("tablist", { name: "Розділи картки користувача" })
    .getByRole("tab", { name, exact: true })
const headerValue = (page: Page, label: string) =>
  page
    .locator("header dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

async function confirmWithPassword(page: Page) {
  const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
  await expect(reauth).toBeVisible()
  await reauth.getByLabel("Пароль", { exact: true }).fill("demo")
  await reauth.getByRole("button", { name: "Підтвердити", exact: true }).click()
  await expect(reauth).toBeHidden()
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )

test.describe("A2: список користувачів", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("адреса модуля веде на список; вкладки з лічильниками, вкладка розширення, статус у адресі", async ({
    page,
  }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/A2\/users$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Користувачі",
    )
    await expect(listTab(page, /^Усі/)).toHaveText(/20/)
    await expect(listTab(page, /^Активний/)).toHaveText(/18/)
    await expect(listTab(page, /^Заблокований/)).toHaveText(/2/)
    await expect(listTab(page, /^Без другого кроку/)).toHaveText(/14/)
    // Колонка розширення й інша назва колонки модуля.
    await expect(
      grid(page).getByRole("columnheader", { name: /Відділ/ }),
    ).toBeVisible()
    await expect(
      grid(page).getByRole("columnheader", { name: /Посада в компанії/ }),
    ).toBeVisible()

    await listTab(page, /^Заблокований/).click()
    await expect(page).toHaveURL(/[?&]tab=blocked/)
    await expect(rows(page)).toHaveCount(2)
    const statuses = await cellOf(grid(page), rows(page), "Статус")
    await expect(statuses).toHaveText(["Заблокований", "Заблокований"])
    await expectNoA11yViolations(page)
  })

  test("фільтри: роль — за id з назвою в чипі, поле розширення; пошук за email", async ({
    page,
  }) => {
    await openWith(page, {}, `${LIST}?roles=auditor`)
    await expect(rows(page)).toHaveCount(4)
    await expect(
      page.getByRole("list", { name: "Активні фільтри" }),
    ).toContainText("Аудитор")
    const roles = await cellOf(grid(page), rows(page), "Ролі")
    await expect(roles.filter({ hasNotText: "Аудитор" })).toHaveCount(0)

    await page.goto(`${LIST}?department=finance`)
    await expect(
      page.getByRole("list", { name: "Активні фільтри" }),
    ).toContainText("Фінанси")
    const departments = await cellOf(grid(page), rows(page), "Відділ")
    await expect(departments.first()).toHaveText("Фінанси")
    await expect(departments.filter({ hasNotText: "Фінанси" })).toHaveCount(0)

    await page.goto(LIST)
    await page
      .getByRole("searchbox", { name: "Пошук за ім'ям чи email" })
      .fill("andrii.bondar")
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText(COLLEAGUE_NAME)
  })

  test("без `users:read` — «Немає доступу» у списку й картці, а не збій", async ({
    page,
  }) => {
    await openWith(page, {}, LIST, { user: USERS.sales })
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Користувачі",
    )
    await expect(page.getByText("Немає доступу")).toBeVisible()
    await expect(grid(page)).toHaveCount(0)
    await expectNoA11yViolations(page)
    await page.goto(COLLEAGUE)
    await expect(page.getByText("Немає доступу")).toBeVisible()
    await expect(cardTabs(page)).toHaveCount(0)
    // Сторінка налаштувань демо теж не просить довідник замість списку.
    await page.goto(SETTINGS_USERS)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Користувачі",
    )
    await expect(page.getByText("Немає доступу").first()).toBeVisible()
  })
})

test.describe("A2: картка користувача", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("зі списку й «До користувачів» з тією ж вкладкою; шапка з полем розширення", async ({
    page,
  }) => {
    await openWith(page, {}, `${LIST}?tab=blocked`)
    const name =
      (await rows(page).first().getByRole("link").textContent()) ?? ""
    await rows(page).first().getByRole("link").click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await expect(page.locator("header").getByText("Заблокований")).toBeVisible()
    await expect(cardTabs(page)).toHaveText(["Доступ", "Ролі", "Сесії"])
    await expect(page.getByRole("region", { name: "Історія" })).toBeVisible()
    await expect(headerValue(page, "Відділ")).not.toHaveText("")
    await page.getByRole("link", { name: "До користувачів" }).click()
    await expect(page).toHaveURL(/#\/m\/A2\/users\?(?:.*&)?tab=blocked/)
  })

  test("блокування з причиною й підтвердженням: статус у шапці, подія в історії, розблокування", async ({
    page,
  }) => {
    await openWith(page, {}, COLLEAGUE)
    await expect(page.locator("header").getByText("Активний")).toBeVisible()
    await page.getByRole("button", { name: "Заблокувати" }).click()
    const block = page.getByRole("dialog", {
      name: `${COLLEAGUE_NAME}: заблокувати акаунт?`,
    })
    await block.getByLabel("Причина").fill("Декретна відпустка")
    await block.getByRole("button", { name: "Заблокувати" }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Акаунт заблоковано")).toBeVisible()
    await expect(page.locator("header").getByText("Заблокований")).toBeVisible()
    await expect(page.getByText("Причина: Декретна відпустка")).toBeVisible()

    await expect(
      page
        .getByRole("region", { name: "Історія" })
        .getByText("Блокування акаунта"),
    ).toBeVisible()

    await page.getByRole("button", { name: "Розблокувати" }).click()
    await page
      .getByRole("alertdialog", {
        name: `${COLLEAGUE_NAME}: розблокувати акаунт?`,
      })
      .getByRole("button", { name: "Розблокувати" })
      .click()
    await expect(toast(page, "Акаунт розблоковано")).toBeVisible()
    await expect(page.locator("header").getByText("Активний")).toBeVisible()
  })

  test("ролі у вкладці: з підтвердженням, шапка оновлюється", async ({
    page,
  }) => {
    await openWith(page, {}, `${COLLEAGUE}?tab=roles`)
    const roles = page.getByRole("group", { name: "Ролі" })
    await expect(
      roles.getByRole("checkbox", { name: "Менеджер з продажу" }),
    ).toBeChecked()
    await roles.getByRole("checkbox", { name: "Аудитор" }).check()
    await expectNoA11yViolations(page)
    await page.getByRole("button", { name: "Зберегти ролі" }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Ролі змінено")).toBeVisible()
    await expect(headerValue(page, "Ролі")).toContainText("Аудитор")
  })

  test("сесії людини — у своїй вкладці; «Увійти як…» — діалог із причиною", async ({
    page,
  }) => {
    await openWith(page, {}, `${IVAN}?tab=sessions`)
    await expect(
      page.getByRole("button", {
        name: "Завершити сесію: Іван Петренко, Chrome, Android",
      }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Увійти як…", exact: true }).click()
    const dialog = page.getByRole("dialog", {
      name: "Увійти як Іван Петренко?",
    })
    await expect(dialog.getByLabel("Причина")).toBeVisible()
    await dialog.getByRole("button", { name: "Скасувати" }).click()
    await expect(dialog).toBeHidden()
  })

  test("«Вийти на всіх пристроях» — подія одразу в «Історії», без перезавантаження", async ({
    page,
  }) => {
    await openWith(page, {}, IVAN)
    const history = page.getByRole("region", { name: "Історія" })
    await expect(history).toBeVisible()
    await page.getByRole("button", { name: "Вийти на всіх пристроях" }).click()
    await page
      .getByRole("alertdialog", {
        name: "Іван Петренко: вийти на всіх пристроях?",
      })
      .getByRole("button", { name: "Вийти на всіх пристроях" })
      .click()
    await expect(history.getByText("Вихід на всіх пристроях")).toBeVisible()
  })

  test("своя картка — «Це ви», без «Увійти як…» і без зміни свого доступу", async ({
    page,
  }) => {
    await openWith(page, {}, SELF)
    await expect(page.locator("header").getByText("Це ви")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Увійти як…", exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByText("Свій доступ ви змінюєте в налаштуваннях безпеки"),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Заблокувати" })).toHaveCount(
      0,
    )
    await cardTab(page, "Ролі").click()
    await expect(
      page.getByRole("button", { name: "Зберегти ролі" }),
    ).toHaveCount(0)
    await expect(page.getByText("Свої ролі ви не змінюєте")).toBeVisible()
  })
})

test.describe("A2: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картки списку, вкладки картки, без прокрутки вбік", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await expect(page.locator("article[data-card]").first()).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    await page.goto(COLLEAGUE)
    await expect(cardTabs(page)).toHaveText([
      "Доступ",
      "Ролі",
      "Сесії",
      "Історія",
    ])
    await cardTab(page, "Історія").click()
    await expect(page).toHaveURL(/[?&]tab=aside/)
    expect(await noHorizontalScroll(page)).toBe(true)
  })
})

test.describe("A2: axe", () => {
  for (const theme of ["light", "dark"] as const)
    test(`список і картка ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openWith(page, { theme }, LIST)
      await expect(rows(page).first()).toBeVisible()
      await expectNoA11yViolations(page)
      await page.goto(COLLEAGUE)
      await expect(cardTab(page, "Доступ")).toBeVisible()
      await expectNoA11yViolations(page)
    })

  for (const [width, language] of [
    [360, "en"],
    [768, "uk"],
  ] as const)
    test(`${width}px ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openWith(page, { language }, LIST)
      await expectNoA11yViolations(page)
      await page.goto(COLLEAGUE)
      await expect(page.getByRole("tablist")).toBeVisible()
      await expectNoA11yViolations(page)
    })
})
