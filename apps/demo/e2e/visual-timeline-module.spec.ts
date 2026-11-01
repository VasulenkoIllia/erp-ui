import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { chooseScenario, openWith, type AppearanceSeed } from "./helpers"

// Крок N1d (ADR-0054): «Мої справи», стрічка на картках контакту й рахунку, проект без пошти.
// Набір — для звіту кроку (SCREENSHOT_PAGES=timeline-module, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const MY_ACTIVITIES = "/#/m/N1/my-activities"
const CONTACT_CARD = "/#/m/B1/contacts/contact-001"
const INVOICE_CARD = "/#/data/inv-00001"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("timeline-module")

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

/** Вузька картка показує стрічку вкладкою, широка — панеллю поруч. */
async function showTimeline(page: Page) {
  const timelineTab = page.getByRole("tab", { name: "Стрічка" })
  const noteField = page.getByRole("textbox", { name: "Нотатка для команди" })
  await expect(timelineTab.or(noteField)).toBeVisible()
  if (await timelineTab.isVisible()) await timelineTab.click()
  await expect(noteField).toHaveAttribute("contenteditable", "true")
}

for (const width of WIDTHS)
  for (const theme of THEMES)
    test(`@screenshots модуль стрічки ${String(width)} ${theme}`, async ({
      page,
    }) => {
      test.skip(skip())
      const seed: AppearanceSeed = { palette: "sapphire", theme }
      const suffix = `${String(width)}-${theme}`
      await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
      const rows = page
        .getByRole("list", { name: "Мої заплановані дії" })
        .getByRole("listitem")

      await openWith(page, seed, MY_ACTIVITIES)
      await expect(rows.first()).toBeVisible()
      await shot(page, `n1d-my-activities-${suffix}`)

      await page.getByRole("tab", { name: "Прострочені" }).click()
      await expect(rows.filter({ hasNotText: "Прострочено" })).toHaveCount(0)
      await shot(page, `n1d-overdue-${suffix}`)

      await openWith(page, seed, CONTACT_CARD)
      await showTimeline(page)
      await shot(page, `n1d-contact-${suffix}`)

      await openWith(page, seed, INVOICE_CARD)
      await showTimeline(page)
      await shot(page, `n1d-invoice-${suffix}`)

      await openWith(page, seed, "/#/timeline")
      const noMail = page.getByTestId("timeline-no-mail")
      await expect(
        noMail.getByRole("textbox", { name: "Нотатка для команди" }),
      ).toHaveAttribute("contenteditable", "true")
      await noMail.scrollIntoViewIfNeeded()
      await shot(page, `n1d-no-mail-${suffix}`)

      await openWith(page, seed, MY_ACTIVITIES)
      await chooseScenario(page, "Порожньо")
      await page.reload()
      await expect(page.getByText("Справ немає")).toBeVisible()
      await shot(page, `n1d-empty-${suffix}`)
    })
