import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/** Довідка гарячих клавіш і реєстр (0.5e, критерій 16, ADR-0042). */
const HELP_CHUNK = /\/shortcuts-help-list-[\w-]+\.js$/

const help = (page: Page) =>
  page.getByRole("dialog", { name: "Гарячі клавіші" })

const pressedKey = (
  page: Page,
  init: { key: string; code: string; ctrlKey?: boolean },
) =>
  page.evaluate((event) => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        ...event,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, init)

test.describe("довідка клавіш", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("«?» відкриває, Esc закриває, фокус повертається", async ({ page }) => {
    await openWith(page, {}, "/#/primitives")
    const company = page.getByRole("link", { name: "Перейти до вмісту" })
    await company.focus()
    await page.keyboard.press("Shift+?")
    await expect(help(page)).toBeVisible()
    await expect(help(page)).toBeFocused()
    await expect(
      help(page).getByRole("heading", { name: "Таблиця" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(help(page)).toBeHidden()
    await expect(company).toBeFocused()
  })

  test("у полі вводу «?» лишається символом", async ({ page }) => {
    await openWith(page, {}, "/#/primitives")
    const field = page.getByRole("textbox", { name: "Назва компанії" })
    await field.fill("")
    await field.press("Shift+?")
    await expect(field).toHaveValue("?")
    await expect(help(page)).toBeHidden()
  })

  test("команда палітри відкриває довідку, фокус у ній", async ({ page }) => {
    await openWith(page, {}, "/")
    await page.keyboard.press("Control+k")
    const input = page.getByRole("combobox", { name: "Пошук і команди" })
    await input.fill("показати гарячі")
    await page.keyboard.press("Enter")
    await expect(help(page)).toBeVisible()
    await expect(help(page)).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(help(page)).toBeHidden()
  })

  test("вимкнена «?» не відкриває довідку й пам'ятається; повернути можна з палітри", async ({
    page,
  }) => {
    await openWith(page, {}, "/")
    await page.locator("main").focus()
    await page.keyboard.press("Shift+?")
    const toggle = help(page).getByRole("switch", {
      name: "Клавіші на весь застосунок з одним символом, як ?",
    })
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await page.keyboard.press("Escape")
    await expect(help(page)).toBeHidden()

    await page.reload()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.locator("main").focus()
    await page.keyboard.press("Shift+?")
    await expect(help(page)).toBeHidden()

    await page.keyboard.press("Control+k")
    await page
      .getByRole("combobox", { name: "Пошук і команди" })
      .fill("показати гарячі")
    await page.keyboard.press("Enter")
    await expect(toggle).not.toBeChecked()
    await toggle.click()
    await expect(toggle).toBeChecked()
    await page.keyboard.press("Escape")
    await expect(help(page)).toBeHidden()
    await page.locator("main").focus()
    await page.keyboard.press("Shift+?")
    await expect(help(page)).toBeVisible()
  })

  test("чанк не завантажився: «Спробувати ще» в самій довідці", async ({
    page,
  }) => {
    await openWith(page, {}, "/")
    await page
      .context()
      .route(HELP_CHUNK, (route) => route.abort("internetdisconnected"))
    await page.locator("main").focus()
    await page.keyboard.press("Shift+?")
    await expect(help(page).getByRole("alert")).toBeVisible()
    await page.context().unroute(HELP_CHUNK)
    // З клавіатури: кнопка зникне разом зі станом помилки, і фокус не має впасти на body.
    await help(page).getByRole("button", { name: "Спробувати ще" }).focus()
    await page.keyboard.press("Enter")
    await expect(
      help(page).getByRole("switch", {
        name: "Клавіші на весь застосунок з одним символом, як ?",
      }),
    ).toBeVisible()
    await expect(help(page)).toBeFocused()
  })

  test("з палітри: Esc повертає фокус туди, де він був до Ctrl+K", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/primitives")
    const skip = page.getByRole("link", { name: "Перейти до вмісту" })
    await skip.focus()
    await page.keyboard.press("Control+k")
    await page
      .getByRole("combobox", { name: "Пошук і команди" })
      .fill("показати гарячі")
    await page.keyboard.press("Enter")
    await expect(help(page)).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(help(page)).toBeHidden()
    await expect(skip).toBeFocused()
  })

  test("одна кнопка «Закрити», вона видима на телефоні без прокрутки", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page, {}, "/#/shortcuts")
    await page.getByRole("button", { name: "Відкрити довідку" }).click()
    const close = help(page).getByRole("button", { name: "Закрити" })
    await expect(close).toHaveCount(1)
    await expect(close).toBeInViewport({ ratio: 1 })
    // Футер дістає низ діалогу: інакше прокручений текст видно під ним у смузі відступу.
    await expect
      .poll(() =>
        help(page).evaluate((dialog) => {
          const footer = dialog.querySelector('[data-slot="dialog-footer"]')
          const footerBottom = footer?.getBoundingClientRect().bottom ?? 0
          return dialog.getBoundingClientRect().bottom - footerBottom
        }),
      )
      .toBeLessThan(2)
    await close.click()
    await expect(help(page)).toBeHidden()
  })

  test("українська розкладка: Ctrl+K і Ctrl+B за фізичною клавішею", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/primitives")
    await page.locator("main").focus()
    await pressedKey(page, { key: "л", code: "KeyK", ctrlKey: true })
    await expect(
      page.getByRole("dialog", { name: "Палітра команд" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    const sidebar = page.locator('[data-slot="sidebar"][data-state]').first()
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
    await page.locator("main").focus()
    await pressedKey(page, { key: "и", code: "KeyB", ctrlKey: true })
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  })
})

test.describe("сторінка «Гарячі клавіші»", () => {
  for (const [width, height] of [
    [360, 740],
    [768, 1024],
    [1440, 900],
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${String(width)} px, ${theme}: axe, без горизонтальної прокрутки`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ colorScheme: theme })
        await openWith(page, { theme }, "/#/shortcuts")
        await expect(
          page.getByRole("heading", { level: 1, name: "Гарячі клавіші" }),
        ).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)

        await page.getByRole("button", { name: "Відкрити довідку" }).click()
        await expect(
          help(page).getByRole("heading", { name: "Цей застосунок" }),
        ).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)
      })
    }
  }

  test("перемикач у переліку й у діалозі показують той самий стан", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, "/#/shortcuts")
    const main = page.getByRole("main")
    const switches = main.getByRole("switch", {
      name: "Клавіші на весь застосунок з одним символом, як ?",
    })
    await expect(switches).toHaveCount(2)
    await switches.first().click()
    await expect(switches.nth(1)).not.toBeChecked()
    await page.getByRole("button", { name: "Відкрити довідку" }).click()
    await expect(help(page).getByRole("switch")).not.toBeChecked()
  })

  test("англійською: підписи й заголовок", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, { language: "en" }, "/#/shortcuts")
    await page.getByRole("button", { name: "Open the help" }).click()
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" })
    await expect(dialog.getByText("Move to the next cell")).toBeVisible()
  })
})
