import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { openWith, type AppearanceSeed } from "./helpers"

// Крок 1.7a: зміна B1 для циклу оновлення — статус модуля з іншою назвою (`change`), довгий бейдж
// обрізаний у колонці; журнал картки контакту з полем розширення підписом і значенням зі списку.
// Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES=updateCycle, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const ORGANIZATIONS = "/#/m/B1/organizations?tab=inactive"
const CONTACT_CARD = "/#/m/B1/contacts/contact-001"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("updateCycle")

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

test.describe("скриншоти кроку 1.7a @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const

      test(`organizations status change sapphire ${theme} ${width}`, async ({
        page,
      }) => {
        test.skip(skip())
        await open(page, seed, width, ORGANIZATIONS)
        await expect(
          page.getByText("Співпрацю припинено").first(),
        ).toBeVisible()
        await shot(page, `orgStatus-sapphire-${theme}-${width}`)
      })

      test(`contact history extension field sapphire ${theme} ${width}`, async ({
        page,
      }) => {
        test.skip(skip())
        await open(page, seed, width, CONTACT_CARD)
        await page.getByRole("button", { name: "Змінити", exact: true }).click()
        const form = page.getByRole("dialog", { name: /^Змінити контакт/ })
        await form.getByRole("combobox", { name: "Зручний канал" }).click()
        await page.getByRole("option", { name: "Telegram" }).click()
        await form.getByRole("button", { name: "Зберегти" }).click()
        await expect(form).toBeHidden()
        // Вузька картка показує стрічку вкладкою, широка — панеллю поруч.
        const timelineTab = page.getByRole("tab", { name: "Стрічка" })
        if (await timelineTab.isVisible()) await timelineTab.click()
        const change = page
          .locator('[data-slot="audit-change"]')
          .filter({ hasText: "Зручний канал" })
        await expect(change).toContainText("БулоТелефонСталоTelegram")
        // Тост «Зміни збережено» не закриває рядок стрічки на знімку.
        await page
          .getByRole("region", { name: /^Notifications/ })
          .getByRole("button", { name: "Закрити" })
          .click()
        await change.scrollIntoViewIfNeeded()
        await shot(page, `contactHistory-sapphire-${theme}-${width}`)
      })
    }
})
