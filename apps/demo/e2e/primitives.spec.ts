import { expect, test } from "@playwright/test"

import { expectNoA11yViolations, openWith } from "./helpers"

const PATH = "/#/primitives"
const PALETTES = [
  "sapphire",
  "graphite",
  "indigo",
  "teal",
  "terracotta",
] as const
const THEMES = ["light", "dark"] as const
const DENSITIES = ["comfortable", "compact"] as const

test.describe("примітиви: axe", () => {
  for (const palette of PALETTES)
    for (const theme of THEMES)
      for (const density of DENSITIES)
        test(`${palette} ${theme} ${density}`, async ({ page }) => {
          await page.setViewportSize({ width: 1440, height: 900 })
          await openWith(page, { palette, theme, density }, PATH)
          await expectNoA11yViolations(page)
        })

  for (const width of [360, 768] as const)
    for (const theme of THEMES)
      test(`${width}px ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await openWith(page, { palette: "sapphire", theme }, PATH)
        await expectNoA11yViolations(page)
      })
})

test.describe("примітиви: поведінка", () => {
  // Окремі тести: перехід на ту саму адресу з # не перезавантажує сторінку.
  for (const [density, control, row] of [
    ["comfortable", 36, 44],
    ["compact", 32, 32],
  ] as const)
    test(`щільність ${density}: контроли ${control} px, рядки таблиці ${row} px`, async ({
      page,
    }) => {
      await openWith(page, { density }, PATH)
      const input = page.getByLabel("Назва компанії")
      const button = page.getByRole("button", { name: "Створити рахунок" })
      const row1 = page.getByRole("row").nth(1)
      expect((await input.boundingBox())?.height).toBeCloseTo(control, 0)
      expect((await button.boundingBox())?.height).toBeCloseTo(control, 0)
      expect((await row1.boundingBox())?.height).toBeCloseTo(row, 0)
    })

  test("діалог: відкривається з клавіатури, Esc закриває, фокус повертається", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const trigger = page.getByRole("button", { name: "Видалити рахунок…" })
    await trigger.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", {
      name: "Видалити рахунок № 2026-0142?",
    })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Видалити рахунок" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("шторка фільтрів має кнопку «Закрити» українською", async ({ page }) => {
    await openWith(page, {}, PATH)
    await page.getByRole("button", { name: "Фільтри" }).click()
    const sheet = page.getByRole("dialog", { name: "Фільтри" })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("button", { name: "Закрити" }).click()
    await expect(sheet).toBeHidden()
  })

  test("недоступна дія — у фокусі й пояснює причину (SPEC §8.4)", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const action = page.getByRole("button", { name: "Недоступно" })
    await expect(action).toHaveAttribute("aria-disabled", "true")
    await action.focus()
    await expect(action).toBeFocused()
    await expect(
      page.getByText("Доступно для ролі «Бухгалтер»", { exact: true }),
    ).toBeVisible()
  })

  test("тост із «Скасувати» лишається, доки з ним не взаємодіють", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    await page.getByRole("button", { name: "Архівувати" }).click()
    const undo = page.getByRole("button", { name: "Скасувати" })
    await expect(undo).toBeVisible()
    await page.waitForTimeout(4500)
    await expect(undo).toBeVisible()
  })
})
