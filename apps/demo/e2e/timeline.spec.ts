import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/** Стрічка запису (UI01, PF05, ADR-0053): записи, дії, підписники, канал подій і сценарії моків. */
const PAGE = "/#/timeline"

const full = (page: Page) => page.getByTestId("timeline-full")
const composer = (page: Page) =>
  full(page).locator('[data-slot="timeline-composer"]')
const entries = (page: Page) =>
  full(page).locator('[data-slot="timeline-entry"]')
const noteField = (page: Page) =>
  composer(page).getByRole("textbox", { name: "Нотатка для команди" })
const addNote = (page: Page) =>
  composer(page).getByRole("button", { name: "Додати нотатку" })
const entryMenu = (page: Page, index = 0) =>
  entries(page)
    .nth(index)
    .getByRole("button", { name: /Дії із записом/ })

const openPage = async (page: Page) => {
  await openWith(page, {}, PAGE)
  await expect(noteField(page)).toHaveAttribute("contenteditable", "true")
  await expect(entries(page).first()).toBeVisible()
}

const type = (page: Page, text: string) =>
  page.keyboard.type(text, { delay: 10 })

test.describe("стрічка запису", () => {
  test("нотатка: лише для команди, поле порожнє після відповіді", async ({
    page,
  }) => {
    await openPage(page)
    await expect(composer(page)).toHaveAttribute("data-kind", "note")
    await noteField(page).click()
    await type(page, "Клієнт погодив суму")
    await addNote(page).click()
    const first = entries(page).first()
    await expect(first).toHaveAttribute("data-kind", "note")
    await expect(first).toContainText("Клієнт погодив суму")
    await expect(first).toContainText("Нотатка, бачить лише команда")
    await expect(noteField(page)).toHaveText("")
    await expect(noteField(page)).toBeFocused()
  })

  test("повідомлення: сервер надсилає, вид повертається до нотатки", async ({
    page,
  }) => {
    await openPage(page)
    await full(page).getByRole("tab", { name: "Повідомлення" }).click()
    await expect(composer(page)).toHaveAttribute("data-kind", "message")
    await composer(page)
      .getByRole("textbox", { name: "Повідомлення клієнту" })
      .click()
    await type(page, "Надсилаю реквізити")
    await composer(page)
      .getByRole("button", { name: "Надіслати клієнту" })
      .click()
    const first = entries(page).first()
    await expect(first).toHaveAttribute("data-kind", "message")
    await expect(first).toContainText("Надсилаю реквізити")
    await expect(first.getByText("Надіслано")).toBeVisible()
    await expect(composer(page)).toHaveAttribute("data-kind", "note")
  })

  test("збій надсилання: текст лишається, повтор доходить", async ({
    page,
  }) => {
    await openPage(page)
    await noteField(page).click()
    await type(page, "Важливий текст")
    await chooseScenario(page, "Помилка сервера")
    await addNote(page).click()
    await expect(composer(page).getByRole("alert")).toBeVisible()
    await expect(noteField(page)).toHaveText("Важливий текст")
    await chooseScenario(page, "Успіх")
    await addNote(page).click()
    await expect(entries(page).first()).toContainText("Важливий текст")
    await expect(noteField(page)).toHaveText("")
  })

  test("свою нотатку можна змінити й видалити, чужу ні", async ({ page }) => {
    await openPage(page)
    await entryMenu(page).click()
    await page.getByRole("menuitem", { name: "Змінити" }).click()
    const editor = full(page).getByRole("textbox", { name: "Текст нотатки" })
    await expect(editor).toBeFocused()
    await type(page, " Дописано.")
    await entries(page)
      .first()
      .getByRole("button", { name: "Зберегти" })
      .click()
    await expect(editor).toBeHidden()
    await expect(entries(page).first()).toContainText("Дописано.")
    await expect(entries(page).first()).toContainText("змінено")

    await entryMenu(page).click()
    await page.getByRole("menuitem", { name: "Видалити" }).click()
    const count = await entries(page).count()
    const dialog = page.getByRole("dialog", { name: "Видалити нотатку?" })
    await dialog.getByRole("button", { name: "Видалити нотатку" }).click()
    await expect(entries(page)).toHaveCount(count - 1)

    const foreign = entries(page).filter({ hasText: "загальну пошту" })
    await foreign.getByRole("button", { name: /Дії із записом/ }).click()
    await expect(
      page.getByRole("menuitem", { name: "Змінити" }),
    ).toHaveAttribute("aria-disabled", "true")
  })

  test("чужа версія нотатки: «зберегти мої зміни» доходить", async ({
    page,
  }) => {
    await openPage(page)
    await chooseScenario(page, "Конфлікт збереження")
    await entryMenu(page).click()
    await page.getByRole("menuitem", { name: "Змінити" }).click()
    const editor = full(page).getByRole("textbox", { name: "Текст нотатки" })
    await expect(editor).toBeFocused()
    await type(page, " Моє.")
    await entries(page)
      .first()
      .getByRole("button", { name: "Зберегти" })
      .click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Зберегти мої зміни" }).click()
    await expect(dialog).toBeHidden()
    await expect(editor).toBeHidden()
    await expect(entries(page).first()).toContainText("Моє.")
  })

  test("файл стає записом стрічки з посиланням", async ({ page }) => {
    await openPage(page)
    await full(page)
      .getByTestId("timeline-file-input")
      .setInputFiles({
        name: "договір.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("вміст"),
      })
    const first = entries(page).first()
    await expect(first).toHaveAttribute("data-kind", "file")
    await expect(
      first.getByRole("link", { name: /договір\.pdf/ }),
    ).toBeVisible()
  })

  test("фільтр вузить стрічку, поле лишається", async ({ page }) => {
    await openPage(page)
    await noteField(page).click()
    await type(page, "Чернетка")
    await full(page).getByRole("combobox", { name: "Що показати" }).click()
    await page.getByRole("option", { name: "Файли" }).click()
    await expect(entries(page)).toHaveCount(1)
    await expect(entries(page).first()).toHaveAttribute("data-kind", "file")
    await expect(noteField(page)).toHaveText("Чернетка")
  })

  test("подія каналу приносить чужі записи без перезавантаження", async ({
    page,
  }) => {
    await openPage(page)
    await page.getByRole("button", { name: "Колега пише нотатку" }).click()
    await expect(entries(page).first()).toContainText("Домовилась із клієнтом")
    await page.getByRole("button", { name: "Клієнт відповідає" }).click()
    await expect(entries(page).first()).toContainText("Оплатимо цього тижня")
    await expect(entries(page).first()).toHaveAttribute("data-kind", "message")
    await page.getByRole("button", { name: "Змінити рахунок" }).click()
    await expect(entries(page).first()).toHaveAttribute("data-kind", "change")
  })

  test("дія: запланувати, виконати, у стрічці лишається запис", async ({
    page,
  }) => {
    await openPage(page)
    await expect(full(page).getByText("Прострочено")).toBeVisible()
    await full(page).getByRole("button", { name: "Запланувати" }).click()
    const dialog = page.getByRole("dialog", { name: "Запланувати дію" })
    await dialog.getByLabel("Що зробити").fill("Перевірити оплату")
    await dialog.getByRole("button", { name: "Зберегти дію" }).click()
    await expect(dialog).toBeHidden()
    const done = full(page).getByRole("button", {
      name: "Виконано: Перевірити оплату",
    })
    await done.click()
    await expect(done).toBeHidden()
    const first = entries(page).first()
    await expect(first).toHaveAttribute("data-kind", "activity")
    await expect(first).toContainText("Перевірити оплату")
  })

  test("підписники: стежити, не стежити, прибрати колегу", async ({ page }) => {
    await openPage(page)
    const follow = full(page).getByRole("button", {
      name: "Стежити",
      exact: true,
    })
    const unfollow = full(page).getByRole("button", {
      name: "Не стежити",
      exact: true,
    })
    await unfollow.click()
    await follow.click()
    await expect(unfollow).toBeVisible()
    await full(page)
      .getByRole("button", { name: /\d підписник/ })
      .click()
    const dialog = page.getByRole("dialog", { name: "Підписники" })
    await dialog.getByRole("button", { name: "Прибрати Марта Шевчук" }).click()
    await expect(dialog.getByText("Марта Шевчук")).toBeHidden()
  })

  test("лише перегляд: записи видно, дій і поля немає", async ({ page }) => {
    await openPage(page)
    const closed = page.getByTestId("timeline-read-only")
    await expect(closed.getByText(/лише для перегляду:/)).toBeVisible()
    await expect(closed.locator('[data-slot="timeline-entry"]')).toHaveCount(1)
    await expect(closed.getByRole("textbox")).toHaveCount(0)
    await expect(
      closed.getByRole("button", { name: /Дії із записом/ }),
    ).toHaveCount(0)
  })

  test("порожньо у вузькій колонці: дія веде в поле", async ({ page }) => {
    await openPage(page)
    const narrow = page.getByTestId("timeline-narrow")
    await narrow.getByRole("button", { name: "Написати нотатку" }).click()
    await expect(
      narrow.getByRole("textbox", { name: "Нотатка для команди" }),
    ).toBeFocused()
    await expect(narrow.getByRole("tab")).toHaveCount(0)
    await expect(
      narrow.getByRole("button", { name: "Додати файл" }),
    ).toHaveCount(0)
  })

  for (const { scenario, text } of [
    { scenario: "Порожньо", text: "У стрічці ще нічого немає" },
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
  ]) {
    test(`сценарій «${scenario}»`, async ({ page }) => {
      await openPage(page)
      await chooseScenario(page, scenario)
      await page.reload()
      await expect(full(page).getByText(text).first()).toBeVisible()
      await expect(entries(page)).toHaveCount(0)
    })
  }

  for (const width of [360, 768, 1440])
    for (const theme of ["light", "dark"] as const)
      test(`${String(width)} ${theme}: без прокрутки вбік, axe`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 })
        await openWith(page, { theme }, PAGE)
        await expect(noteField(page)).toHaveAttribute("contenteditable", "true")
        await expect(entries(page).first()).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)
      })
})
