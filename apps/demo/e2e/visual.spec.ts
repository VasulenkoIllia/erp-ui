import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

const PALETTES = [
  "sapphire",
  "graphite",
  "indigo",
  "teal",
  "terracotta",
] as const
const THEMES = ["light", "dark"] as const
const DENSITIES = ["comfortable", "compact"] as const

// SPEC §18: перевірка на 360/768/1440; скриншоти для власника — 390/768/1440 (WAVE-0).
const CHECK_WIDTHS = [360, 768, 1440] as const
const SHOT_WIDTHS = [390, 768, 1440] as const
const SHOT_PALETTES = ["sapphire", "graphite"] as const
const HEIGHTS: Record<number, number> = {
  360: 780,
  390: 844,
  768: 1024,
  1440: 900,
}

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)

test.describe("axe: усі палітри × теми × щільності", () => {
  for (const palette of PALETTES)
    for (const theme of THEMES)
      for (const density of DENSITIES)
        test(`${palette} ${theme} ${density}`, async ({ page }) => {
          await page.setViewportSize({ width: 1440, height: 900 })
          await openWith(page, { palette, theme, density })
          await expectNoA11yViolations(page)
        })
})

test.describe("axe: контрольні ширини", () => {
  for (const width of CHECK_WIDTHS)
    for (const theme of THEMES)
      test(`${width}px ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(page, { palette: "sapphire", theme })
        await expectNoA11yViolations(page)
      })
})

// Сторінки для скриншотів; SCREENSHOT_PAGES=primitives,… обмежує набір (для звіту кроку).
const SHOT_PAGES = {
  appearance: "/",
  primitives: "/#/primitives",
  formats: "/#/formats",
  fields: "/#/fields",
  forms: "/#/forms",
  pickers: "/#/pickers",
  icons: "/#/icons",
  states: "/#/states",
  module: "/#/m/K2",
  data: "/#/data",
  login: "/#/login",
  signup: "/#/signup",
  inviteInvalid: "/#/login/invite?token=revoked",
  resetExpired: "/#/login/reset",
  security: "/#/settings/security",
  users: "/#/settings/users",
  profile: "/#/settings/profile",
  securityPolicy: "/#/settings/security-policy",
  notifications: "/#/settings/notifications",
  audit: "/#/settings/audit",
  integrations: "/#/settings/integrations",
  roles: "/#/settings/roles",
  company: "/#/settings/company",
  inbox: "/#/notifications",
} as const
/** Екрани входу — для гостя, решта — під бухгалтером. */
const GUEST_PAGES: readonly (keyof typeof SHOT_PAGES)[] = [
  "login",
  "signup",
  "inviteInvalid",
  "resetExpired",
]
const userFor = (pageId: keyof typeof SHOT_PAGES) =>
  GUEST_PAGES.includes(pageId) ? { user: null } : {}
/** Стрес-сторінка: знімок — коли рахунки вже прийшли, а не скелетон. */
const listStatus = (page: Page) =>
  page.locator('[data-slot="data-table-status"]')
const settle = async (page: Page, pageId: keyof typeof SHOT_PAGES) => {
  if (pageId === "data")
    await expect(listStatus(page)).toHaveText(/\d (рахунк|invoice)/)
  // Вибір запису: підписи значень уже з сервера, а не «Завантаження…».
  if (pageId === "pickers")
    await expect(page.getByText(/^(Завантаження…|Loading…)$/)).toHaveCount(0)
}
const selected = (
  process.env.SCREENSHOT_PAGES ?? Object.keys(SHOT_PAGES).join(",")
)
  .split(",")
  .filter((p): p is keyof typeof SHOT_PAGES => p in SHOT_PAGES)

test.describe("скриншоти @screenshots", () => {
  for (const pageId of selected) {
    for (const palette of SHOT_PALETTES)
      for (const theme of THEMES)
        for (const width of SHOT_WIDTHS)
          test(`${pageId} ${palette} ${theme} ${width}`, async ({ page }) => {
            await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
            await openWith(
              page,
              { palette, theme },
              SHOT_PAGES[pageId],
              userFor(pageId),
            )
            await settle(page, pageId)
            await expectNoA11yViolations(page)
            await page.screenshot({
              path: path.join(
                shotsDir,
                `${pageId}-${palette}-${theme}-${width}.png`,
              ),
              fullPage: true,
            })
          })
    // Англійська версія: телефон і десктоп, Сапфір, світла тема.
    for (const width of [390, 1440] as const)
      test(`${pageId} sapphire light ${width} en`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
        await openWith(
          page,
          { palette: "sapphire", theme: "light", language: "en" },
          SHOT_PAGES[pageId],
          userFor(pageId),
        )
        await settle(page, pageId)
        await expectNoA11yViolations(page)
        await page.screenshot({
          path: path.join(shotsDir, `${pageId}-sapphire-light-${width}-en.png`),
          fullPage: true,
        })
      })
    // Компактна щільність — для порівняння на десктопі.
    for (const palette of SHOT_PALETTES)
      test(`${pageId} ${palette} light 1440 compact`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await openWith(
          page,
          { palette, theme: "light", density: "compact" },
          SHOT_PAGES[pageId],
          userFor(pageId),
        )
        await settle(page, pageId)
        await page.screenshot({
          path: path.join(
            shotsDir,
            `${pageId}-${palette}-light-1440-compact.png`,
          ),
          fullPage: true,
        })
      })
  }
})

// Кроки, до яких треба дійти діями: код підтвердження після пароля.
test.describe("скриншоти кроків @screenshots", () => {
  const cases = [
    { palette: "sapphire", theme: "light", width: 390 },
    { palette: "sapphire", theme: "dark", width: 768 },
    { palette: "graphite", theme: "dark", width: 1440 },
  ] as const
  for (const { palette, theme, width } of cases)
    test(`challenge ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(
        Boolean(process.env.SCREENSHOT_PAGES) &&
          !process.env.SCREENSHOT_PAGES?.split(",").includes("challenge"),
      )
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/login", { user: null })
      await page.getByLabel("Email").fill("olena@zoriana.example")
      await page.getByLabel("Пароль", { exact: true }).fill("demo")
      await page.getByRole("button", { name: "Увійти", exact: true }).click()
      await page.getByLabel("Код", { exact: true }).fill("123")
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `challenge-${palette}-${theme}-${width}.png`),
        fullPage: true,
      })
    })
})

