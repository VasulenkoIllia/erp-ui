import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

const SECURITY = "/#/settings/security"
const USERS_PAGE = "/#/settings/users"
const LOGIN = "/#/login"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

/** Повторне підтвердження паролем (діалог над поточною дією). */
async function confirmWithPassword(page: Page) {
  const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
  await expect(reauth).toBeVisible()
  await reauth.getByLabel("Пароль", { exact: true }).fill("demo")
  await reauth.getByRole("button", { name: "Підтвердити", exact: true }).click()
  await expect(reauth).toBeHidden()
}

test.describe("способи підтвердження входу (ADR-0011)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("застосунок: повторне підтвердження, QR, код, резервні коди один раз", async ({
    page,
  }) => {
    await openWith(page, {}, SECURITY, { user: USERS.sales })
    await expect(page.getByText("Двоетапна перевірка вимкнена")).toBeVisible()
    await page.getByRole("button", { name: "Налаштувати застосунок" }).click()
    await confirmWithPassword(page)

    const setup = page.getByRole("dialog", {
      name: "Застосунок-автентифікатор",
    })
    await expect(
      setup.getByRole("img", { name: "QR-код для застосунку-автентифікатора" }),
    ).toBeVisible()
    await expect(setup.locator("code")).toHaveText(
      /^([A-Z2-7]{4} ){4}[A-Z2-7]{4}$/,
    )
    await expectNoA11yViolations(page)
    const code = setup.getByLabel("2. Введіть 6-значний код із застосунку")
    await code.fill("000000")
    await expect(setup.getByText("Код не підходить")).toBeVisible()
    await code.fill("123456")

    const backup = page.getByRole("dialog", {
      name: "Збережіть резервні коди",
    })
    await expect(
      backup.getByRole("list", { name: "Резервні коди" }).getByRole("listitem"),
    ).toHaveCount(10)
    await expectNoA11yViolations(page)
    await backup.getByRole("button", { name: "Я зберіг коди" }).click()
    await expect(backup).toBeHidden()

    const factors = page.getByRole("list", {
      name: "Способи підтвердження входу",
    })
    await expect(factors.getByText("Застосунок-автентифікатор")).toBeVisible()
    await expect(page.getByText("Лишилося 10 кодів із 10")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Налаштувати застосунок" }),
    ).toBeHidden()
  })

  test("телефон: код у SMS на новий номер", async ({ page }) => {
    await openWith(page, {}, SECURITY, { user: USERS.sales })
    await page.getByRole("button", { name: "Додати телефон" }).click()
    const dialog = page.getByRole("dialog", { name: "Телефон для кодів" })
    await expect(dialog.getByLabel("Номер телефону")).not.toHaveValue("")
    await dialog.getByRole("button", { name: "Надіслати код" }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "SMS на +380501112233: код 123456")).toBeVisible()
    await dialog.getByLabel("Код із SMS на +380 •• ••• •• 33").fill("123456")
    await page
      .getByRole("dialog", { name: "Збережіть резервні коди" })
      .getByRole("button", { name: "Я зберіг коди" })
      .click()
    await expect(
      page
        .getByRole("list", { name: "Способи підтвердження входу" })
        .getByText("Код у SMS"),
    ).toBeVisible()
  })

  test("ключ доступу: створити, перейменувати, вимкнути", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("WebAuthn.enable")
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    })
    await openWith(page, {}, SECURITY)
    await page.getByRole("button", { name: "Додати ключ доступу" }).click()
    const dialog = page.getByRole("dialog", { name: "Новий ключ доступу" })
    await dialog.getByLabel("Назва ключа").fill("Робочий ноутбук")
    await dialog.getByRole("button", { name: "Створити ключ" }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Спосіб додано")).toBeVisible()

    const factors = page.getByRole("list", {
      name: "Способи підтвердження входу",
    })
    await expect(factors.getByText("Робочий ноутбук")).toBeVisible()
    await page.getByRole("button", { name: "Дії: Робочий ноутбук" }).click()
    await page.getByRole("menuitem", { name: "Перейменувати" }).click()
    const rename = page.getByRole("dialog", {
      name: "Перейменувати «Робочий ноутбук»",
    })
    await rename.getByLabel("Назва").fill("Ноутбук")
    await rename.getByRole("button", { name: "Зберегти" }).click()
    await expect(factors.getByText("Ноутбук", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Дії: Ноутбук" }).click()
    await page.getByRole("menuitem", { name: "Вимкнути" }).click()
    await page
      .getByRole("dialog", { name: "Вимкнути «Ноутбук»?" })
      .getByRole("button", { name: "Вимкнути" })
      .click()
    await expect(toast(page, "Спосіб вимкнено")).toBeVisible()
    await expect(factors.getByText("Ноутбук", { exact: true })).toBeHidden()
  })

  test("нові резервні коди: підтвердження, копіювання", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await openWith(page, {}, SECURITY)
    await expect(page.getByText("Лишилося 2 коди з 10")).toBeVisible()
    await page.getByRole("button", { name: "Створити нові коди" }).click()
    await page
      .getByRole("dialog", { name: "Створити нові резервні коди?" })
      .getByRole("button", { name: "Створити нові коди" })
      .click()
    await confirmWithPassword(page)
    const backup = page.getByRole("dialog", {
      name: "Збережіть резервні коди",
    })
    await backup.getByRole("button", { name: "Копіювати коди" }).click()
    await expect(backup.getByRole("status")).toHaveText("Скопійовано")
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied.split("\n")).toHaveLength(10)
    await backup.getByRole("button", { name: "Я зберіг коди" }).click()
    await expect(page.getByText("Лишилося 10 кодів із 10")).toBeVisible()
  })
})

