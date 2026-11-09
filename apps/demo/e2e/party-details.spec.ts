import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Крок UI45 (ADR-0068): реквізити сторін — «Наша компанія в документі: Замовник / Виконавець»,
 * заповнення лише порожніх полів з профілю компанії й картки контрагента, підпис «Олена КОВАЛЬ», аркуш
 * договору без рядків без значення, стани (лише читання, ФОП, помилки, джерело без даних), телефон.
 */
const PARTIES_PAGE = "/#/party-details"

const section = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { level: 2, name: title }),
  })
const contract = (page: Page) => section(page, "Договір із двома сторонами")
const states = (page: Page) => section(page, "Стани")
const sheet = (page: Page) => page.locator('[data-slot="print-sheet"]')

test.describe("UI45: реквізити сторін", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("сторони заповнюються лише в порожні поля, аркуш показує ролі, «в особі» й підписи", async ({
    page,
  }) => {
    await openWith(page, {}, PARTIES_PAGE)
    const form = contract(page)
    const ours = form.getByRole("group", { name: "Виконавець: наша компанія" })
    await ours
      .getByRole("button", { name: "Заповнити з профілю компанії" })
      .click()
    await expect(
      ours.getByText(
        "Заповнено 10 порожніх полів. Те, що ви ввели, не змінено.",
      ),
    ).toBeVisible()
    await expect(
      ours.getByLabel("Підписант (ПІБ)"),
    ).toHaveAccessibleDescription("Підпис на документах: Олена КОВАЛЬ")

    const theirs = form.getByRole("group", { name: "Замовник", exact: true })
    const fill = theirs.getByRole("button", {
      name: "Заповнити з картки контрагента",
    })
    await expect(fill).toHaveAttribute("aria-disabled", "true")
    await expect(fill).toHaveAccessibleDescription(
      "Спершу виберіть контрагента",
    )
    await theirs.getByLabel("Діє на підставі").fill("Довіреності № 7")
    await form.getByRole("combobox", { name: "Картка контрагента" }).click()
    await page.getByRole("option", { name: "ТОВ «Північний вітер»" }).click()
    await fill.click()
    await expect(
      theirs.getByText(
        "Заповнено 11 порожніх полів. Те, що ви ввели, не змінено.",
      ),
    ).toBeVisible()
    await expect(theirs.getByLabel("Діє на підставі")).toHaveValue(
      "Довіреності № 7",
    )

    await expect(sheet(page)).toContainText(
      "ТОВ «Північний вітер», в особі генерального директора Мельника Андрія Петровича, що діє на підставі Довіреності № 7 (надалі «Замовник»), з однієї сторони, та ТОВ «Зоряна логістика» (надалі «Виконавець»)",
    )
    await expect(sheet(page)).toContainText("Андрій МЕЛЬНИК")
    await expect(sheet(page)).toContainText("Олена КОВАЛЬ")

    // Наша компанія — замовник: групи й аркуш міняються ролями.
    await form
      .getByRole("combobox", { name: "Наша компанія в документі" })
      .click()
    await page.getByRole("option", { name: "Замовник" }).click()
    await expect(
      form.getByRole("group", { name: "Замовник: наша компанія" }),
    ).toBeVisible()
    await expect(sheet(page)).toContainText(
      "ТОВ «Зоряна логістика» (надалі «Замовник»), з однієї сторони, та ТОВ «Північний вітер»",
    )
    await form.getByRole("button", { name: "Перевірити реквізити" }).click()
    await expect(page.getByText("Реквізити сторін правильні")).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("стани: лише читання, ФОП без посади й «в особі», помилки біля полів, джерело без даних", async ({
    page,
  }) => {
    await openWith(page, {}, PARTIES_PAGE)
    const readOnly = states(page).getByRole("group", { name: "Лише читання" })
    await expect(readOnly.getByLabel("Повна назва")).toHaveAttribute(
      "readonly",
      "",
    )
    await expect(readOnly.getByLabel("Код ЄДРПОУ")).toHaveAttribute(
      "readonly",
      "",
    )
    const fop = states(page).getByRole("group", { name: "ФОП", exact: true })
    await expect(fop.getByLabel("РНОКПП (ІПН) ФОП")).toHaveValue("3124567896")
    await expect(fop.getByLabel("Посада підписанта")).toHaveCount(0)
    await expect(fop.getByLabel("В особі (родовий відмінок)")).toHaveCount(0)
    const invalid = states(page).getByRole("group", {
      name: "Помилки й джерело без даних",
    })
    await expect(invalid.getByLabel("Код ЄДРПОУ")).toHaveAccessibleDescription(
      "Помилка в ЄДРПОУ: не збігається контрольна цифра",
    )
    await expect(invalid.getByLabel("Email")).toHaveAccessibleDescription(
      "Перевірте значення",
    )
    await expect(
      invalid.getByRole("button", { name: "Заповнити з профілю компанії" }),
    ).toHaveAccessibleDescription("Профіль компанії ще завантажується")
    await expectNoA11yViolations(page)
  })

  test("на папері лише аркуш: порожніх реквізитів немає, сторона без даних — лише роль", async ({
    page,
  }) => {
    await openWith(page, {}, PARTIES_PAGE)
    await page.emulateMedia({ media: "print" })
    await expect(page.locator('[data-slot="topbar"]')).toBeHidden()
    await expect(contract(page).getByRole("group").first()).toBeHidden()
    const parties = sheet(page).locator('[data-slot="print-party-details"]')
    await expect(parties).toBeVisible()
    await expect(parties.getByText("Замовник", { exact: true })).toBeVisible()
    await expect(parties.getByText("Виконавець", { exact: true })).toBeVisible()
    await expect(parties).not.toContainText("ЄДРПОУ")
    await expect(parties).not.toContainText("IBAN")
  })
})

for (const theme of ["light", "dark"] as const)
  test(`UI45: телефон 360 px, ${theme}: одна колонка, без горизонтальної прокрутки`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openWith(page, { theme }, PARTIES_PAGE)
    const ours = contract(page).getByRole("group", {
      name: "Виконавець: наша компанія",
    })
    const name = await ours.getByLabel("Повна назва").boundingBox()
    const code = await ours.getByLabel("Код ЄДРПОУ").boundingBox()
    expect(Math.round(code?.x ?? 0)).toBe(Math.round(name?.x ?? 0))
    expect(code?.y ?? 0).toBeGreaterThan(name?.y ?? 0)
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
