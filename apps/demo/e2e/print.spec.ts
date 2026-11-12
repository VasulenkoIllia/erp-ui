import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Крок PF08a (ADR-0062): друк рахунку з демо в PDF браузера на A4, довгий документ на кількох сторінках
 * без розриву рядка, лише аркуш і без оболонки, папір світлий і в темній темі, позначка чернетки,
 * аркуш англійською, стани й вузький екран.
 */
const PRINT_PAGE = "/#/print"

const sheet = (page: Page) => page.locator('[data-slot="print-sheet"]')

/** Сторінки PDF: об'єкти `/Type /Page`, без кореня `/Pages`. */
const pdfPages = (pdf: Buffer) =>
  pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0

/** Розмір сторінки PDF у пунктах: A4 — 595 × 842. */
function pdfPageSize(pdf: Buffer) {
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(
    pdf.toString("latin1"),
  )
  return {
    width: Math.round(Number(box?.[1])),
    height: Math.round(Number(box?.[2])),
  }
}

async function openPrint(page: Page, query = "", theme?: "light" | "dark") {
  await openWith(page, theme ? { theme } : {}, `${PRINT_PAGE}${query}`)
  await expect(sheet(page)).toBeVisible()
  // Логотип і печатка мають завантажитись до друку, як їх чекає «Друкувати».
  await expect
    .poll(() =>
      sheet(page)
        .locator("img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).complete),
        ),
    )
    .toBe(true)
}

