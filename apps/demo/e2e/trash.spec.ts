import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Крок PF16 (ADR-0095): кошик на моках. Сторінка демо «Кошик» — видалення товару без підтвердження зі
 * «Скасувати», відновлення з кошика з фокусом на сусідній рядок, зайнятий артикул (409), строк і бекенд
 * без кошика; модуль B1 — видалений контакт у кошику списку й «Відкрити» після відновлення.
 */
const PAGE = "/#/trash"
const CONTACT = "/#/m/B1/contacts/contact-003"
const CONTACT_NAME = "Марта Романюк"

const toast = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text })
const bin = (page: Page) =>
  page.getByRole("list", { name: "Видалені записи" }).first()
const restoreOf = (page: Page, name: string) =>
  page.getByRole("button", { name: `Відновити: ${name}` })

test.describe("PF16: кошик", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("сторінка демо: строки, «Видалити товар» зі «Скасувати», відновлення й зайнятий артикул", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Кошик")
    await expect(page.getByText("Артикул SKU-006")).toBeVisible()
    await expect(bin(page).getByRole("listitem")).toHaveCount(4)
    await expect(bin(page).getByRole("listitem").first()).toContainText(
      "Фільтри для кави",
    )
    await expect(
      bin(page)
        .getByRole("listitem")
        .filter({ hasText: "Підставка для чайника" }),
    ).toContainText("Скоро зникне назавжди")
    await expect(
      page.getByText(
        "Сервер цього застосунку не веде кошика: видалені записи не зберігаються.",
      ),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole("button", { name: "Видалити товар" }).click()
    const moved = toast(page, "Товар перенесено в кошик")
    await expect(moved).toBeVisible()
    await expect(page.getByText(/^Товар у кошику/)).toBeVisible()
    await expect(bin(page).getByRole("listitem")).toHaveCount(5)
    await expect(bin(page).getByRole("listitem").first()).toContainText(
      "Кавомолка",
    )
    await expect(bin(page).getByRole("listitem").first()).toContainText(
      "Хто видалив: Олена Коваль",
    )
    await moved.getByRole("button", { name: "Скасувати" }).click()
    await expect(toast(page, "Відновлено: Кавомолка")).toBeVisible()
    await expect(page.getByText("Артикул SKU-006")).toBeVisible()
    await expect(bin(page).getByRole("listitem")).toHaveCount(4)

    await restoreOf(page, "Набір чашок, стара картка").click()
    await expect(
      toast(page, /^Відновити не можна: поки запис лежав у кошику/),
    ).toBeVisible()
    await expect(restoreOf(page, "Набір чашок, стара картка")).toBeVisible()

    await restoreOf(page, "Фільтри для кави").click()
    await expect(toast(page, "Відновлено: Фільтри для кави")).toBeVisible()
    await expect(restoreOf(page, "Фільтри для кави")).toHaveCount(0)
    await expect(restoreOf(page, "Термокухоль")).toBeFocused()
  })

  test("модуль B1: видалений контакт — у кошику списку, «Відкрити» після відновлення", async ({
    page,
  }) => {
    await openWith(page, {}, CONTACT)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      CONTACT_NAME,
    )
    await page.getByRole("button", { name: "Видалити", exact: true }).click()
    await expect(toast(page, "Контакт перенесено в кошик")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Контакти")
    // «Кошик» є ще в бічному меню демо: кнопка над списком — у вмісті сторінки.
    await page.getByRole("main").getByRole("link", { name: "Кошик" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Кошик: Контакти",
    )
    await expect(bin(page)).toContainText(CONTACT_NAME)
    await expectNoA11yViolations(page)
    await restoreOf(page, CONTACT_NAME).click()
    const restored = toast(page, `Відновлено: ${CONTACT_NAME}`)
    await restored.getByRole("button", { name: "Відкрити" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      CONTACT_NAME,
    )
  })
})

test.describe("PF16: кошик на телефоні", () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test("сторінка демо без горизонтальної прокрутки, кнопки рядків під текстом", async ({
    page,
  }) => {
    await openWith(page, { theme: "dark" }, PAGE)
    await expect(bin(page).getByRole("listitem")).toHaveCount(4)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