// Крок 0.5b2: налаштування застосунку, резервні коди, «Увійти як…», бренд сторінки входу.
test.describe("скриншоти кроків 0.5b2 @screenshots", () => {
  const only = (key: string) =>
    Boolean(process.env.SCREENSHOT_PAGES) &&
    !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
  const cases = [
    { palette: "sapphire", theme: "light", width: 390 },
    { palette: "sapphire", theme: "dark", width: 768 },
    { palette: "graphite", theme: "light", width: 1440 },
  ] as const

  for (const { palette, theme, width } of cases) {
    test(`totp ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("totp"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/security", {
        user: USERS.sales,
      })
      await page.getByRole("button", { name: "Налаштувати застосунок" }).click()
      const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
      await reauth.getByLabel("Пароль", { exact: true }).fill("demo")
      await reauth
        .getByRole("button", { name: "Підтвердити", exact: true })
        .click()
      await page
        .getByRole("img", { name: "QR-код для застосунку-автентифікатора" })
        .waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `totp-${palette}-${theme}-${width}.png`),
      })
      await page
        .getByLabel("2. Введіть 6-значний код із застосунку")
        .fill("123456")
      await page
        .getByRole("dialog", { name: "Збережіть резервні коди" })
        .waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `backup-codes-${palette}-${theme}-${width}.png`,
        ),
      })
    })

    test(`impersonation ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("impersonation"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/users")
      await page
        .getByRole("button", { name: "Увійти як Іван Петренко" })
        .click()
      const dialog = page.getByRole("dialog", {
        name: "Увійти як Іван Петренко?",
      })
      await dialog.getByLabel("Причина").fill("Звернення № 4521")
      await page.screenshot({
        path: path.join(
          shotsDir,
          `impersonate-dialog-${palette}-${theme}-${width}.png`,
        ),
      })
      await dialog
        .getByRole("button", { name: "Увійти як Іван Петренко" })
        .click()
      const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
      await reauth.getByLabel("Пароль", { exact: true }).fill("demo")
      await reauth
        .getByRole("button", { name: "Підтвердити", exact: true })
        .click()
      await page.getByRole("region", { name: "Режим «Увійти як…»" }).waitFor()
      await page.goto("/#/settings/security")
      await page.getByRole("list", { name: "Де ви увійшли" }).waitFor()
      await page
        .locator("[data-sonner-toast]")
        .first()
        .waitFor({ state: "detached" })
      await page.screenshot({
        path: path.join(
          shotsDir,
          `impersonation-${palette}-${theme}-${width}.png`,
        ),
      })
    })
  }

  for (const brand of ["Бухгалтерія Плюс", "Зоряна логістика"] as const)
    for (const theme of THEMES)
      for (const width of [390, 1440] as const)
        test(`brand ${brand} ${theme} ${width}`, async ({ page }) => {
          test.skip(only("brand"))
          await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
          await openWith(page, { theme }, "/#/login", { user: null })
          await page
            .getByRole("combobox", { name: "Бренд (white-label)" })
            .click()
          await page.getByRole("option", { name: brand }).click()
          // Список закривається з анімацією: axe посеред неї бачить напівпрозорі пункти.
          await expect(page.getByRole("listbox")).toBeHidden()
          await page.getByText(brand).first().waitFor()
          await page.evaluate(() => {
            window.scrollTo(0, 0)
          })
          await expectNoA11yViolations(page)
          const slug = brand === "Бухгалтерія Плюс" ? "buh-plus" : "zoriana"
          await page.screenshot({
            path: path.join(
              shotsDir,
              `login-brand-${slug}-${theme}-${width}.png`,
            ),
          })
        })
})

