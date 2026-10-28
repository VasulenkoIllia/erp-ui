import { expect, test, type Locator, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

/**
 * Крок A2b2a (ADR-0032): керівник відділу (`users:read` і `roles:read` без `users:update` і
 * `audit:read`) бачить людей, але не змінює доступу й не бачить історії; «стеля» — роль «Власник»
 * (усі права) адміністраторка не дасть, не скопіює й не запросить із нею; скасоване повторне
 * підтвердження — свій текст, а не «Не вдалося увійти».
 */
const LIST = "/#/m/A2/users"
/** Колега з фікстур: активний, менеджер з продажу. */
const COLLEAGUE = "/#/m/A2/users/u-fixture-01"
const COLLEAGUE_NAME = "Андрій Бондар"
const ROLES_PAGE = "/#/settings/roles"
const USERS_PAGE = "/#/settings/users"
const BEYOND = "Дає права, яких немає у вас"

const grid = (page: Page) =>
  page.getByRole("grid", { name: "Користувачі", exact: true })
const cardTabs = (page: Page) =>
  page
    .getByRole("tablist", { name: "Розділи картки користувача" })
    .getByRole("tab")
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

const IVAN = "/#/m/A2/users/u-ivan"
const BEYOND_ACCESS =
  "У цієї людини є права, яких немає у вас: змінювати її доступ може лише той, хто має всі ці права."

/** Видима причина над діями (у кнопок — ще й опис для скрінрідера). */
const reasonNote = (scope: Page | Locator) =>
  scope.getByRole("paragraph").filter({ hasText: BEYOND_ACCESS })

/** Ролі людей до старту демо (`erp-ui:mock-user-roles`), один раз на вкладку. */
async function seedUserRoles(page: Page, roles: Record<string, string[]>) {
  await page.addInitScript((value) => {
    if (window !== window.top || sessionStorage.getItem("a2-seed-roles")) return
    sessionStorage.setItem("a2-seed-roles", "1")
    localStorage.setItem("erp-ui:mock-user-roles", value)
  }, JSON.stringify(roles))
}

/** Кнопка неактивна, а причину чує й скрінрідер (SPEC §8.4). */
async function expectDenied(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true })
  await expect(button).toBeDisabled()
  await expect(button).toHaveAccessibleDescription(BEYOND_ACCESS)
}

test.describe("A2b2a: керівник відділу", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("бачить список і картку; ролі — лише перегляд з причиною, без доступу, сесій та історії", async ({
    page,
  }) => {
    await openWith(page, {}, LIST, { user: USERS.lead })
    await expect(grid(page)).toBeVisible()
    await expect(
      grid(page).getByRole("link", { name: COLLEAGUE_NAME }),
    ).toBeVisible()

    await page.goto(COLLEAGUE)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      COLLEAGUE_NAME,
    )
    await expect(cardTabs(page)).toHaveText(["Ролі"])
    await expect(page.getByRole("region", { name: "Історія" })).toHaveCount(0)
    await expect(
      page.getByText(
        "Змінювати ролі може той, хто має право керувати доступом користувачів.",
      ),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Зберегти ролі" }),
    ).toHaveCount(0)
    const impersonate = page.getByRole("button", {
      name: "Увійти як…",
      exact: true,
    })
    await expect(impersonate).toBeDisabled()
    await expect(impersonate).toHaveAccessibleDescription(
      "Немає права входити від імені інших",
    )
    await expectNoA11yViolations(page)
  })

  test("телефон: одна вкладка «Ролі», без «Історії»", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWith(page, {}, COLLEAGUE, { user: USERS.lead })
    await expect(cardTabs(page)).toHaveText(["Ролі"])
  })
})

