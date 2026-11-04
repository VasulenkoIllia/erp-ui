import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Крок UI13 (ADR-0061): потік документів — кроки рядком на широкому контейнері й вертикально на
 * вузькому, позначки без посилання для документа без права й видаленого, перехід за посиланням, живий
 * потік на картці «Документ» з моку `GET /documents/:id/flow`.
 */
const FLOW_PAGE = "/#/document-flow"

const section = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { level: 2, name: title }),
  })
const steps = (scope: Locator) =>
  scope.locator('[data-slot="document-flow-step"]')

/** Верхній лівий кут кроків потоку. */
async function corners(scope: Locator) {
  const boxes = await Promise.all(
    (await steps(scope).all()).map((step) => step.boundingBox()),
  )
  return boxes.map((box) => ({ x: box?.x ?? 0, y: box?.y ?? 0 }))
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T10:00:00Z"))
})

test.describe("UI13: потік документів", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("на широкому кроки рядком, на вузькому вертикально; позначки без посилання", async ({
    page,
  }) => {
    await openWith(page, {}, FLOW_PAGE)
    const sale = section(page, "Ланцюг продажу")
    await expect(steps(sale)).toHaveCount(4)
    const wide = await corners(sale)
    expect(new Set(wide.map(({ y }) => Math.round(y))).size).toBe(1)
    expect(wide[1]?.x ?? 0).toBeGreaterThan(wide[0]?.x ?? 0)

    const narrow = await corners(page.getByTestId("flow-narrow"))
    expect(new Set(narrow.map(({ x }) => Math.round(x))).size).toBe(1)
    expect(narrow[1]?.y ?? 0).toBeGreaterThan(narrow[0]?.y ?? 0)

    const shipments = sale.getByRole("list", { name: "Відвантаження" })
    const forbidden = shipments.getByRole("listitem").nth(1)
    await expect(forbidden).toContainText("ВІД-2026-0004")
    await expect(forbidden).toContainText("Немає доступу")
    await expect(forbidden.getByRole("link")).toHaveCount(0)
    const deleted = sale
      .getByRole("list", { name: "Рахунок" })
      .getByRole("listitem")
      .first()
    await expect(deleted).toContainText("Видалено")
    await expect(deleted.getByRole("link")).toHaveCount(0)
    await expectNoA11yViolations(page)
  })

  test("посилання веде до документа: він стає поточним, попередній — посиланням", async ({
    page,
  }) => {
    await openWith(page, {}, FLOW_PAGE)
    const sale = section(page, "Ланцюг продажу")
    const current = sale.locator('[aria-current="page"]')
    await expect(current).toContainText("ЗАМ-2026-0007")
    await expect(current.getByRole("link")).toHaveCount(0)
    await sale.getByRole("link", { name: "ПРО-2026-0012" }).click()
    await expect(page).toHaveURL(/current=quotes%3Aq-12/)
    await expect(current).toContainText("ПРО-2026-0012")
    await expect(current).toContainText("Цей документ")
    await expect(
      sale.getByRole("link", { name: "ЗАМ-2026-0007" }),
    ).toBeVisible()
  })

  test("картка документа: сторно в потоці, перехід на нього за посиланням", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/document?id=doc-7")
    const card = page.getByTestId("document-card")
    const flow = card.locator('[data-slot="document-flow"]')
    // Документ, а не крок, у якому він лежить: крок теж `listitem` із тим самим текстом.
    const reversal = flow
      .locator('[data-slot="document-flow-item"]')
      .filter({ hasText: "Сторно ДОК-2026-0005" })
    await expect(reversal).toBeVisible()
    await reversal.getByRole("link", { name: "ДОК-2026-0006" }).click()
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      "ДОК-2026-0006",
    )
    await expect(flow.locator('[aria-current="page"]')).toContainText(
      "Цей документ",
    )
    await expect(
      flow.getByRole("link", { name: "ДОК-2026-0005" }),
    ).toBeVisible()
  })
})

test("UI13 на телефоні: кроки вертикально, без горизонтальної прокрутки", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await openWith(page, {}, FLOW_PAGE)
  const sale = section(page, "Ланцюг продажу")
  await expect(steps(sale)).toHaveCount(4)
  const phone = await corners(sale)
  expect(new Set(phone.map(({ x }) => Math.round(x))).size).toBe(1)
  await expectNoHorizontalScroll(page)
  await expectNoA11yViolations(page)
})
