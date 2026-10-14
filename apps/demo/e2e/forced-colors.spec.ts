import { expect, test, type Page } from "@playwright/test"

import { openWith } from "./helpers"

/**
 * Режим високої контрастності Windows (forced-colors) і зменшений рух (SPEC §10, крок 0.5d).
 * У forced-colors тіні й тло зникають, тож фокус-кільце (box-shadow) не видно — потрібен контур.
 */

/** Контур активного елемента: стиль і товщина. */
const focusOutline = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return null
    const style = getComputedStyle(element)
    return {
      element: `${element.tagName.toLowerCase()}${element.getAttribute("data-slot") ? `[${element.getAttribute("data-slot") ?? ""}]` : ""}`,
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
    }
  })

async function expectVisibleFocus(page: Page) {
  const outline = await focusOutline(page)
  expect(outline, "фокус на елементі сторінки").not.toBeNull()
  expect(outline?.style, JSON.stringify(outline)).not.toBe("none")
  expect(outline?.width, JSON.stringify(outline)).toBeGreaterThanOrEqual(2)
}

test.describe("forced-colors і зменшений рух", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" })
  })

  test("кожен елемент у фокусі з клавіатури має контур", async ({ page }) => {
    await openWith(page, {}, "/#/fields")
    const seen = new Set<string>()
    const tabAndCheck = async (times: number) => {
      for (let i = 0; i < times; i++) {
        await page.keyboard.press("Tab")
        await expectVisibleFocus(page)
        const outline = await focusOutline(page)
        if (outline) seen.add(outline.element)
      }
    }
    // Шапка й бічна панель.
    await tabAndCheck(8)
    // Вміст сторінки: «Перейти до вмісту» переносить фокус на <main>.
    await page.reload()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")
    await tabAndCheck(12)
    // Пройшли посилання, кнопки й поля, а не лише один тип елементів.
    expect([...seen]).toEqual(
      expect.arrayContaining([
        "a",
        "button[popover-trigger]",
        "input[input-group-control]",
      ]),
    )
  })

  test("календар: день у фокусі й вибраний день мають контур", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/fields")
    await page
      .locator("[data-slot=field]")
      .filter({ hasText: "Дата договору" })
      .getByRole("button", { name: "Вибрати в календарі" })
      .click()
    const popover = page.getByRole("dialog")
    await expect(
      popover.getByRole("button", { name: /13 жовтня, вибрано/ }),
    ).toBeFocused()
    await expectVisibleFocus(page)
    await page.keyboard.press("ArrowRight")
    await expectVisibleFocus(page)
    // Фокус пішов, а вибраний день лишається позначеним контуром.
    const selected = await popover
      .getByRole("button", { name: /13 жовтня, вибрано/ })
      .evaluate((element) => getComputedStyle(element).outlineStyle)
    expect(selected).not.toBe("none")
  })

  test("підсвічений пункт меню має контур", async ({ page }) => {
    await openWith(page, {}, "/#/fields")
    const menu = page.getByRole("button", { name: /Меню користувача/ })
    await menu.focus()
    await page.keyboard.press("Enter")
    // Перший пункт підсвічено, фокус — на ньому; стрілка переводить підсвічування далі.
    await page.keyboard.press("ArrowDown")
    const item = page.getByRole("menu").locator("[data-highlighted]")
    await expect(item).toHaveCount(1)
    expect(
      await item.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none")
  })

  test("діалог і поле форми: контур фокуса, без анімацій", async ({ page }) => {
    await openWith(page, {}, "/#/forms")
    await page.getByRole("button", { name: "Видалити 3 рахунки" }).focus()
    await expectVisibleFocus(page)
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("alertdialog", {
      name: "Видалити 3 рахунки?",
    })
    await expect(dialog).toBeVisible()
    // prefers-reduced-motion: появу діалогу не анімовано (тривалість ≤ 1 мс).
    const durations = await page.evaluate(() =>
      document
        .getAnimations()
        .map((animation) =>
          Number(animation.effect?.getComputedTiming().duration ?? 0),
        ),
    )
    expect(
      durations.every((ms) => ms <= 1),
      String(durations),
    ).toBe(true)
    await page.keyboard.press("Tab")
    await expectVisibleFocus(page)
    await page.keyboard.press("Escape")

    await page.getByRole("textbox", { name: "Номер рахунку" }).focus()
    await expectVisibleFocus(page)
  })
})