// Крок 0.5b3: фото профілю, токен API, обов'язковий другий крок, запит і скидання доступу.
test.describe("скриншоти кроків 0.5b3 @screenshots", () => {
  const only = (key: string) =>
    Boolean(process.env.SCREENSHOT_PAGES) &&
    !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
  const cases = [
    { palette: "sapphire", theme: "light", width: 390 },
    { palette: "sapphire", theme: "dark", width: 768 },
    { palette: "graphite", theme: "light", width: 1440 },
  ] as const

  /** Дані мок-сервера в localStorage до завантаження сторінки. */
  const seed = (page: Page, key: string, value: unknown) =>
    page.addInitScript(
      ([k, v]) => {
        localStorage.setItem(k, v)
      },
      [key, JSON.stringify(value)] as const,
    )
  const reauth = async (page: Page) => {
    const dialog = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
    await dialog.getByLabel("Пароль", { exact: true }).fill("demo")
    await dialog
      .getByRole("button", { name: "Підтвердити", exact: true })
      .click()
    await dialog.waitFor({ state: "hidden" })
  }

  for (const { palette, theme, width } of cases) {
    test(`crop ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("crop"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/profile", {
        user: USERS.sales,
      })
      const base64 = await page.evaluate(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 640
        canvas.height = 420
        const context = canvas.getContext("2d")
        // Кольори — з токенів теми (canvas розуміє oklch).
        const token = (name: string) =>
          getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim()
        if (context) {
          const gradient = context.createLinearGradient(0, 0, 640, 420)
          gradient.addColorStop(0, token("--primary"))
          gradient.addColorStop(1, token("--chart-2"))
          context.fillStyle = gradient
          context.fillRect(0, 0, 640, 420)
          context.fillStyle = token("--warning")
          context.beginPath()
          context.arc(320, 190, 110, 0, Math.PI * 2)
          context.fill()
        }
        return canvas.toDataURL("image/png").split(",")[1] ?? ""
      })
      await page.locator('input[type="file"]').setInputFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from(base64, "base64"),
      })
      await page.getByRole("dialog", { name: "Обріжте фото" }).waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `crop-${palette}-${theme}-${width}.png`),
      })
    })

    test(`api-token ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("api-token"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/security")
      await page.getByRole("button", { name: "Створити токен" }).click()
      const dialog = page.getByRole("dialog", { name: "Новий токен API" })
      await dialog.getByLabel("Назва").fill("Інтеграція з 1С")
      await dialog
        .getByRole("group", { name: "Рахунки" })
        .getByRole("checkbox", { name: "Перегляд" })
        .check()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `api-token-new-${palette}-${theme}-${width}.png`,
        ),
      })
      await dialog.getByRole("button", { name: "Створити токен" }).click()
      await reauth(page)
      await page.getByRole("dialog", { name: "Збережіть токен" }).waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `api-token-${palette}-${theme}-${width}.png`),
      })
    })

    test(`factor-setup ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("factor-setup"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await seed(page, "erp-ui:mock-security-policy", {
        twoFactor: "all",
        twoFactorRoles: [],
        allowedFactors: ["totp", "sms", "email", "passkey"],
        passwordless: ["email", "sms", "passkey"],
        ssoProviders: ["google", "apple"],
        password: { minLength: 10, expiryDays: null, preventReuse: 0 },
        sessionMinutes: 30,
        idleTimeoutMinutes: null,
        trustedDeviceDays: 30,
        ipAllowlist: [],
      })
      await openWith(page, { palette, theme }, "/#/login", { user: null })
      await page.getByLabel("Email").fill("ivan@zoriana.example")
      await page.getByLabel("Пароль", { exact: true }).fill("demo")
      await page.getByRole("button", { name: "Увійти", exact: true }).click()
      await page
        .getByRole("heading", { name: "Налаштуйте двоетапну перевірку" })
        .waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `factor-setup-${palette}-${theme}-${width}.png`,
        ),
        fullPage: true,
      })
    })

    test(`recovery ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("recovery"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/login", { user: null })
      await page.getByLabel("Email").fill("olena@zoriana.example")
      await page.getByLabel("Пароль", { exact: true }).fill("demo")
      await page.getByRole("button", { name: "Увійти", exact: true }).click()
      await page
        .getByRole("button", { name: "Немає доступу до жодного способу?" })
        .click()
      await page
        .getByLabel("Що сталося (необов'язково)")
        .fill("Загубила телефон, резервних кодів немає")
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `recovery-${palette}-${theme}-${width}.png`),
        fullPage: true,
      })
    })

    test(`reset ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("reset"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await seed(page, "erp-ui:mock-recovery-requests", [
        {
          id: "rec-demo",
          userId: "u-ivan",
          userName: "Іван Петренко",
          email: "ivan@zoriana.example",
          requestedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
          comment: "Загубив телефон, резервних кодів немає",
        },
      ])
      await openWith(page, { palette, theme }, "/#/settings/users")
      await page
        .getByRole("list", { name: "Запити на відновлення доступу" })
        .waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `recovery-requests-${palette}-${theme}-${width}.png`,
        ),
        fullPage: true,
      })
      await page
        .getByRole("list", { name: "Запити на відновлення доступу" })
        .getByRole("button", {
          name: "Скинути двоетапну перевірку: Іван Петренко",
        })
        .click()
      const dialog = page.getByRole("dialog", {
        name: "Іван Петренко: скинути двоетапну перевірку?",
      })
      await dialog
        .getByLabel("Як ви перевірили особу")
        .fill("Дзвінок на робочий номер")
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `reset-${palette}-${theme}-${width}.png`),
      })
    })
  }
})

// Крок 0.5b4: журнал аудиту з подробицями, вебхук (секрет, журнал доставок), доступ користувача.
test.describe("скриншоти кроків 0.5b4 @screenshots", () => {
  const only = (key: string) =>
    Boolean(process.env.SCREENSHOT_PAGES) &&
    !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
  const cases = [
    { palette: "sapphire", theme: "light", width: 390 },
    { palette: "sapphire", theme: "dark", width: 768 },
    { palette: "graphite", theme: "light", width: 1440 },
  ] as const
  const reauth = async (page: Page) => {
    const dialog = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
    await dialog.getByLabel("Пароль", { exact: true }).fill("demo")
    await dialog
      .getByRole("button", { name: "Підтвердити", exact: true })
      .click()
    await dialog.waitFor({ state: "hidden" })
  }
  /** Дочекатися кінця анімацій появи (діалоги, панелі). */
  const settled = (page: Page) =>
    page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
    )

  for (const { palette, theme, width } of cases) {
    test(`audit-details ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("audit-details"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/audit")
      await page
        .getByRole("button", { name: "Подробиці: Зміна політики безпеки" })
        .click()
      await page.getByRole("table", { name: "Що змінилося" }).waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `audit-details-${palette}-${theme}-${width}.png`,
        ),
        fullPage: true,
      })
    })

    test(`webhook ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("webhook"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/integrations")
      await page.getByRole("button", { name: "Додати вебхук" }).click()
      const dialog = page.getByRole("dialog", { name: "Новий вебхук" })
      await dialog.getByLabel("Адреса").fill("https://crm.example.com/hooks")
      await dialog.getByLabel("Опис (необов'язково)").fill("CRM партнера")
      await dialog
        .getByRole("group", { name: "Рахунки" })
        .getByRole("checkbox", { name: "Рахунок змінено" })
        .check()
      await settled(page)
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `webhook-new-${palette}-${theme}-${width}.png`,
        ),
      })
      await dialog.getByRole("button", { name: "Додати", exact: true }).click()
      await reauth(page)
      await page
        .getByRole("dialog", { name: "Збережіть секрет підпису" })
        .waitFor()
      await settled(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `webhook-secret-${palette}-${theme}-${width}.png`,
        ),
      })
    })

    test(`deliveries ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("deliveries"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/integrations")
      await page
        .getByRole("button", {
          name: "Дії: https://1c.zoriana.example/hooks/erp",
        })
        .click()
      await page.getByRole("menuitem", { name: "Журнал доставок" }).click()
      const sheet = page.getByRole("dialog", { name: "Журнал доставок" })
      await sheet
        .getByRole("button", { name: /Подробиці доставки/ })
        .first()
        .click()
      await settled(page)
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `deliveries-${palette}-${theme}-${width}.png`,
        ),
      })
    })

    test(`access ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("access"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/users")
      await page.getByRole("button", { name: "Доступ: Іван Петренко" }).click()
      const sheet = page.getByRole("dialog", { name: "Доступ: Іван Петренко" })
      await sheet.getByText("Активні сесії").waitFor()
      await settled(page)
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `access-${palette}-${theme}-${width}.png`),
      })
      await sheet.getByRole("button", { name: "Заблокувати" }).click()
      const block = page.getByRole("dialog", {
        name: "Іван Петренко: заблокувати акаунт?",
      })
      await block.getByLabel("Причина").fill("Звільнення 13.10.2026")
      await settled(page)
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `block-${palette}-${theme}-${width}.png`),
      })
    })
  }
})

test.describe("скриншоти кроків 0.5b5 @screenshots", () => {
  const only = (key: string) =>
    Boolean(process.env.SCREENSHOT_PAGES) &&
    !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
  const cases = [
    { palette: "sapphire", theme: "light", width: 390 },
    { palette: "sapphire", theme: "dark", width: 768 },
    { palette: "graphite", theme: "light", width: 1440 },
  ] as const
  /** Дочекатися кінця анімацій появи (діалоги, панелі). */
  const settled = (page: Page) =>
    page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
    )

  for (const { palette, theme, width } of cases) {
    test(`invite ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("invite"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/users")
      await page.getByRole("button", { name: "Запросити колегу" }).click()
      const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
      await dialog.getByLabel("Email").fill("olha@zoriana.example")
      await dialog.getByLabel("Ім'я (необов'язково)").fill("Ольга Коваленко")
      await dialog.getByRole("checkbox", { name: "Менеджер з продажу" }).check()
      await settled(page)
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `invite-${palette}-${theme}-${width}.png`),
      })
    })

    test(`bell ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("bell"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/roles")
      await page.getByRole("button", { name: "Сповіщення: 3 нові" }).click()
      await page.getByRole("button", { name: "Усі сповіщення" }).waitFor()
      await settled(page)
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `bell-${palette}-${theme}-${width}.png`),
      })
    })

    test(`company-readonly ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("company-readonly"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme }, "/#/settings/company", {
        user: USERS.sales,
      })
      await page
        .getByText("Змінювати реквізити може адміністратор компанії.")
        .waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `company-readonly-${palette}-${theme}-${width}.png`,
        ),
      })
    })
  }
})

