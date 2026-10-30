import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

import { USERS, openWith, type AppearanceSeed } from "./helpers"

// Крок 1.4b2b (ADR-0028): адреси й рахунки в картці організації B1 — меню рядка, форма адреси з
// помилкою індексу, форма рахунку з помилкою IBAN, видалення основного рахунку, лише читання без
// права. Набір і теки — як у visual.spec.ts (SCREENSHOT_PAGES=contactsDetails, SCREENSHOTS_DIR).
const repoRoot = path.resolve(import.meta.dirname, "../../..")
const shotsDir = path.resolve(
  repoRoot,
  process.env.SCREENSHOTS_DIR ?? "apps/demo/test-results/screenshots",
)
const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 }
const THEMES = ["light", "dark"] as const
const WIDTHS = [390, 768, 1440] as const
const TWO_ADDRESSES = "/#/m/B1/organizations/org-002"
const TWO_ACCOUNTS = "/#/m/B1/organizations/org-003"
const FIRST_IBAN = "UA11 3005 2800 0026 0000 0000 5253 5"
const skip = () =>
  Boolean(process.env.SCREENSHOT_PAGES) &&
  !process.env.SCREENSHOT_PAGES?.split(",").includes("contactsDetails")

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
  user: string = USERS.accountant,
) {
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 })
  await openWith(page, seed, target, { user })
}

const dialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true })

test.describe("скриншоти кроку 1.4b2b @screenshots", () => {
  for (const theme of THEMES)
    for (const width of WIDTHS) {
      const seed = { palette: "sapphire", theme } as const

      test(`addresses menu sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, `${TWO_ADDRESSES}?tab=addresses`)
        await page
          .getByRole("button", {
            name: "Дії: Юридична, просп. Свободи, 8",
            exact: true,
          })
          .click()
        await expect(
          page.getByRole("menuitem", { name: "Видалити" }),
        ).toBeVisible()
        await shot(
          page,
          `contacts-details-addresses-sapphire-${theme}-${width}`,
        )
      })

      test(`address form sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, `${TWO_ADDRESSES}?tab=addresses`)
        await page.getByRole("button", { name: "Додати адресу" }).click()
        const form = dialog(page, "Нова адреса")
        await form
          .getByRole("textbox", { name: "Вулиця, будинок, офіс" })
          .fill("а/с 15")
        const postalCode = form.getByRole("textbox", { name: "Індекс" })
        await postalCode.fill("790")
        await postalCode.blur()
        await expect(postalCode).toHaveAttribute("aria-invalid", "true")
        await shot(
          page,
          `contacts-details-address-form-sapphire-${theme}-${width}`,
        )
      })

      test(`account form sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, `${TWO_ACCOUNTS}?tab=bankAccounts`)
        await page.getByRole("button", { name: "Додати рахунок" }).click()
        const form = dialog(page, "Новий рахунок")
        await form
          .getByRole("textbox", { name: "IBAN" })
          .fill("UA113005280000260000000052530")
        await form.getByRole("button", { name: "Додати" }).click()
        await expect(
          form.getByRole("textbox", { name: "IBAN" }),
        ).toHaveAttribute("aria-invalid", "true")
        await shot(
          page,
          `contacts-details-account-form-sapphire-${theme}-${width}`,
        )
      })

      test(`delete primary sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(page, seed, width, `${TWO_ACCOUNTS}?tab=bankAccounts`)
        await page
          .getByRole("button", { name: `Дії: ${FIRST_IBAN}`, exact: true })
          .click()
        await page.getByRole("menuitem", { name: "Видалити" }).click()
        await expect(
          page.getByRole("alertdialog", { name: "Видалити рахунок?" }),
        ).toBeVisible()
        await shot(
          page,
          `contacts-details-delete-primary-sapphire-${theme}-${width}`,
        )
      })

      test(`read only sapphire ${theme} ${width}`, async ({ page }) => {
        test.skip(skip())
        await open(
          page,
          seed,
          width,
          `${TWO_ACCOUNTS}?tab=bankAccounts`,
          USERS.lead,
        )
        await expect(
          page.getByRole("button", { name: "Додати рахунок" }),
        ).toHaveAttribute("aria-disabled", "true")
        // На телефоні рахунки — картками, а не гридом.
        await expect(page.getByText("2 рахунки", { exact: true })).toBeVisible()
        await shot(page, `contacts-details-readonly-sapphire-${theme}-${width}`)
      })
    }
})