test.describe("сесії, пристрої, журнал входів", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("вийти на пристрої й на всіх інших; забути довірений пристрій", async ({
    page,
  }) => {
    await openWith(page, {}, SECURITY)
    const sessions = page.getByRole("list", { name: "Де ви увійшли" })
    await expect(sessions.getByRole("listitem")).toHaveCount(3)
    await expect(sessions.getByText("Цей пристрій")).toBeVisible()
    await page
      .getByRole("button", { name: "Вийти на пристрої: Safari, iOS" })
      .click()
    await expect(sessions.getByRole("listitem")).toHaveCount(2)
    await page.getByRole("button", { name: "Вийти на інших пристроях" }).click()
    await page
      .getByRole("dialog", { name: "Вийти на всіх інших пристроях?" })
      .getByRole("button", { name: "Вийти на інших пристроях" })
      .click()
    await expect(page.getByText("Інших активних сесій немає.")).toBeVisible()

    await page
      .getByRole("button", { name: "Забути пристрій: Safari, iOS" })
      .click()
    await expect(page.getByText("Довірених пристроїв немає.")).toBeVisible()
  })

  test("журнал входів і лист про новий пристрій", async ({ page }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByLabel("Email").fill("ivan@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(
      toast(page, "Лист на ivan@zoriana.example: новий вхід в акаунт"),
    ).toBeVisible()
    await expect(page).toHaveURL(/#\/data$/)
    await page.goto(SECURITY)
    const history = page.getByRole("list", { name: "Журнал входів" })
    await expect(history.getByRole("listitem")).toHaveCount(1)
    await expect(history).toContainText("Вхід · пароль")
    await expect(history).toContainText("Новий пристрій")

    const alerts = page.getByRole("switch", {
      name: "Лист про вхід з нового пристрою",
    })
    await expect(alerts).toBeChecked()
    await alerts.click()
    await expect(alerts).not.toBeChecked()
    await page.reload()
    await expect(
      page.getByRole("switch", { name: "Лист про вхід з нового пристрою" }),
    ).not.toBeChecked()
  })
})

