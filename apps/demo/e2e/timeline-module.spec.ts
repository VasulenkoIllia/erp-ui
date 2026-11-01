import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Модуль N1 (ADR-0054): «Мої справи» на місці заглушки `/m/N1`, стрічка на картках B1 і рахунку поруч із
 * формою картки, проект без пошти. Фікстури демо: у бухгалтера вісім дій, на сторінку п'ять.
 */
const MODULE = "/#/m/N1"
const MY_ACTIVITIES = "/#/m/N1/my-activities"
const CONTACTS = "/#/m/B1/contacts"
const CONTACT_CARD = `${CONTACTS}/contact-001`
const CARDS = [
  { name: "контакт", href: CONTACT_CARD },
  { name: "організація", href: "/#/m/B1/organizations/org-001" },
  { name: "рахунок", href: "/#/data/inv-00001" },
]
const TOTAL = 8
const PER_PAGE = 5
const DRAFT = "Чернетка поруч із формою"
const POSITION = "Директорка з розвитку"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const rows = (page: Page) =>
  page.getByRole("list", { name: "Мої заплановані дії" }).getByRole("listitem")
const tab = (page: Page, name: string) => page.getByRole("tab", { name })
const doneButton = (page: Page) =>
  rows(page)
    .first()
    .getByRole("button", { name: /^Виконано: / })
const shown = (page: Page, count: number, total: number) =>
  page.getByText(`Показано ${String(count)} з ${String(total)}`)
const noteField = (page: Page) =>
  page.getByRole("textbox", { name: "Нотатка для команди" })
const contactForm = (page: Page) =>
  page.getByRole("dialog", { name: "Змінити контакт", exact: true })
const unsavedDialog = (page: Page) =>
  page.getByRole("alertdialog", { name: "Вийти без збереження?" })
const stay = (page: Page) =>
  unsavedDialog(page).getByRole("button", { name: "Залишитися" }).click()

async function writeDraft(page: Page, text: string) {
  await expect(noteField(page)).toHaveAttribute("contenteditable", "true")
  await noteField(page).click()
  await page.keyboard.type(text, { delay: 10 })
  await expect(noteField(page)).toHaveText(text)
}

