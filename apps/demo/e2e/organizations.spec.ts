import { expect, test, type Page } from "@playwright/test"

import { USERS, expectNoA11yViolations, openWith } from "./helpers"

/**
 * Крок 1.3b (ADR-0024): закріплення записів і запам'ятаний розмір сторінки в List Report, вкладки
 * секцій в Object Page — на довіднику організацій. org-001 — перший клієнт рахунків, тож у
 * вкладці «Рахунки» є рядки.
 */
const LIST = "/#/organizations"
const CARD = "/#/organizations/org-001"
const ORGANIZATIONS_API = /\/api\/v1\/organizations\?/
const INVOICES_API = /\/api\/v1\/invoices\?/

const rows = (page: Page) =>
  page
    .getByRole("grid", { name: "Організації" })
    .locator('[role="row"][data-index]')
const nameOf = (page: Page, index: number) =>
  rows(page).nth(index).getByRole("link")
const pinOf = (page: Page, name: string) =>
  page.getByRole("button", { name: `Закріпити вгорі: ${name}`, exact: true })
const announcer = (page: Page) => page.locator("#erp-ui-announcer")
const pageSize = (page: Page) =>
  page.getByRole("combobox", { name: "Рядків на сторінці" })
/** Панель вкладки за назвою: під час переходу на екрані ще й попередня (`inert`). */
const panel = (page: Page, name: string) =>
  page.getByRole("tabpanel", { name, exact: true })
const tab = (page: Page, name: string) =>
  page
    .getByRole("tablist", { name: "Розділи запису" })
    .getByRole("tab", { name, exact: true })

/** Розміри сторінки в запитах рядків списку (без лічильників вкладок з `perPage=1`). */
function rowRequests(page: Page): number[] {
  const sizes: number[] = []
  page.on("request", (request) => {
    if (!ORGANIZATIONS_API.test(request.url())) return
    const perPage = Number(new URL(request.url()).searchParams.get("perPage"))
    if (perPage !== 1) sizes.push(perPage)
  })
  return sizes
}

test.describe("організації: список", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("закріплення: угорі в порядку закріплення, фокус іде за записом, переживає перезавантаження, особисте", async ({
    page,
    context,
  }) => {
    await openWith(page, {}, LIST)
    const third = (await nameOf(page, 2).textContent()) ?? ""
    const fifth = (await nameOf(page, 4).textContent()) ?? ""

    // З клавіатури: фокус іде за записом на його нове місце.
    await pinOf(page, fifth).focus()
    await page.keyboard.press("Enter")
    await expect(nameOf(page, 0)).toHaveText(fifth)
    await expect(pinOf(page, fifth)).toHaveAttribute("aria-pressed", "true")
    await expect(pinOf(page, fifth)).toBeFocused()
    await expect(announcer(page)).toHaveText(
      `${fifth}: закріплено вгорі списку`,
    )
    await expect(rows(page).nth(0)).toHaveAttribute("data-pinned", "last")

    // Новий закріплений — під старшими: наявні не рухаються.
    await pinOf(page, third).click()
    await expect(nameOf(page, 1)).toHaveText(third)
    await expect(nameOf(page, 0)).toHaveText(fifth)
    await expect(rows(page).nth(0)).toHaveAttribute("data-pinned", "inside")
    await expectNoA11yViolations(page)

    await page.reload()
    await expect(nameOf(page, 0)).toHaveText(fifth)
    await expect(nameOf(page, 1)).toHaveText(third)

    await pinOf(page, fifth).click()
    await expect(nameOf(page, 0)).toHaveText(third)
    await expect(announcer(page)).toHaveText(`${fifth}: відкріплено`)

    // Інший користувач закріплень бухгалтера не бачить (вкладки ділять сховище, тож — наостанок).
    const other = await context.newPage()
    await other.setViewportSize({ width: 1440, height: 900 })
    await openWith(other, {}, LIST, { user: USERS.sales })
    await expect(rows(other).first()).toBeVisible()
    await expect(other.locator("[data-pinned]")).toHaveCount(0)
  })

  test("«Рядків на сторінці»: вибір діє одразу, після перезавантаження — лише запит із ним", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await expect(page.getByText("1-20 з 31")).toBeVisible()
    await pageSize(page).click()
    await page.getByRole("option", { name: "10", exact: true }).click()
    await expect(page.getByText("1-10 з 31")).toBeVisible()
    await expect(rows(page)).toHaveCount(10)

    const sizes = rowRequests(page)
    await page.reload()
    await expect(page.getByText("1-10 з 31")).toBeVisible()
    expect(sizes).toEqual([10])
    await expect(pageSize(page)).toHaveText(/^10\D*$/)
  })

  test("картка: «Закріпити вгорі» в шапці — той самий стан, що в списку", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    const third = (await nameOf(page, 2).textContent()) ?? ""
    await nameOf(page, 2).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(third)
    const pin = page.getByRole("button", { name: "Закріпити вгорі" })
    await expect(pin).toHaveAttribute("aria-pressed", "false")
    await pin.click()
    await expect(pin).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("link", { name: "До списку організацій" }).click()
    await expect(nameOf(page, 0)).toHaveText(third)
  })
})

