import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Повтори (UI41, ADR-0104): те, чого модульні тести не бачать — справжній список вибору й клавіатура, пояс браузера
 * (Europe/Kyiv у конфігу) для наради в Нью-Йорку, ширина телефона, axe.
 */
const PAGE = "/#/recurrence"

/** «Сьогодні» до перших днів демо: найближчі повторення рахуються від них. */
async function open(page: Page) {
  await page.clock.setFixedTime(new Date("2026-11-30T10:00:00Z"))
  await openWith(page, {}, PAGE)
}

const form = (page: Page, id: string) => page.getByTestId(`recurrence-${id}`)
const summaryOf = (page: Page, id: string) =>
  form(page, id).locator('[data-slot="recurrence-summary"]')

test.describe("редактор повтору", () => {
  test("з клавіатури: щотижня в обрані дні, N разів, збережене правило читається назад", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    const fresh = form(page, "fresh")
    await fresh.getByRole("combobox", { name: "Повторювати" }).focus()
    await page.keyboard.press("Enter")
    await page
      .getByRole("option", { name: "Щотижня", exact: true })
      .press("Enter")
    // 31.01.2027 — неділя: її день уже вибрано.
    const days = fresh.getByRole("group", { name: "Дні тижня" })
    await expect(
      days.getByRole("button", { name: "Нд, неділя" }),
    ).toHaveAttribute("aria-pressed", "true")
    await days.getByRole("button", { name: "Ср, середа" }).focus()
    await page.keyboard.press("Space")
    await expect(summaryOf(page, "fresh")).toContainText(
      "Щотижня в середу і неділю",
    )

    await fresh.getByRole("combobox", { name: "Закінчення" }).focus()
    await page.keyboard.press("Enter")
    await page
      .getByRole("option", { name: "Кількість разів", exact: true })
      .press("Enter")
    const count = fresh.getByRole("textbox", { name: "Скільки разів" })
    await count.fill("3")
    await expect(summaryOf(page, "fresh")).toContainText(
      "Щотижня в середу і неділю, 3 рази",
    )
    await expect(summaryOf(page, "fresh").getByRole("listitem")).toHaveText([
      "31 січ. 2027",
      "3 лют. 2027",
      "7 лют. 2027",
    ])

    await fresh.getByRole("button", { name: "Зберегти" }).press("Enter")
    await expect(fresh.locator("pre")).toHaveText(
      '{"start":"2027-01-31","timeZone":"Europe/Kyiv","rule":"FREQ=WEEKLY;BYDAY=WE,SU;COUNT=3"}',
    )
    await expect(count).toHaveValue("3")
    await expect(summaryOf(page, "fresh")).toContainText(
      "Щотижня в середу і неділю, 3 рази",
    )
  })

  test("нарада в Нью-Йорку: пояс названо, найближчі дати — у поясі браузера", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    await expect(summaryOf(page, "meeting")).toContainText(
      "о 09:00 за поясом America/New_York, до 31.03.2027 включно",
    )
    await expect(
      summaryOf(page, "meeting").getByRole("listitem").first(),
    ).toHaveText("7 груд. 2026, 16:00")
  })

  test("телефон: без горизонтальної прокрутки, дні тижня в один рядок, axe", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await open(page)
    await expectNoHorizontalScroll(page)
    const buttons = form(page, "meeting")
      .getByRole("group", { name: "Дні тижня" })
      .getByRole("button")
    await expect(buttons).toHaveCount(7)
    const tops = await buttons.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().top),
    )
    expect(new Set(tops).size).toBe(1)
    await expectNoA11yViolations(page)
  })
})