test.describe("модуль N1: «Мої справи»", () => {
  test("адреса модуля веде на сторінку, є пункт навігації, перша сторінка дій", async ({
    page,
  }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/N1\/my-activities$/)
    await expect(heading(page)).toHaveText("Мої справи")
    await expect(
      page.locator('a[href="#/m/N1/my-activities"]').first(),
    ).toBeVisible()
    await expect(rows(page)).toHaveCount(PER_PAGE)
    await expect(shown(page, PER_PAGE, TOTAL)).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("вкладка — в адресі й переживає перезавантаження", async ({ page }) => {
    await openWith(page, {}, MY_ACTIVITIES)
    await expect(rows(page)).toHaveCount(PER_PAGE)
    await tab(page, "Прострочені").click()
    await expect(page).toHaveURL(/[?&]tab=overdue/)
    await expect(rows(page).first()).toBeVisible()
    await expect(rows(page).filter({ hasNotText: "Прострочено" })).toHaveCount(
      0,
    )
    await page.reload()
    await expect(tab(page, "Прострочені")).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await tab(page, "Наступні").click()
    await expect(rows(page).first()).toBeVisible()
    await expect(rows(page).filter({ hasText: "Прострочено" })).toHaveCount(0)
  })

  test("«Показати ще»: решта дій, кнопка зникає", async ({ page }) => {
    await openWith(page, {}, MY_ACTIVITIES)
    await page.getByRole("button", { name: "Показати ще" }).click()
    await expect(rows(page)).toHaveCount(TOTAL)
    await expect(page.getByRole("button", { name: "Показати ще" })).toHaveCount(
      0,
    )
  })

  test("«Виконано»: дія зникає зі списку, фокус на заголовку", async ({
    page,
  }) => {
    await openWith(page, {}, MY_ACTIVITIES)
    const label = (await doneButton(page).getAttribute("aria-label")) ?? ""
    await doneButton(page).click()
    await expect(shown(page, PER_PAGE, TOTAL - 1)).toBeVisible()
    await expect(page.getByRole("button", { name: label })).toHaveCount(0)
    await expect(heading(page)).toBeFocused()
  })

  test("запис у рядку веде на його картку, там та сама дія", async ({
    page,
  }) => {
    await openWith(page, {}, MY_ACTIVITIES)
    const link = rows(page).locator('a[href^="#/m/B1/contacts/"]').first()
    const record = (await link.textContent()) ?? ""
    const row = rows(page).filter({ has: link })
    const label = await row
      .getByRole("button", { name: /^Виконано: / })
      .getAttribute("aria-label")
    await link.click()
    await expect(heading(page)).toHaveText(record)
    await expect(page.getByRole("button", { name: label ?? "" })).toBeVisible()
  })
})

test.describe("«Мої справи»: стани", () => {
  for (const { scenario, text } of [
    { scenario: "Помилка сервера", text: "Не вдалося завантажити дані" },
    { scenario: "Немає доступу", text: "Немає доступу" },
    { scenario: "Офлайн", text: "Немає з'єднання" },
    { scenario: "Порожньо", text: "Справ немає" },
  ])
    test(scenario, async ({ page }) => {
      await openWith(page, {}, MY_ACTIVITIES)
      await chooseScenario(page, scenario)
      await page.reload()
      await expect(page.getByText(text).first()).toBeVisible()
      await expectNoA11yViolations(page)
    })

  test("порожня вкладка: кнопка веде на всі справи", async ({ page }) => {
    await openWith(page, {}, `${MY_ACTIVITIES}?tab=overdue`)
    await chooseScenario(page, "Порожньо")
    await page.reload()
    await expect(page.getByText("На цій вкладці справ немає")).toBeVisible()
    await page.getByRole("button", { name: "Скинути фільтри" }).click()
    await expect(tab(page, "Усі")).toHaveAttribute("aria-selected", "true")
    await expect(page.getByText("Справ немає")).toBeVisible()
  })

  test("повільно: скелетон, потім список", async ({ page }) => {
    await openWith(page, {}, MY_ACTIVITIES)
    await chooseScenario(page, "Повільно (3 с)")
    await page.reload()
    await expect(page.locator('[data-slot="skeleton"]')).not.toHaveCount(0)
    await expect(rows(page)).toHaveCount(PER_PAGE, { timeout: 15_000 })
  })

  test("конфлікт: чужа зміна спиняє «Виконано», повтор проходить", async ({
    page,
  }) => {
    await openWith(page, {}, MY_ACTIVITIES)
    await expect(rows(page)).toHaveCount(PER_PAGE)
    await chooseScenario(page, "Конфлікт збереження")
    await doneButton(page).click()
    await expect(
      page.getByText("Дію щойно змінили.", { exact: false }).first(),
    ).toBeVisible()
    await expect(shown(page, PER_PAGE, TOTAL)).toBeVisible()
    await doneButton(page).click()
    await expect(shown(page, PER_PAGE, TOTAL - 1)).toBeVisible()
  })
})

test.describe("«Мої справи»: телефон 360", () => {
  test.use({ viewport: { width: 360, height: 844 } })

  test("без прокрутки вбік, без порушень", async ({ page }) => {
    await openWith(page, {}, MY_ACTIVITIES)
    await expect(rows(page)).toHaveCount(PER_PAGE)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})

test.describe("стрічка на картках", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const card of CARDS)
    test(`${card.name}: нотатка з'являється в стрічці`, async ({ page }) => {
      await openWith(page, {}, card.href)
      await writeDraft(page, DRAFT)
      await page.getByRole("button", { name: "Додати нотатку" }).click()
      const timeline = page.locator('[data-slot="object-page-aside"]')
      await expect(
        timeline
          .locator('[data-slot="timeline-entry"]')
          .filter({ hasText: DRAFT }),
      ).toBeVisible()
      await expect(noteField(page)).toHaveText("")
      await expectNoA11yViolations(page)
    })
})

test.describe("незбережені зміни поруч зі стрічкою", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("чернетка нотатки: перехід питає, «Залишитися» лишає текст", async ({
    page,
  }) => {
    await openWith(page, {}, CONTACT_CARD)
    await writeDraft(page, DRAFT)
    await page.getByRole("link", { name: "До контактів" }).click()
    await expect(unsavedDialog(page)).toBeVisible()
    await stay(page)
    await expect(page).toHaveURL(/contact-001/)
    await expect(noteField(page)).toHaveText(DRAFT)
  })

  test("змінена форма картки: «Назад» питає, форма лишається", async ({
    page,
  }) => {
    await openWith(page, {}, CONTACTS)
    await page.goto(CONTACT_CARD)
    await expect(noteField(page)).toHaveAttribute("contenteditable", "true")
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const position = contactForm(page).getByRole("textbox", { name: "Посада" })
    await position.fill(POSITION)
    await page.goBack()
    await expect(unsavedDialog(page)).toBeVisible()
    await stay(page)
    await expect(page).toHaveURL(/contact-001/)
    await expect(position).toHaveValue(POSITION)
  })

  test("форму закрито: захист чернетки знову діє", async ({ page }) => {
    await openWith(page, {}, CONTACT_CARD)
    await writeDraft(page, DRAFT)
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    await contactForm(page).getByRole("button", { name: "Скасувати" }).click()
    await expect(contactForm(page)).toBeHidden()
    await page.getByRole("link", { name: "До контактів" }).click()
    await expect(unsavedDialog(page)).toBeVisible()
    await stay(page)
    await expect(noteField(page)).toHaveText(DRAFT)
  })
})

test.describe("чернетка стрічки на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("перемикання вкладок лишає текст, з прихованої вкладки перехід теж питає", async ({
    page,
  }) => {
    await openWith(page, {}, CONTACTS)
    await page.goto(CONTACT_CARD)
    await tab(page, "Стрічка").click()
    await writeDraft(page, DRAFT)
    await page
      .getByRole("tablist", { name: "Розділи запису" })
      .getByRole("tab")
      .first()
      .click()
    await expect(noteField(page)).toBeHidden()
    await page.goBack()
    await expect(unsavedDialog(page)).toBeVisible()
    await stay(page)
    await tab(page, "Стрічка").click()
    await expect(noteField(page)).toHaveText(DRAFT)
    await expectNoHorizontalScroll(page)
  })
})

test("проект без пошти: вкладки «Повідомлення» немає, нотатка працює", async ({
  page,
}) => {
  await openWith(page, {}, "/#/timeline")
  const section = page.getByTestId("timeline-no-mail")
  await expect(
    section.getByRole("textbox", { name: "Нотатка для команди" }),
  ).toHaveAttribute("contenteditable", "true")
  await expect(section.getByRole("tab", { name: "Повідомлення" })).toHaveCount(
    0,
  )
  await expect(
    page.getByTestId("timeline-full").getByRole("tab", {
      name: "Повідомлення",
    }),
  ).toBeVisible()
})
