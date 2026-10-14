import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith } from "./helpers"

const PATH = "/#/fields"
const NBSP = " "
// «Сьогодні» для пресетів і меж — середа, 14.10.2026 у поясі Europe/Kyiv (playwright.config).
const NOW = new Date("2026-10-14T10:00:00+03:00")

/** Поле демо за підписом: керування, підказка «Зберігається: …» і помилка. */
const field = (page: Page, label: string) =>
  page.locator("[data-slot=field]").filter({
    has: page.getByText(label, { exact: true }),
  })

test.describe("дати й числа: axe", () => {
  for (const palette of ["sapphire", "graphite"] as const)
    for (const theme of ["light", "dark"] as const)
      test(`${palette} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await openWith(page, { palette, theme }, PATH)
        await expectNoA11yViolations(page)
      })

  for (const width of [360, 768] as const)
    for (const language of ["uk", "en"] as const)
      test(`${width}px ${language}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await openWith(page, { language }, PATH)
        await expectNoA11yViolations(page)
      })

  test("відкритий календар і період", async ({ page }) => {
    await openWith(page, { theme: "dark" }, PATH)
    await field(page, "Дата договору")
      .getByRole("button", { name: "Вибрати в календарі" })
      .click()
    await expect(
      page.getByRole("dialog").locator("[data-slot=calendar]"),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Будь-який період" }).click()
    await expect(
      page.getByRole("group", { name: "Швидкий вибір" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })
})

test.describe("дати й числа: поведінка", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })

  test("дата з клавіатури: роздільники самі, помилка — при виході з поля", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const date = field(page, "Дата документа")
    const input = date.getByRole("textbox")
    await expect(input).toHaveAttribute("placeholder", "дд.мм.рррр")
    await input.pressSequentially("1310")
    await expect(input).toHaveValue("13.10")
    // Поки користувач вводить, помилки немає (SPEC §8.3).
    await expect(input).not.toHaveAttribute("aria-invalid")
    await input.press("Tab")
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(input).toHaveAccessibleDescription(
      "Введіть дату повністю: дд.мм.рррр",
    )
    await input.click()
    await input.press("End")
    await input.pressSequentially("2026")
    await expect(input).toHaveValue("13.10.2026")
    await expect(date.getByText("Зберігається: 2026-10-13")).toBeVisible()
    await expect(input).not.toHaveAttribute("aria-invalid")

    // Неіснуюча дата й межі.
    await expect(
      field(page, "Неіснуюча дата").getByText(
        "Такої дати немає. Перевірте день і місяць",
      ),
    ).toBeVisible()
    await expect(
      field(page, "Термін оплати: від сьогодні до +90 днів").getByText(
        "Не раніше 14.10.2026",
      ),
    ).toBeVisible()
  })

  test("календар з клавіатури: фокус на вибраному дні, стрілки, Enter, фокус назад", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const date = field(page, "Дата договору")
    const trigger = date.getByRole("button", { name: "Вибрати в календарі" })
    await trigger.click()
    const calendar = page.getByRole("dialog").locator("[data-slot=calendar]")
    // Тиждень — з понеділка, місяць — у називному відмінку.
    await expect(calendar.getByText("жовтень 2026")).toBeVisible()
    await expect(calendar.locator("th").first()).toHaveText(/пн/i)
    await expect(
      calendar.getByRole("button", { name: "вівторок, 13 жовтня, вибрано" }),
    ).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(
      calendar.getByRole("button", { name: "Сьогодні, середа, 14 жовтня" }),
    ).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(calendar).toBeHidden()
    await expect(date.getByRole("textbox")).toHaveValue("14.10.2026")
    await expect(date.getByText("Зберігається: 2026-10-14")).toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test("межі вимикають дні в календарі", async ({ page }) => {
    await openWith(page, {}, PATH)
    await field(page, "Термін оплати: від сьогодні до +90 днів")
      .getByRole("button", { name: "Вибрати в календарі" })
      .click()
    const calendar = page.getByRole("dialog").locator("[data-slot=calendar]")
    await expect(
      calendar.getByRole("button", { name: "неділя, 11 жовтня" }),
    ).toBeDisabled()
    await expect(
      calendar.getByRole("button", { name: /^Сьогодні, середа, 14 жовтня/ }),
    ).toBeEnabled()
  })

  test("лише читання й вимкнене поле", async ({ page }) => {
    await openWith(page, {}, PATH)
    const readOnly = field(page, "Лише читання").first()
    await expect(readOnly.getByRole("textbox")).toHaveAttribute("readonly")
    await expect(
      readOnly.getByRole("button", { name: "Вибрати в календарі" }),
    ).toHaveCount(0)
    await expect(
      field(page, "Вимкнено").first().getByRole("textbox"),
    ).toBeDisabled()
  })

  test("період: пресет одразу, поля «Від/До» — кнопкою «Готово», помилка порядку", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const range = field(page, "Будь-який період")
    const trigger = range.getByRole("button")
    await trigger.click()
    const presets = page.getByRole("group", { name: "Швидкий вибір" })
    await presets.getByRole("button", { name: "Минулий місяць" }).click()
    await expect(presets).toBeHidden()
    await expect(
      range.getByText("Зберігається: 2026-09-01 … 2026-09-30"),
    ).toBeVisible()
    await expect(trigger).toBeFocused()

    // Активний пресет позначено.
    await trigger.click()
    await expect(
      presets.getByRole("button", { name: "Минулий місяць" }),
    ).toHaveAttribute("aria-pressed", "true")

    const from = page.getByRole("textbox", { name: "Від", exact: true })
    const to = page.getByRole("textbox", { name: "До", exact: true })
    await from.fill("")
    await from.pressSequentially("05102026")
    await to.fill("")
    await to.pressSequentially("01102026")
    await page.getByRole("button", { name: "Готово" }).click()
    await expect(
      page.getByText("Кінець періоду не може бути раніше за початок"),
    ).toBeVisible()
    await expect(to).toHaveAttribute("aria-invalid", "true")

    await to.fill("")
    await to.pressSequentially("10102026")
    await page.getByRole("button", { name: "Готово" }).click()
    await expect(presets).toBeHidden()
    await expect(
      range.getByText("Зберігається: 2026-10-05 … 2026-10-10"),
    ).toBeVisible()

    // «Очистити» — будь-який період.
    await trigger.click()
    await page.getByRole("button", { name: "Очистити" }).click()
    await expect(range.getByText("Зберігається: null")).toBeVisible()
  })

  test("суми: розряди й кома за мовою, значення — у мінорних одиницях", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const usd = field(page, "Сума в доларах")
    const input = usd.getByRole("textbox")
    await input.pressSequentially("1200.5")
    await expect(input).toHaveValue(`1${NBSP}200,5`)
    await expect(usd.getByText("Зберігається: 120050 USD")).toBeVisible()
    await expect(usd.getByText("USD", { exact: true })).toBeVisible()

    const uah = field(page, "Сума в гривнях")
    await expect(uah.getByRole("textbox")).toHaveValue(`48${NBSP}600,50`)
    await expect(uah.getByText("₴", { exact: true })).toBeVisible()

    const quantity = field(page, "Кількість")
    await expect(quantity.getByText("Не менше 1")).toBeVisible()
    await quantity.getByRole("textbox").fill("12")
    await expect(quantity.getByText("Зберігається: 12")).toBeVisible()
    await expect(quantity.getByText("Не менше 1")).toBeHidden()
  })

  test("ціле число: кома й дріб не вводяться (не 125), підказка під полем", async ({
    page,
  }) => {
    await openWith(page, {}, PATH)
    const quantity = field(page, "Кількість")
    const input = quantity.getByRole("textbox")
    await input.fill("")
    await input.pressSequentially("12,5")
    await expect(input).toHaveValue("12")
    await expect(
      quantity.getByText("Зберігається: 12", { exact: true }),
    ).toBeVisible()
    // Підказка спливає під полем (не зсуває розкладку) і є в live-регіоні групи.
    const tooltip = page.locator("[data-slot=tooltip-content]")
    await expect(tooltip).toHaveText("Лише ціле число")
    await expect(quantity.getByRole("status")).toHaveText("Лише ціле число")
    // Під полем, а біля краю вікна — над ним; поле не перекриває (після анімації появи).
    const group = quantity.getByRole("group").first()
    await expect
      .poll(async () => {
        const box = await group.boundingBox()
        const bubble = await tooltip.boundingBox()
        if (!box || !bubble) return false
        return (
          bubble.y >= box.y + box.height || bubble.y + bubble.height <= box.y
        )
      })
      .toBe(true)
    await expectNoA11yViolations(page)
    // Вийшли з поля — підказка зникає, число лишається.
    await input.press("Tab")
    await expect(tooltip).toBeHidden()
    await expect(quantity.getByRole("status")).toHaveText("")
    await expect(input).toHaveValue("12")

    // Поле з дробом приймає кому.
    const discount = field(page, "Знижка").getByRole("textbox")
    await discount.fill("")
    await discount.pressSequentially("7,5")
    await expect(discount).toHaveValue("7,5")
    await expect(tooltip).toBeHidden()
  })

  test("англійська: «dd/mm/yyyy», розряди комою", async ({ page }) => {
    await openWith(page, { language: "en" }, PATH)
    const input = field(page, "Document date").getByRole("textbox")
    await expect(input).toHaveAttribute("placeholder", "dd/mm/yyyy")
    await input.pressSequentially("13102026")
    await expect(input).toHaveValue("13/10/2026")
    await expect(
      field(page, "Amount in hryvnias").getByRole("textbox"),
    ).toHaveValue("48,600.50")
  })
})
