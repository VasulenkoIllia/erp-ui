import { test } from "@playwright/test"
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
  icons: "/#/icons",
  states: "/#/states",
  module: "/#/m/K2",
  data: "/#/data",
  login: "/#/login",
  signup: "/#/signup",
  security: "/#/settings/security",
  users: "/#/settings/users",
} as const
/** Екрани входу — для гостя, решта — під бухгалтером. */
const userFor = (pageId: keyof typeof SHOT_PAGES) =>
  pageId === "login" || pageId === "signup" ? { user: null } : {}
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
