import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/** Поле тексту (UI12, ADR-0052): редактор у браузері, згадки, показ чужого документа. */
const PAGE = "/#/rich-text"
const EDITOR_CHUNK = /rich-text-editor[^/]*\.(js|tsx)/

const note = (page: Page) => page.getByRole("textbox", { name: "Нотатка" })
const mentions = (page: Page) => page.getByRole("listbox")
const saved = (page: Page) => page.getByTestId("rich-text-saved")

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
    await page.getByRole("button", { name: "Жирний" }).click()
    await expect(page.getByRole("button", { name: "Жирний" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await type(page, "важливе")
    await page.getByRole("button", { name: "Жирний" }).click()
    await type(page, " @Мар")
    await expect(
      mentions(page).getByRole("option", { name: /Марта Шевчук/ }),
    ).toBeVisible()
    await expect(note(page)).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(mentions(page)).toBeHidden()
    await page.getByRole("button", { name: "Зберегти нотатку" }).click()
    await expect(saved(page).getByText("важливе")).toHaveJSProperty(
      "tagName",
      "STRONG",
    )
    await expect(saved(page).getByText("@Марта Шевчук")).toBeVisible()
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
    await expect(page.getByText("Нікого не знайдено")).toBeVisible()
    await expect(note(page)).not.toHaveAttribute("aria-activedescendant")
    await page.keyboard.press("Escape")
    await expect(page.getByText("Нікого не знайдено")).toBeHidden()
    await expect(note(page)).toBeFocused()
  })

  test("вибір людини мишею лишає фокус у тексті", async ({ page }) => {
    await openPage(page)
    await page.getByRole("button", { name: "Згадати колегу" }).first().click()
    await expect(note(page)).toBeFocused()
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
    await expect(page.getByText("Не вдалося знайти колег")).toBeVisible()
    await page.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(page.getByRole("option").first()).toBeVisible()
    await expect(field).toBeFocused()
  })

  test("посилання: небезпечна адреса відхиляється, безпечна стає посиланням", async ({
    page,
  }) => {
    await openPage(page)
    await note(page).click()
    await type(page, "договір")
    await page.keyboard.press("ControlOrMeta+a")
    await page.getByRole("button", { name: "Посилання" }).first().click()
    const address = page.getByLabel("Адреса посилання")
    await expect(address).toBeFocused()
    await address.fill("javascript:alert(1)")
    await page.keyboard.press("Enter")
    await expect(page.getByText("Вкажіть адресу")).toBeVisible()
    await expect(address).toHaveValue("javascript:alert(1)")
    await expect(note(page).getByRole("link")).toHaveCount(0)
    await address.fill("docs.example/contract")
    await page.keyboard.press("Enter")
    await expect(note(page).getByRole("link")).toHaveAttribute(
      "href",
      "https://docs.example/contract",
    )
    await expect(address).toBeHidden()
    await expect(note(page)).toBeFocused()
  })

  test("Esc закриває вікно посилання одразу, курсор лишається над кнопкою", async ({
    page,
  }) => {
    await openPage(page)
    await note(page).click()
    await page.getByRole("button", { name: "Посилання" }).first().click()
    const address = page.getByLabel("Адреса посилання")
    await expect(address).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(address).toBeHidden()
    await expect(note(page)).toBeFocused()
  })

  test("обов'язкове поле: помилка біля поля, фокус, виправлення", async ({
    page,
  }) => {
    await openPage(page)
    await page.getByRole("button", { name: "Зберегти нотатку" }).click()
    await expect(page.getByText("Напишіть текст нотатки")).toBeVisible()
    await expect(note(page)).toHaveAttribute("aria-invalid", "true")
    await expect(note(page)).toBeFocused()
    await type(page, "текст")
    await expect(page.getByText("Напишіть текст нотатки")).toBeHidden()
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
    await page.route(EDITOR_CHUNK, (route) =>
      blocked ? route.abort() : route.continue(),
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