test.describe("A2b2a: «стеля» ролей", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("«Власник» неактивний з причиною в ролях людини, запрошенні й копіюванні ролі", async ({
    page,
  }) => {
    await openWith(page, {}, `${COLLEAGUE}?tab=roles`)
    const roles = page.getByRole("group", { name: "Ролі" })
    // Лише для перегляду в порядку Tab (ADR-0033), а не неактивна: причину чує й клавіатура.
    const owner = roles.getByRole("checkbox", { name: "Власник" })
    await expect(owner).toHaveAttribute("aria-readonly", "true")
    await expect(owner).toHaveAccessibleDescription(new RegExp(BEYOND))
    await expect(roles.getByRole("checkbox", { name: "Аудитор" })).toBeEnabled()
    await expectNoA11yViolations(page)

    await page.goto(USERS_PAGE)
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const invite = page.getByRole("dialog", { name: "Запросити колегу" })
    await expect(
      invite.getByRole("checkbox", { name: "Власник" }),
    ).toHaveAttribute("aria-readonly", "true")
    await invite.getByRole("button", { name: "Скасувати" }).click()

    await page.goto(ROLES_PAGE)
    await page
      .getByRole("list", { name: "Ролі" })
      .getByRole("button", { name: /Власник/ })
      .click()
    const copy = page.getByRole("button", { name: "Копіювати" })
    await expect(copy).toBeDisabled()
    await expect(copy).toHaveAccessibleDescription(
      "Роль дає права, яких немає у вас",
    )
  })

  test("«Увійти як…» в людину з усіма правами — неактивна з причиною", async ({
    page,
  }) => {
    // Колега з роллю «Власник» (`*`, зокрема `users:impersonate`): у демо її нікому не дано.
    await page.addInitScript(() => {
      if (window !== window.top || sessionStorage.getItem("a2-owner")) return
      sessionStorage.setItem("a2-owner", "1")
      localStorage.setItem(
        "erp-ui:mock-user-roles",
        JSON.stringify({ "u-fixture-01": ["owner"] }),
      )
    })
    await openWith(page, {}, COLLEAGUE)
    const impersonate = page.getByRole("button", {
      name: "Увійти як…",
      exact: true,
    })
    await expect(impersonate).toBeDisabled()
    await expect(impersonate).toHaveAccessibleDescription(
      "Не можна увійти від імені іншого адміністратора",
    )
  })

  test("скасоване повторне підтвердження — «Дію не виконано», а не «Не вдалося увійти»", async ({
    page,
  }) => {
    await openWith(page, {}, `${COLLEAGUE}?tab=roles`)
    await page
      .getByRole("group", { name: "Ролі" })
      .getByRole("checkbox", { name: "Аудитор" })
      .check()
    await page.getByRole("button", { name: "Зберегти ролі" }).click()
    const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
    await reauth.getByRole("button", { name: "Скасувати" }).click()
    await expect(reauth).toBeHidden()
    await expect(
      toast(page, "Дію не виконано: підтвердження скасовано"),
    ).toBeVisible()
    await expect(page.getByText(/Не вдалося увійти/)).toHaveCount(0)
  })
})

/**
 * Крок A2b2b2a (ADR-0034): «стеля» доступу — людині з правами, яких у адміністраторки немає (роль
 * «Власник»), не вийти, не завершити сесію, не заблокувати; дії неактивні з причиною.
 */
test.describe("A2b2b2a: «стеля» доступу", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("картка сильнішої людини: дії над доступом і сесіями неактивні з причиною", async ({
    page,
  }) => {
    await seedUserRoles(page, { "u-ivan": ["owner"] })
    await openWith(page, {}, `${IVAN}?tab=access`)
    await expect(reasonNote(page)).toBeVisible()
    await expectDenied(page, "Вийти на всіх пристроях")
    await expectDenied(page, "Заблокувати")
    await expectNoA11yViolations(page)

    await page.goto(`${IVAN}?tab=sessions`)
    await expectDenied(page, "Завершити сесію: Іван Петренко, Chrome, Android")
    await expect(reasonNote(page)).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("панель доступу кіта: ті самі дії неактивні, причина видна один раз", async ({
    page,
  }) => {
    await seedUserRoles(page, { "u-ivan": ["owner"] })
    await openWith(page, {}, USERS_PAGE)
    await page.getByRole("button", { name: "Доступ: Іван Петренко" }).click()
    const sheet = page.getByRole("dialog", { name: "Доступ: Іван Петренко" })
    await expect(reasonNote(sheet)).toHaveCount(1)
    const block = sheet.getByRole("button", { name: "Заблокувати" })
    await expect(block).toBeDisabled()
    await expect(block).toHaveAccessibleDescription(BEYOND_ACCESS)
    await expect(
      sheet.getByRole("button", { name: /^Завершити сесію: / }).first(),
    ).toHaveAccessibleDescription(BEYOND_ACCESS)
    await expectNoA11yViolations(page)
  })

  test("телефон: причина видна над неактивними діями", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedUserRoles(page, { "u-ivan": ["owner"] })
    await openWith(page, {}, `${IVAN}?tab=access`)
    await expect(reasonNote(page)).toBeVisible()
    await expectDenied(page, "Заблокувати")
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