test.describe("PF08a: друк", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("рахунок із картки друкується в PDF на одну сторінку A4, лише аркуш", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/data/inv-00001")
    // Сайдбар теж має «Друк» (сторінка демо): дія картки — в основній області.
    await page.getByRole("main").getByRole("link", { name: "Друк" }).click()
    await expect(page).toHaveURL(/#\/print\?id=inv-00001$/)
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole("heading", { level: 2 })).toHaveText(
      /^Рахунок на оплату № 2026-0001 від /,
    )
    await expect(sheet(page)).toContainText("Всього на суму:")
    await expectNoA11yViolations(page)

    await page.emulateMedia({ media: "print" })
    await expect(page.locator('[data-slot="topbar"]')).toBeHidden()
    await expect(page.locator('[data-slot="sidebar"]').first()).toBeHidden()
    await expect(
      page.getByRole("navigation", { name: "Варіанти аркуша" }),
    ).toBeHidden()
    await expect(page.getByRole("button", { name: "Друкувати" })).toBeHidden()
    await expect(sheet(page)).toBeVisible()

    const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true })
    expect(pdfPages(pdf)).toBe(1)
    expect(pdfPageSize(pdf)).toEqual({ width: 595, height: 842 })
  })

  test("довгий документ ділиться на сторінки: рядок не розривається, шапка таблиці на кожній", async ({
    page,
  }) => {
    await openPrint(page, "?variant=long")
    // 500 рядків «Великого документа»: 20 розділів, 5 нотаток, 475 товарів.
    await expect(sheet(page).locator('tr[data-kind="item"]')).toHaveCount(475)
    await page.emulateMedia({ media: "print" })
    const styles = await sheet(page).evaluate((root) => ({
      row: getComputedStyle(root.querySelector("tbody tr") as Element)
        .breakInside,
      head: getComputedStyle(root.querySelector("thead") as Element).display,
    }))
    expect(styles).toEqual({ row: "avoid", head: "table-header-group" })
    const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true })
    expect(pdfPages(pdf)).toBeGreaterThanOrEqual(10)
  })

  test("темна тема друкується світлою, аркуш світлий і на екрані", async ({
    page,
  }) => {
    await openPrint(page, "", "dark")
    const colors = () =>
      page.evaluate(() => ({
        page: getComputedStyle(document.body).color,
        sheet: getComputedStyle(
          document.querySelector('[data-slot="print-sheet"]') as Element,
        ).color,
      }))
    // На екрані сторінка темна, а аркуш світлий; на папері світла й сторінка.
    const screen = await colors()
    expect(screen.sheet).not.toBe(screen.page)
    await page.emulateMedia({ media: "print" })
    const paper = await colors()
    expect(paper.page).not.toBe(screen.page)
    expect(paper.sheet).toBe(screen.sheet)
  })

  test("класи dark: діють лише на екрані й поза аркушем", async ({ page }) => {
    await openPrint(page, "", "dark")
    // Пробні елементи з класом кіта (тло полів і кнопок у темній темі) на сторінці й в аркуші та
    // проба без класу — тло, яке має бути там, де dark: не діє.
    await page.evaluate(() => {
      const sheetElement = document.querySelector('[data-slot="print-sheet"]')
      for (const [name, parent, className] of [
        ["page", document.body, "dark:bg-input/30"],
        ["sheet", sheetElement, "dark:bg-input/30"],
        ["plain", document.body, ""],
      ] as const) {
        const probe = document.createElement("span")
        probe.className = className
        probe.dataset.probe = name
        parent?.append(probe)
      }
    })
    const background = (name: string) =>
      page
        .locator(`[data-probe="${name}"]`)
        .evaluate((element) => getComputedStyle(element).backgroundColor)
    const plain = await background("plain")
    expect(await background("page")).not.toBe(plain)
    expect(await background("sheet")).toBe(plain)
    await page.emulateMedia({ media: "print" })
    expect(await background("page")).toBe(plain)
  })

  test("«Друкувати» відкриває друк із назвою документа в заголовку сторінки", async ({
    page,
  }) => {
    await openPrint(page)
    await page.evaluate(() => {
      const titles: string[] = []
      ;(window as unknown as { printed: string[] }).printed = titles
      window.print = () => {
        titles.push(document.title)
        window.dispatchEvent(new Event("afterprint"))
      }
    })
    const before = await page.title()
    await page.getByRole("button", { name: "Друкувати" }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { printed: string[] }).printed,
        ),
      )
      .toEqual(["Рахунок на оплату 2026-0001"])
    expect(await page.title()).toBe(before)
  })

  test("чернетка без номера й з позначкою; аркуш англійською", async ({
    page,
  }) => {
    await openPrint(page, "?variant=draft")
    await expect(sheet(page).getByRole("heading", { level: 2 })).toHaveText(
      /^Рахунок на оплату \(без номера\) від /,
    )
    await expect(
      sheet(page).locator('[data-slot="print-watermark"]'),
    ).toHaveAttribute("data-label", "Чернетка")

    await page.getByRole("link", { name: "Англійською" }).click()
    await expect(sheet(page)).toHaveAttribute("lang", "en")
    await expect(sheet(page).getByRole("heading", { level: 2 })).toHaveText(
      /^Invoice No\. 2026-0001 dated /,
    )
    await expect(sheet(page)).toContainText("Total amount:")
    // Інтерфейс перегляду лишається мовою інтерфейсу.
    await expect(page.getByRole("button", { name: "Друкувати" })).toBeVisible()
  })

  test("стани: помилка з повтором, немає доступу; без аркуша немає й кнопки друку", async ({
    page,
  }) => {
    await openWith(page, {}, `${PRINT_PAGE}?variant=error`)
    await expect(
      page.getByRole("button", { name: /Спробувати ще/ }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Друкувати" })).toHaveCount(0)
    await page.getByRole("link", { name: "Немає доступу" }).click()
    await expect(
      page.locator('[data-slot="page-state"][data-kind="forbidden"]'),
    ).toBeVisible()
    await page.getByRole("link", { name: "Завантаження" }).click()
    await expect(
      page.getByRole("button", { name: "Друкувати" }),
    ).toHaveAttribute("aria-disabled", "true")
  })
})

test.describe("PF08a: друк на телефоні", () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test("аркуш зменшено за шириною без горизонтальної прокрутки; справжній розмір прокручується в межах перегляду", async ({
    page,
  }) => {
    await openPrint(page)
    await expectNoHorizontalScroll(page)
    await page.getByRole("button", { name: "Справжній розмір" }).click()
    await expectNoHorizontalScroll(page)
    const region = page.getByRole("region", { name: "Аркуш для друку" })
    await region.focus()
    await page.keyboard.press("ArrowRight")
    await expect
      .poll(() => region.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0)
    await expectNoA11yViolations(page)
  })
})