test.describe("організації: картка з вкладками", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("клавіатура за APG, вкладка в адресі, рахунки — лише після відкриття, вкладка розширення", async ({
    page,
  }) => {
    let invoiceRequests = 0
    page.on("request", (request) => {
      if (INVOICES_API.test(request.url())) invoiceRequests += 1
    })
    await openWith(page, {}, CARD)
    await expect(tab(page, "Реквізити")).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(panel(page, "Реквізити")).toContainText("ЄДРПОУ")
    // Вкладка розширення проекту — одразу після реквізитів, як задано в файлі розширення.
    await expect(
      page.getByRole("tablist", { name: "Розділи запису" }).getByRole("tab"),
    ).toHaveText(["Реквізити", "Нотатки", "Рахунки"])

    await tab(page, "Реквізити").focus()
    await page.keyboard.press("ArrowRight")
    await expect(tab(page, "Нотатки")).toBeFocused()
    // Стрілка лише переводить фокус: вміст вкладки вантажить свої дані, тож вибір — Enter.
    await expect(tab(page, "Реквізити")).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/[?&]tab=notes/)
    await expect(panel(page, "Нотатки")).toContainText(
      "вкладка проекту з файлу розширення",
    )

    expect(invoiceRequests).toBe(0)
    await page.keyboard.press("End")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/[?&]tab=invoices/)
    await expect(
      panel(page, "Рахунки").getByRole("grid", { name: /^Рахунки клієнта / }),
    ).toBeVisible()
    expect(invoiceRequests).toBeGreaterThan(0)
    await expect(tab(page, "Рахунки")).toBeFocused()
    await expectNoA11yViolations(page)

    await page.reload()
    await expect(tab(page, "Рахунки")).toHaveAttribute("aria-selected", "true")
  })

  test("вкладки не пишуть історію: «Назад» веде зі картки до списку", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await nameOf(page, 0).click()
    await tab(page, "Нотатки").click()
    await tab(page, "Рахунки").click()
    await expect(page).toHaveURL(/[?&]tab=invoices/)
    await page.goBack()
    await expect(page).toHaveURL(/#\/organizations$/)
  })
})

test.describe("організації: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картки списку зі шпилькою, історія — остання вкладка картки, без прокрутки вбік", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    const cards = page.locator("article[data-card]")
    await expect(cards.first()).toBeVisible()
    const first = (await cards.nth(1).getByRole("link").textContent()) ?? ""
    await pinOf(page, first).click()
    await expect(cards.first().getByRole("link")).toHaveText(first)
    await expect(cards.first()).toHaveAttribute("data-pinned", "")

    await page.goto(CARD)
    await expect(
      page.getByRole("tablist", { name: "Розділи запису" }).getByRole("tab"),
    ).toHaveText(["Реквізити", "Нотатки", "Рахунки", "Історія"])
    await tab(page, "Історія").click()
    await expect(page).toHaveURL(/[?&]tab=aside/)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
  })
})

test.describe("організації: axe", () => {
  for (const palette of ["sapphire", "graphite"] as const)
    for (const theme of ["light", "dark"] as const)
      test(`список і картка ${palette} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await openWith(page, { palette, theme }, LIST)
        await expect(rows(page).first()).toBeVisible()
        await expectNoA11yViolations(page)
        await page.goto(CARD)
        await expect(tab(page, "Реквізити")).toBeVisible()
        await expectNoA11yViolations(page)
      })

  for (const width of [360, 768] as const)
    for (const language of ["uk", "en"] as const)
      test(`${width}px ${language}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await openWith(page, { language }, LIST)
        await expectNoA11yViolations(page)
        await page.goto(CARD)
        await expect(page.getByRole("tablist")).toBeVisible()
        await expectNoA11yViolations(page)
      })
})
