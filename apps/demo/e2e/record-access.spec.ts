import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

/**
 * Крок A2c2a (ADR-0037): що з конкретним записом можна, каже сервер позначкою `deniedActions`.
 * Спільний запис (без компанії) змінює лише адміністратор платформи (ADR-0036): решта бачить дії
 * неактивними з причиною, а не кнопку, на яку сервер відповість 403. У демо спільні — сегменти засіву
 * й організація «ТОВ «Зелена долина»» з її контактами.
 */
const SHARED_ORGANIZATION = "/#/m/B1/organizations/org-011"
/** Представник спільної організації — теж спільний. */
const SHARED_CONTACT = "/#/m/B1/contacts/contact-011"
const SEGMENTS = "/#/m/B1/segments"
const SHARED_REASON =
  "Спільний запис: змінювати його може лише адміністратор платформи"

const tooltip = (page: Page) => page.locator('[data-slot="tooltip-content"]')
const editButton = (page: Page) =>
  page.getByRole("button", { name: "Змінити", exact: true })

test.describe("A2c2a: неактивні дії з причиною на спільних записах", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("картка спільної організації: «Змінити» й «Додати…» неактивні з причиною, меню рядків немає", async ({
    page,
  }) => {
    await openWith(page, {}, SHARED_ORGANIZATION)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "ТОВ «Зелена долина»",
    )
    const edit = editButton(page)
    await expect(edit).toBeDisabled()
    await expect(edit).toHaveAccessibleDescription(SHARED_REASON)
    // Неактивна дія — у порядку Tab, причина — і в підказці.
    await edit.focus()
    await expect(tooltip(page)).toHaveText(SHARED_REASON)
    // Закріпити спільний запис можна: це особисте.
    await expect(
      page.getByRole("button", { name: /Закріпити вгорі/ }),
    ).toBeEnabled()
    await expectNoA11yViolations(page)

    await page.getByRole("tab", { name: "Адреси" }).click()
    const add = page.getByRole("button", { name: "Додати адресу" })
    await expect(add).toBeDisabled()
    await expect(add).toHaveAccessibleDescription(SHARED_REASON)
    await expect(page.getByRole("button", { name: /^Дії: / })).toHaveCount(0)

    await page.getByRole("tab", { name: "Рахунки" }).click()
    const addAccount = page.getByRole("button", { name: "Додати рахунок" })
    await expect(addAccount).toBeDisabled()
    await expect(addAccount).toHaveAccessibleDescription(SHARED_REASON)
    await expect(page.getByRole("button", { name: /^Дії: / })).toHaveCount(0)
  })

  test("картка спільного контакту: «Змінити» неактивна, організація — лише читання з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, SHARED_CONTACT)
    await expect(editButton(page)).toBeDisabled()
    await expect(editButton(page)).toHaveAccessibleDescription(SHARED_REASON)
    const organization = page.getByRole("region", { name: "Організація" })
    await expect(organization.getByText(SHARED_REASON)).toBeVisible()
    const field = organization.getByRole("textbox", { name: "Організація" })
    await expect(field).toHaveAttribute("readonly", "")
    await expect(field).toHaveAccessibleDescription(SHARED_REASON)
    await expectNoA11yViolations(page)
  })

  test("сегменти: спільний — назва текстом і неактивна «Змінити» з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, SEGMENTS)
    const edit = page.getByRole("button", { name: "Змінити сегмент «Клієнт»" })
    await expect(edit).toBeDisabled()
    await expect(edit).toHaveAccessibleDescription(SHARED_REASON)
    await edit.focus()
    await expect(tooltip(page)).toHaveText(SHARED_REASON)
    await expect(page.getByRole("columnheader", { name: "Дії" })).toHaveCount(1)
    await expectNoA11yViolations(page)
  })

  test("сегменти без права змінювати — колонки дій немає, назви текстом", async ({
    page,
  }) => {
    await openWith(page, {}, SEGMENTS, { user: USERS.sales })
    await expect(
      page.getByRole("gridcell", { name: "Клієнт", exact: true }),
    ).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Дії" })).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: /^Змінити сегмент/ }),
    ).toHaveCount(0)
  })

  test("сегменти з клавіатури: стрілкою з назви — на неактивну «Змінити», причина в підказці", async ({
    page,
  }) => {
    await openWith(page, {}, SEGMENTS)
    // Tab з «Оновити» — у грід (заголовок), стрілкою вниз — назва першого рядка, праворуч — дії.
    await page.getByRole("button", { name: "Оновити" }).focus()
    await page.keyboard.press("Tab")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowRight")
    const edit = page.getByRole("button", { name: "Змінити сегмент «Клієнт»" })
    await expect(edit).toBeFocused()
    await expect(tooltip(page)).toHaveText(SHARED_REASON)
  })

  test("адміністратор платформи змінює спільне: дії активні", async ({
    page,
  }) => {
    await openWith(page, {}, SHARED_ORGANIZATION, { user: USERS.platform })
    await expect(editButton(page)).toBeEnabled()
    await editButton(page).click()
    await expect(
      page.getByRole("dialog", { name: "Змінити організацію" }),
    ).toBeVisible()

    await openWith(page, {}, SEGMENTS, { user: USERS.platform })
    await expect(
      page.getByRole("button", { name: "Змінити сегмент «Клієнт»" }),
    ).toBeEnabled()
  })
})

test.describe("A2c2a: спільні записи на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картка сегмента названа лише назвою, «Змінити» з замком — видимим підписом", async ({
    page,
  }) => {
    await openWith(page, {}, SEGMENTS)
    const card = page.getByRole("article", { name: "Клієнт", exact: true })
    await expect(card).toBeVisible()
    const edit = card.getByRole("button", { name: "Змінити сегмент «Клієнт»" })
    await expect(edit).toBeDisabled()
    await expect(edit).toHaveText("Змінити")
    await expect(edit).toHaveAccessibleDescription(SHARED_REASON)
    await expectNoA11yViolations(page)
  })

  test("картка спільної організації: «Змінити» неактивна, без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, SHARED_ORGANIZATION)
    await expect(editButton(page)).toBeDisabled()
    await expect(editButton(page)).toHaveAccessibleDescription(SHARED_REASON)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