test.describe("«Увійти як…» (ADR-0011)", () => {
  test("причина, смуга, зміни безпеки заборонені, повернення", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, USERS_PAGE)
    await expect(heading(page)).toHaveText("Користувачі")
    await expect(
      page.getByRole("button", { name: "Увійти як Олена Коваль" }),
    ).toBeHidden()
    await page.getByRole("button", { name: "Увійти як Іван Петренко" }).click()
    const dialog = page.getByRole("dialog", {
      name: "Увійти як Іван Петренко?",
    })
    await dialog
      .getByRole("button", { name: "Увійти як Іван Петренко" })
      .click()
    await expect(dialog.getByText("Заповніть це поле")).toBeVisible()
    await dialog.getByLabel("Причина").fill("Звернення № 4521")
    await dialog
      .getByRole("button", { name: "Увійти як Іван Петренко" })
      .click()
    await confirmWithPassword(page)

    await expect(page).toHaveURL(/#\/data$/)
    const banner = page.getByRole("region", { name: "Режим «Увійти як…»" })
    await expect(banner).toContainText("Ви працюєте як Іван Петренко")
    await expect(banner).toContainText("Дії записуються від імені Олена Коваль")
    await expect(
      page.getByRole("button", { name: "Меню користувача: Іван Петренко" }),
    ).toBeVisible()

    await page.goto(SECURITY)
    await expect(
      page.getByText("Адміністратор Олена Коваль працює від вашого імені"),
    ).toBeVisible()
    await page.getByLabel("Поточний пароль").fill("demo")
    await page.getByLabel("Новий пароль").fill("new-password-2026")
    await page.getByRole("button", { name: "Змінити пароль" }).click()
    await expect(
      page.getByText(
        /Недоступно, поки ви працюєте від імені іншого користувача/,
      ),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await banner
      .getByRole("button", { name: "Повернутися до свого акаунта" })
      .click()
    await expect(page).toHaveURL(/#\/settings\/users$/)
    await expect(banner).toBeHidden()
    await expect(
      page.getByRole("button", { name: "Меню користувача: Олена Коваль" }),
    ).toBeVisible()
  })

  test("без права — сторінка «Немає доступу»", async ({ page }) => {
    await openWith(page, {}, USERS_PAGE, { user: USERS.sales })
    await expect(
      page.getByRole("heading", { name: "Немає доступу" }),
    ).toBeVisible()
  })

  test("смуга на телефоні: axe і без горизонтальної прокрутки", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWith(page, {}, USERS_PAGE)
    await page.getByRole("button", { name: "Увійти як Іван Петренко" }).click()
    const dialog = page.getByRole("dialog", {
      name: "Увійти як Іван Петренко?",
    })
    await dialog.getByLabel("Причина").fill("Перевірка налаштувань")
    await dialog
      .getByRole("button", { name: "Увійти як Іван Петренко" })
      .click()
    await confirmWithPassword(page)
    await expect(
      page.getByRole("region", { name: "Режим «Увійти як…»" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390)
  })
})

test.describe("бренд сторінки входу (white-label)", () => {
  async function chooseBrand(page: Page, name: string) {
    await page.getByRole("combobox", { name: "Бренд (white-label)" }).click()
    await page.getByRole("option", { name }).click()
  }

  test("логотип, палітра, бічна панель, документи; без бренду — як було", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, { theme: "light" }, LOGIN, { user: null })
    await chooseBrand(page, "Бухгалтерія Плюс")
    await expect(
      page.getByRole("img", { name: "Бухгалтерія Плюс" }),
    ).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("data-palette", "teal")
    await expect(page.getByRole("complementary")).toContainText(
      "Облік без паніки",
    )
    await expect(
      page
        .getByRole("navigation", { name: "Документи" })
        .getByRole("link", { name: "Підтримка: help@buh-plus.example" }),
    ).toHaveAttribute("href", "mailto:help@buh-plus.example")
    await expect(page).toHaveTitle("Вхід · Бухгалтерія Плюс")
    await expectNoA11yViolations(page)

    // Власний вибір користувача сильніший за бренд.
    await page.evaluate(() => {
      localStorage.setItem(
        "erp-ui:appearance",
        JSON.stringify({ theme: "light", palette: "graphite" }),
      )
    })
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute(
      "data-palette",
      "graphite",
    )

    await chooseBrand(page, "Без бренду")
    await expect(page.getByRole("complementary")).toBeHidden()
    await expect(page).toHaveTitle("Вхід")
  })

  for (const theme of ["light", "dark"] as const)
    test(`без логотипа — ініціали; телефон, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await openWith(page, { theme }, LOGIN, { user: null })
      await chooseBrand(page, "Зоряна логістика")
      await expect(page.locator("html")).toHaveAttribute(
        "data-palette",
        "terracotta",
      )
      await expect(page.getByText("Зоряна логістика").first()).toBeVisible()
      // Бічна панель — лише на широких екранах.
      await expect(page.getByRole("complementary")).toBeHidden()
      await expectNoA11yViolations(page)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390)
    })
})