// Крок 0.6a (ADR-0009): сторінка чи мова не завантажились — стан помилки й сповіщення з повтором.
test.describe("скриншоти кроку 0.6a @screenshots", () => {
  const only = (key: string) =>
    Boolean(process.env.SCREENSHOT_PAGES) &&
    !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
  const cases = [
    { palette: "sapphire", theme: "light", width: 390 },
    { palette: "sapphire", theme: "dark", width: 768 },
    { palette: "graphite", theme: "light", width: 1440 },
  ] as const
  // Чанки йдуть через service worker MSW — блокуємо на рівні контексту.
  const block = (page: Page, chunks: RegExp) =>
    page.context().route(chunks, (route) => route.abort("internetdisconnected"))

  for (const { palette, theme, width } of cases) {
    test(`chunk-failed ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("chunk-failed"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await openWith(page, { palette, theme })
      await block(page, /\/DataPage-[\w-]+\.js$/)
      await page.goto("/#/data")
      await expect(page.getByRole("alert")).toContainText(
        "Не вдалося завантажити дані",
      )
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `chunk-failed-${palette}-${theme}-${width}.png`,
        ),
      })
    })

    test(`language-failed ${palette} ${theme} ${width}`, async ({ page }) => {
      test.skip(only("language-failed"))
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      await block(page, /\/(i18n-en|en)-[\w-]+\.js$/)
      await openWith(page, { palette, theme, language: "en" }, "/#/")
      await page.getByText(/Не вдалося завантажити мову інтерфейсу/).waitFor()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `language-failed-${palette}-${theme}-${width}.png`,
        ),
      })
    })
  }
})

// Крок 0.6b (ADR-0016): клавіатура в гріді на рядку 10 000, картки на телефоні, сторінки.
test.describe("скриншоти кроку 0.6b @screenshots", () => {
  const only = (key: string) =>
    Boolean(process.env.SCREENSHOT_PAGES) &&
    !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
  const grid = (page: Page) =>
    page.getByRole("grid", { name: "Рахунки клієнтам" })

  for (const theme of THEMES)
    test(`data-keyboard graphite ${theme} 1440`, async ({ page }) => {
      test.skip(only("data"))
      await page.setViewportSize({ width: 1440, height: HEIGHTS[1440] ?? 900 })
      await openWith(page, { palette: "graphite", theme }, "/#/data")
      await settle(page, "data")
      await page.getByRole("button", { name: "Оновити" }).focus()
      await page.keyboard.press("Tab")
      await page.keyboard.press("Control+End")
      await expect(grid(page).locator('[aria-rowindex="10001"]')).toContainText(
        /2026-\d+/,
      )
      await page.keyboard.press("ArrowUp")
      await page.keyboard.press("ArrowLeft")
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `data-keyboard-graphite-${theme}-1440.png`),
      })
    })

  for (const theme of THEMES)
    test(`data-pages sapphire ${theme} 768`, async ({ page }) => {
      test.skip(only("data"))
      await page.setViewportSize({ width: 768, height: HEIGHTS[768] ?? 900 })
      await openWith(page, { palette: "sapphire", theme }, "/#/data")
      await settle(page, "data")
      await page.getByRole("button", { name: "Сторінки" }).click()
      await expect(page.getByText(/^1-20 з /)).toBeVisible()
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(shotsDir, `data-pages-sapphire-${theme}-768.png`),
        fullPage: true,
      })
    })

  for (const theme of THEMES)
    test(`data-cards-sorted sapphire ${theme} 390`, async ({ page }) => {
      test.skip(only("data"))
      await page.setViewportSize({ width: 390, height: HEIGHTS[390] ?? 844 })
      await openWith(page, { palette: "sapphire", theme }, "/#/data")
      await settle(page, "data")
      await page.getByRole("combobox", { name: "Сортування" }).click()
      await page.getByRole("option", { name: "Сума, за спаданням" }).click()
      await expect(listStatus(page)).toHaveText(/\d рахунк/)
      await expectNoA11yViolations(page)
      await page.screenshot({
        path: path.join(
          shotsDir,
          `data-cards-sorted-sapphire-${theme}-390.png`,
        ),
      })
    })
})

// Крок 0.6c1 (ADR-0017): вкладки-статуси, FilterBar із чипами, панель фільтрів, збережені види.
test.describe("скриншоти кроку 0.6c1 @screenshots", () => {
  const only = (key: string) =>
    Boolean(process.env.SCREENSHOT_PAGES) &&
    !process.env.SCREENSHOT_PAGES?.split(",").includes(key)
  const shot = (page: Page, name: string, fullPage = false) =>
    page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage })
  /** Вкладка «Прострочені» і клієнт «ПП «Агросвіт»» через адресу — як посилання від колеги. */
  const FILTERED =
    "/#/data?tab=overdue&client=%D0%9F%D0%9F+%C2%AB%D0%90%D0%B3%D1%80%D0%BE%D1%81%D0%B2%D1%96%D1%82%C2%BB"

  for (const theme of THEMES)
    test(`filters-views graphite ${theme} 1440`, async ({ page }) => {
      test.skip(only("filters"))
      await page.setViewportSize({ width: 1440, height: HEIGHTS[1440] ?? 900 })
      await openWith(page, { palette: "graphite", theme }, FILTERED)
      await settle(page, "data")
      await page.getByRole("button", { name: /^Вид списку:/ }).click()
      await page
        .getByRole("menuitem", { name: "Зберегти як новий вид…" })
        .click()
      const dialog = page.getByRole("dialog", { name: "Новий вид" })
      await dialog.getByLabel("Назва").fill("Прострочені Агросвіт")
      await dialog.getByRole("button", { name: "Зберегти" }).click()
      await expect(dialog).toBeHidden()
      await page.getByRole("button", { name: /^Вид списку:/ }).click()
      await expect(page.getByRole("menu")).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `filters-views-graphite-${theme}-1440`)
    })

  for (const theme of THEMES)
    test(`filters-panel sapphire ${theme} 768`, async ({ page }) => {
      test.skip(only("filters"))
      await page.setViewportSize({ width: 768, height: HEIGHTS[768] ?? 900 })
      await openWith(page, { palette: "sapphire", theme }, FILTERED)
      await settle(page, "data")
      await page.getByRole("button", { name: /^Фільтри/ }).click()
      const panel = page.getByRole("dialog", { name: "Фільтри" })
      await panel.getByLabel("Від", { exact: true }).fill("50000")
      await expectNoA11yViolations(page)
      await shot(page, `filters-panel-sapphire-${theme}-768`)
    })

  for (const theme of THEMES) {
    test(`filters-sheet sapphire ${theme} 390`, async ({ page }) => {
      test.skip(only("filters"))
      await page.setViewportSize({ width: 390, height: HEIGHTS[390] ?? 844 })
      await openWith(page, { palette: "sapphire", theme }, FILTERED)
      await settle(page, "data")
      await page.getByRole("button", { name: /^Фільтри/ }).click()
      await expect(page.getByRole("dialog", { name: "Фільтри" })).toBeVisible()
      await expectNoA11yViolations(page)
      await shot(page, `filters-sheet-sapphire-${theme}-390`)
    })

    test(`filters-chips sapphire ${theme} 390`, async ({ page }) => {
      test.skip(only("filters"))
      await page.setViewportSize({ width: 390, height: HEIGHTS[390] ?? 844 })
      await openWith(page, { palette: "sapphire", theme }, FILTERED)
      await settle(page, "data")
      await expectNoA11yViolations(page)
      await shot(page, `filters-chips-sapphire-${theme}-390`)
    })
  }

  test("filters-chips sapphire light 1440 en", async ({ page }) => {
    test.skip(only("filters"))
    await page.setViewportSize({ width: 1440, height: HEIGHTS[1440] ?? 900 })
    await openWith(
      page,
      { palette: "sapphire", theme: "light", language: "en" },
      FILTERED,
    )
    await expect(listStatus(page)).toHaveText(/\d invoice/)
    await expectNoA11yViolations(page)
    await shot(page, "filters-chips-sapphire-light-1440-en")
  })
})
