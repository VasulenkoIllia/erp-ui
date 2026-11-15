import { expect, test, type Page } from "@playwright/test"

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

/** Чи влучає точка на `dx` px ліворуч від прапорця «Платник ПДВ» у нього самого (зона натиску). */
async function checkboxHits(page: Page) {
  const checkbox = page.getByRole("checkbox", { name: "Платник ПДВ" })
  // elementFromPoint бачить лише видиму частину сторінки.
  await checkbox.scrollIntoViewIfNeeded()
  const box = await checkbox.boundingBox()
  if (!box) throw new Error("прапорця не видно")
  return (dx: number) =>
    page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x, y)?.closest("[data-slot=checkbox]") !=
        null,
      [box.x - dx, box.y + box.height / 2] as const,
    )
}

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

  test("з мишею зона прапорця — 40 × 32 px основи, без зони дотику 44 px", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const hits = await checkboxHits(page)
    expect(await hits(10)).toBe(true)
    expect(await hits(13)).toBe(false)
  })

  test("з мишею текст поля й коментаря — 14 px і на вузькому вікні", async ({
    page,
  }) => {
    // Розмір тексту залежить від вказівника, а не від ширини (ADR-0096 п. 3).
    await page.setViewportSize({ width: 390, height: 844 })
    await openWith(page, {}, PATH)
    await expect(page.getByLabel("Назва компанії")).toHaveCSS(
      "font-size",
      "14px",
    )
    await expect(
      page.getByRole("textbox", { name: "Коментар до рахунку" }),
    ).toHaveCSS("font-size", "14px")
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

  test("англійською підпис «Закрити» береться з рядків кіта", async ({
    page,
  }) => {
    await openWith(page, { language: "en" }, PATH)
    await page.getByRole("button", { name: "Filters" }).click()
    const sheet = page.getByRole("dialog", { name: "Filters" })
    await sheet.getByRole("button", { name: "Close" }).click()
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

test.describe("примітиви: дотиковий планшет", () => {
  // hasTouch — основний вказівник «грубий» (pointer: coarse), як на iPad.
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true })

  test("текст поля й коментаря — 16 px: сторінка не збільшується на фокусі", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    await expect(page.getByLabel("Назва компанії")).toHaveCSS(
      "font-size",
      "16px",
    )
    await expect(
      page.getByRole("textbox", { name: "Коментар до рахунку" }),
    ).toHaveCSS("font-size", "16px")
  })

  // Зона дотику прапорця — touch-target: ≥ --touch-min, 44 px у звичайній щільності, 24 px у компактній
  // (тоді лишається 40 × 32 px основи: 12 px ліворуч).
  for (const [density, reachesFar] of [
    ["comfortable", true],
    ["compact", false],
  ] as const)
    test(`прапорець у щільності ${density}: зона дотику ${reachesFar ? 44 : 24} px`, async ({
      page,
    }) => {
      await openWith(page, { density }, PATH)
      const hits = await checkboxHits(page)
      expect(await hits(3)).toBe(true)
      expect(await hits(13)).toBe(reachesFar)
    })
})
