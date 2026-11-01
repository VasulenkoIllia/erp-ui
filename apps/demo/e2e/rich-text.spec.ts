import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/** Поле тексту (UI12, ADR-0052): редактор у браузері, згадки, показ чужого документа. */
const PAGE = "/#/rich-text"
const EDITOR_CHUNK = /rich-text-editor[^/]*\.(js|tsx)/

/** Сторінка показує кілька полів і дублює тексти підказкою, тож шукаємо в межах поля форми. */
const form = (page: Page) => page.locator('[data-field-name="body"]')
const note = (page: Page) => page.getByRole("textbox", { name: "Нотатка" })
const mentions = (page: Page) => page.getByRole("listbox")
const popup = (page: Page) => page.locator('[data-slot="rich-text-mentions"]')
const saved = (page: Page) => page.getByTestId("rich-text-saved")
const address = (page: Page) => page.getByLabel("Адреса посилання")

const openPage = async (page: Page) => {
  await openWith(page, {}, PAGE)
  await expect(note(page)).toHaveAttribute("contenteditable", "true")
}

const type = (page: Page, text: string) =>
  page.keyboard.type(text, { delay: 10 })

test.describe("поле тексту", () => {
  test("текст, оформлення й згадка доходять до показу", async ({ page }) => {
    await openPage(page)
    await note(page).click()
    await type(page, "Погоджено ")
    const bold = form(page).getByRole("button", { name: "Жирний" })
    await bold.click()
    await expect(bold).toHaveAttribute("aria-pressed", "true")
    await expect(note(page)).toBeFocused()
    await type(page, "важливе")
    await bold.click()
    // Фокус редактор повертає через кадр: пробіл, надрукований раніше, натиснув би кнопку.
    await expect(note(page)).toBeFocused()
    await type(page, " @Мар")
    // Лише один рядок: це вже відповідь на «Мар», а не попередній список.
    await expect(mentions(page).getByRole("option")).toHaveCount(1)
    await expect(
      mentions(page).getByRole("option", { name: /Марта Шевчук/ }),
    ).toBeVisible()
    await expect(note(page)).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(mentions(page)).toBeHidden()
    await page.getByRole("button", { name: "Зберегти нотатку" }).click()
    const view = saved(page).locator('[data-slot="rich-text-view"]')
    await expect(view.getByText("важливе")).toHaveJSProperty(
      "tagName",
      "STRONG",
    )
    await expect(view.getByText("@Марта Шевчук")).toBeVisible()
    await expect(saved(page).getByText(/Згадано: Марта Шевчук/)).toBeVisible()
    await expect(note(page)).toHaveText("")
  })

  test("список згадок: клавіші, нікого не знайдено, Esc", async ({ page }) => {
    await openPage(page)
    await note(page).click()
    await type(page, "@")
    const options = mentions(page).getByRole("option")
    await expect(options.first()).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("ArrowDown")
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true")
    await expect(note(page)).toHaveAttribute("aria-activedescendant", /.+/)
    await expectNoA11yViolations(page)
    await type(page, "жодноготакого")
    await expect(popup(page).getByText("Нікого не знайдено")).toBeVisible()
    await expect(note(page)).not.toHaveAttribute("aria-activedescendant")
    await page.keyboard.press("Escape")
    await expect(popup(page)).toHaveCount(0)
    await expect(note(page)).toBeFocused()
  })

  test("вибір людини мишею лишає фокус у тексті", async ({ page }) => {
    await openPage(page)
    await page.getByRole("button", { name: "Згадати колегу" }).first().click()
    await expect(note(page)).toBeFocused()
    await type(page, "Мар")
    await page.getByRole("option", { name: /Марта Шевчук/ }).click()
    await expect(note(page)).toContainText("@Марта Шевчук")
    await expect(note(page)).toBeFocused()
  })

  test("збій пошуку людей: повтор знаходить", async ({ page }) => {
    await openPage(page)
    const field = page.getByRole("textbox", {
      name: "Пошук людей не відповідає",
    })
    await field.click()
    await type(page, "@")
    await expect(popup(page).getByText("Не вдалося знайти колег")).toBeVisible()
    await popup(page).getByRole("button", { name: "Спробувати ще" }).click()
    await expect(page.getByRole("option").first()).toBeVisible()
    await expect(field).toBeFocused()
  })

  test("у діалозі перший Esc закриває список, другий закриває діалог", async ({
    page,
  }) => {
    await openPage(page)
    await page.getByRole("button", { name: "Нотатка в діалозі" }).click()
    const dialog = page.getByRole("dialog", { name: "Нотатка до запису" })
    const field = dialog.getByRole("textbox", { name: "Нотатка до запису" })
    await expect(field).toHaveAttribute("contenteditable", "true")
    await field.click()
    await type(page, "@")
    await expect(mentions(page).getByRole("option").first()).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(mentions(page)).toBeHidden()
    await expect(dialog).toBeVisible()
    await expect(field).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })

  test("вихід із поля закриває список згадок", async ({ page }) => {
    await openPage(page)
    await note(page).click()
    await type(page, "@жодноготакого")
    await expect(popup(page).getByText("Нікого не знайдено")).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(note(page)).not.toBeFocused()
    await expect(popup(page)).toHaveCount(0)
  })

  test("Shift+Tab при відкритому списку не вставляє людину", async ({
    page,
  }) => {
    await openPage(page)
    await note(page).click()
    await type(page, "@")
    await expect(mentions(page).getByRole("option").first()).toBeVisible()
    await page.keyboard.press("Shift+Tab")
    await expect(note(page)).not.toBeFocused()
    await expect(mentions(page)).toBeHidden()
    await expect(
      note(page).locator('[data-slot="rich-text-mention"]'),
    ).toHaveCount(0)
  })

  test("Tab у списку виводить із поля й не міняє документ", async ({
    page,
  }) => {
    await openPage(page)
    const field = page.getByRole("textbox", { name: "Вузьке місце" })
    await expect(field).toHaveAttribute("contenteditable", "true")
    await field.getByText("узгодити доставку").click()
    await page.keyboard.press("Tab")
    await expect(field).not.toBeFocused()
    await expect(field.locator("ul ul")).toHaveCount(0)
  })

  test("посилання: небезпечна адреса відхиляється, безпечна стає посиланням", async ({
    page,
  }) => {
    await openPage(page)
    await note(page).click()
    await type(page, "договір")
    await page.keyboard.press("ControlOrMeta+a")
    await page.getByRole("button", { name: "Посилання" }).first().click()
    await expect(address(page)).toBeFocused()
    await expectNoA11yViolations(page)
    await address(page).fill("javascript:alert(1)")
    await page.keyboard.press("Enter")
    await expect(page.getByText("Вкажіть адресу")).toBeVisible()
    await expect(address(page)).toHaveValue("javascript:alert(1)")
    await expect(note(page).getByRole("link")).toHaveCount(0)
    await address(page).fill("docs.example/contract")
    await page.keyboard.press("Enter")
    await expect(note(page).getByRole("link")).toHaveAttribute(
      "href",
      "https://docs.example/contract",
    )
    await expect(address(page)).toBeHidden()
    await expect(note(page)).toBeFocused()
  })

  test("вставлене посилання приносить лише адресу", async ({ page }) => {
    await openPage(page)
    await note(page).click()
    await page.evaluate(() => {
      const clipboardData = new DataTransfer()
      clipboardData.setData(
        "text/html",
        '<a href="https://docs.example/a" class="fixed inset-0" title="Підміна" target="_self">договір</a>',
      )
      document.activeElement?.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    const link = note(page).getByRole("link", { name: "договір" })
    await expect(link).toHaveAttribute("href", "https://docs.example/a")
    await expect(link).toHaveAttribute("target", "_blank")
    await expect(link).not.toHaveAttribute("class", /.*/)
    await expect(link).not.toHaveAttribute("title", /.*/)
  })

  test("Esc закриває вікно посилання одразу, курсор лишається над кнопкою", async ({
    page,
  }) => {
    await openPage(page)
    await note(page).click()
    await page.getByRole("button", { name: "Посилання" }).first().click()
    await expect(address(page)).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(address(page)).toBeHidden()
    await expect(note(page)).toBeFocused()
  })

  test("фокус у вікні посилання не показує помилку порожнього поля", async ({
    page,
  }) => {
    await openPage(page)
    await note(page).click()
    const link = form(page).getByRole("button", { name: "Посилання" })
    const error = form(page).getByText("Напишіть текст нотатки")
    await link.click()
    await expect(address(page)).toBeFocused()
    await expect(error).toHaveCount(0)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await expect(address(page)).toBeHidden()
    await expect(note(page)).toBeFocused()
    await expect(error).toHaveCount(0)
  })

  test("у діалозі Esc закриває вікно посилання, а діалог лишається", async ({
    page,
  }) => {
    await openPage(page)
    await page.getByRole("button", { name: "Нотатка в діалозі" }).click()
    const dialog = page.getByRole("dialog", { name: "Нотатка до запису" })
    await dialog.getByRole("button", { name: "Посилання" }).click()
    await expect(address(page)).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(address(page)).toBeHidden()
    await expect(dialog).toBeVisible()
  })

  test("обов'язкове поле: помилка біля поля, фокус, виправлення", async ({
    page,
  }) => {
    await openPage(page)
    await page.getByRole("button", { name: "Зберегти нотатку" }).click()
    const error = form(page).getByText("Напишіть текст нотатки")
    await expect(error).toBeVisible()
    await expect(note(page)).toHaveAttribute("aria-invalid", "true")
    await expect(note(page)).toBeFocused()
    await type(page, "текст")
    await expect(error).toBeHidden()
  })

  test("клік по підпису ставить фокус у текст", async ({ page }) => {
    await openPage(page)
    await page.getByText("Нотатка", { exact: true }).first().click()
    await expect(note(page)).toBeFocused()
  })

  test("показ: чужий документ без небезпечних елементів", async ({ page }) => {
    await openPage(page)
    const hostile = page.getByTestId("rich-text-hostile")
    await expect(hostile.getByRole("link")).toHaveCount(0)
    await expect(hostile.locator("img, script, h1")).toHaveCount(0)
    await expect(hostile).toContainText("<img src=x onerror=alert(1)>")
    await expect(page.getByTestId("rich-text-empty")).toHaveText("—")
  })

  test("лише читання в порядку Tab, вимкнено поза ним", async ({ page }) => {
    await openPage(page)
    const readOnly = page.getByRole("textbox", { name: "Лише читання" })
    await readOnly.focus()
    await expect(readOnly).toBeFocused()
    await expect(
      page.getByRole("textbox", { name: "Вимкнено" }),
    ).not.toHaveAttribute("tabindex", /.*/)
  })

  test("вузьке місце й телефон без горизонтальної прокрутки", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openPage(page)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })

  test("редактор вантажиться лише там, де поле можна змінювати", async ({
    page,
  }) => {
    const chunks: string[] = []
    page.on("request", (request) => {
      if (EDITOR_CHUNK.test(request.url())) chunks.push(request.url())
    })
    await openWith(page, {}, "/#/primitives")
    expect(chunks).toEqual([])
    await page.goto(PAGE)
    await expect(note(page)).toHaveAttribute("contenteditable", "true")
    expect(chunks.length).toBeGreaterThan(0)
  })

  test("чанк редактора не завантажився: текст видно, повтор працює", async ({
    page,
  }) => {
    let blocked = true
    // Контекст, а не сторінка: запити чанків ідуть через сервіс-воркер моків.
    await page
      .context()
      .route(EDITOR_CHUNK, (route) =>
        blocked ? route.abort("internetdisconnected") : route.continue(),
      )
    await openWith(page, {}, PAGE)
    await expect(
      page.getByText(/Не вдалося завантажити редактор/).first(),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    blocked = false
    await page.getByRole("button", { name: "Спробувати ще" }).first().click()
    await expect(note(page)).toHaveAttribute("contenteditable", "true")
  })
})
