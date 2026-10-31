import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import {
  expectNoA11yViolations,
  openWith,
  type AppearanceSeed,
} from "./helpers"

// Крок N5 (ADR-0046): сторінки модуля, блок push у кожному стані, панелі «Доступ» і «Вебхуки». Стани
// браузера залежать від середовища, тому підмінені. Набір — як у visual.spec.ts
// (SCREENSHOT_PAGES=notificationsStates, SCREENSHOTS_DIR).
test.use({ channel: process.env.PW_CHROMIUM_PATH ? undefined : "chromium" })

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const INBOX = "/#/m/N5/inbox"
const SETTINGS = "/#/m/N5/notification-settings"
const USERS_PAGE = "/#/settings/users"
const INTEGRATIONS = "/#/settings/integrations"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("notificationsStates")

const section = (page: Page) => page.locator('[data-slot="push-device"]')

async function shot(page: Page, name: string) {
  await page.mouse.move(0, 0)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`) })
}

async function open(
  page: Page,
  seed: AppearanceSeed,
  width: number,
  target: string,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, target)
}

/** Дозвіл браузера й службу push підміняємо: у тесті служби немає. */
async function pushBrowser(page: Page, permission: NotificationPermission) {
  await page.addInitScript((value) => {
    let subscription: object | null = null
    Object.defineProperty(Notification, "permission", { get: () => value })
    Object.assign(Notification, {
      requestPermission: () => Promise.resolve(value),
    })
    Object.assign(PushManager.prototype, {
      subscribe: () => {
        subscription = {
          endpoint: "https://push.example/device-1",
          options: { applicationServerKey: null },
          toJSON: () => ({
            endpoint: "https://push.example/device-1",
            expirationTime: null,
            keys: { p256dh: "p256dh-key", auth: "auth-key" },
          }),
          unsubscribe: () => Promise.resolve(true),
        }
        return Promise.resolve(subscription)
      },
      getSubscription: () => Promise.resolve(subscription),
    })
  }, permission)
}

test.describe("скриншоти кроку N5 @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const
      const name = (state: string) =>
        `n5-${state}-sapphire-${theme}-${String(width)}`

      test(`inbox ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, INBOX)
        await expect(page).toHaveTitle("(3) Сповіщення")
        await expect(
          page.getByRole("list", { name: "Сповіщення" }),
        ).toBeVisible()
        await shot(page, name("inbox"))
      })

      test(`push off ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await pushBrowser(page, "default")
        await open(page, seed, width, SETTINGS)
        await expect(
          section(page).getByRole("button", {
            name: "Увімкнути на цьому пристрої",
          }),
        ).toBeVisible()
        await shot(page, name("push-off"))
      })

      test(`push on ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await pushBrowser(page, "granted")
        await open(page, seed, width, SETTINGS)
        await section(page)
          .getByRole("button", { name: "Увімкнути на цьому пристрої" })
          .click()
        await expect(section(page)).toContainText("Увімкнено")
        await expectNoA11yViolations(page)
        await shot(page, name("push-on"))
      })

      test(`push denied ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await pushBrowser(page, "denied")
        await open(page, seed, width, SETTINGS)
        await expect(section(page)).toContainText("Браузер заблокував")
        await shot(page, name("push-denied"))
      })

      test(`push unsupported ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await page.addInitScript(() => {
          Reflect.deleteProperty(window, "PushManager")
        })
        await open(page, seed, width, SETTINGS)
        await expect(section(page)).toContainText("На iPhone і iPad")
        await shot(page, name("push-unsupported"))
      })

      test(`access panel ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, USERS_PAGE)
        await page
          .getByRole("button", { name: "Доступ: Іван Петренко" })
          .click()
        const sheet = page.getByRole("dialog", {
          name: "Доступ: Іван Петренко",
        })
        await expect(sheet.getByRole("group", { name: "Ролі" })).toBeVisible()
        await shot(page, name("access-panel"))
      })

      test(`deliveries panel ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, INTEGRATIONS)
        await page
          .getByRole("button", {
            name: "Дії: https://1c.zoriana.example/hooks/erp",
          })
          .click()
        await page.getByRole("menuitem", { name: "Журнал доставок" }).click()
        await expect(
          page
            .getByRole("dialog", { name: "Журнал доставок" })
            .getByRole("list", { name: "Доставки" }),
        ).toBeVisible()
        await shot(page, name("deliveries-panel"))
      })
    }
})
