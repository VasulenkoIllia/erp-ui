import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith } from "./helpers"

const PAGES = [
  "/",
  "/#/primitives",
  "/#/formats",
  "/#/icons",
  "/#/states",
  "/#/m/K2",
]

async function sidebarState(page: Page) {
  return page
    .locator('[data-slot="sidebar"][data-state]')
    .getAttribute("data-state")
}

test.describe("оболонка: десктоп", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("сайдбар із групами; активний пункт позначено; хлібні крихти", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/K2")
    const nav = page.getByRole("navigation", { name: "Основна навігація" })
    await expect(nav.getByText("Кіт", { exact: true })).toBeVisible()
    await expect(nav.getByText("Приклад ERP", { exact: true })).toBeVisible()
    await expect(
      nav.getByRole("link", { name: "Рахунки клієнтам" }),
    ).toHaveAttribute("aria-current", "page")
    const crumbs = page.getByRole("navigation", { name: "Шлях до сторінки" })
    await expect(crumbs).toContainText("Приклад ERP")
    await expect(crumbs).toContainText("Рахунки клієнтам")
    // Нижньої панелі на десктопі немає.
    await expect(
      page.getByRole("navigation", { name: "Швидкі розділи" }),
    ).toBeHidden()
  })

  test("Ctrl+B згортає сайдбар у вузьку панель і пам'ятає вибір; у полі вводу — ні", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/primitives")
    expect(await sidebarState(page)).toBe("expanded")
    await page.getByRole("textbox", { name: "Назва компанії" }).focus()
    await page.keyboard.press("Control+b")
    expect(await sidebarState(page)).toBe("expanded")

    await page.locator("main").focus()
    await page.keyboard.press("Control+b")
    await expect.poll(() => sidebarState(page)).toBe("collapsed")
    await page.reload()
    await expect.poll(() => sidebarState(page)).toBe("collapsed")
    // Підписи лишаються доступними скрінрідеру й у вузькій панелі.
    await expect(
      page
        .getByRole("navigation", { name: "Основна навігація" })
        .getByRole("link", { name: "Примітиви" }),
    ).toHaveAttribute("aria-current", "page")
  })

  test("«Перейти до вмісту» — перша зупинка Tab", async ({ page }) => {
    await openWith(page, {}, "/#/states")
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: "Перейти до вмісту" })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press("Enter")
    await expect(page.locator("main")).toBeFocused()
  })

  test("палітра команд: Ctrl+K, пошук, Enter переходить, фокус повертається", async ({
    page,
  }) => {
    await openWith(page, {}, "/")
    await page.locator("main").focus()
    await page.keyboard.press("Control+k")
    const palette = page.getByRole("dialog", { name: "Палітра команд" })
    await expect(palette).toBeVisible()
    const input = palette.getByRole("combobox", { name: "Пошук і команди" })
    await expect(input).toBeFocused()
    await input.fill("рахунк")
    await expect(
      palette.getByRole("option", { name: "Рахунки клієнтам" }),
    ).toBeVisible()
    await expect(
      palette.getByRole("option", { name: "Примітиви" }),
    ).toHaveCount(0)
    await page.keyboard.press("Enter")
    await expect(palette).toBeHidden()
    await expect(page).toHaveURL(/#\/m\/K2$/)

    // Пошук за ключовими словами й ID модуля; нічого не знайдено — повідомлення.
    await page.keyboard.press("Control+k")
    await input.fill("LC04")
    await expect(
      palette.getByRole("option", { name: "Фіскалізація (ПРРО)" }),
    ).toBeVisible()
    await input.fill("щось зовсім інше")
    await expect(palette.getByText("Нічого не знайдено")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(palette).toBeHidden()
  })

  test("палітра команд виконує дії: тема й мова", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openWith(page, { theme: "light" }, "/")
    await page.keyboard.press("Control+k")
    const input = page.getByRole("combobox", { name: "Пошук і команди" })
    await input.fill("темна")
    await page.keyboard.press("Enter")
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    await page.keyboard.press("Control+k")
    await input.fill("English")
    await page.keyboard.press("Enter")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
  })

  test("меню користувача: тема, палітра, щільність, темний сайдбар", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openWith(page, {}, "/#/states")
    const html = page.locator("html")
    // Перемикачі в меню не закривають його — так видно результат одразу.
    const open = async () => {
      if (!(await page.getByRole("menu").first().isVisible()))
        await page
          .getByRole("button", { name: "Меню користувача: Олена Коваль" })
          .click()
    }

    await open()
    await page.getByRole("menuitemradio", { name: "Темна" }).click()
    await expect(html).toHaveClass(/\bdark\b/)

    await open()
    await page.getByRole("menuitem", { name: /Палітра/ }).click()
    await page.getByRole("menuitemradio", { name: "Графіт" }).click()
    await expect(html).toHaveAttribute("data-palette", "graphite")

    await open()
    await page.getByRole("menuitem", { name: /Щільність/ }).click()
    await page.getByRole("menuitemradio", { name: "Компактна" }).click()
    await expect(html).toHaveAttribute("data-density", "compact")

    await open()
    await page.getByRole("menuitemcheckbox", { name: "Темний сайдбар" }).click()
    await expect(html).toHaveAttribute("data-sidebar", "dark")
  })

  test("меню користувача й перемикач компанії керуються з клавіатури", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/states")
    const switcher = page.getByRole("button", {
      name: /Змінити компанію: ТОВ «Зоряна логістика»/,
    })
    await switcher.focus()
    await page.keyboard.press("Enter")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(
      page.getByRole("button", { name: /Змінити компанію: ФОП Коваленко/ }),
    ).toBeVisible()

    const menu = page.getByRole("button", { name: /Меню користувача/ })
    await menu.focus()
    await page.keyboard.press("Enter")
    const dark = page.getByRole("menuitemradio", { name: "Темна" })
    await expect(dark).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dark).toBeHidden()
    await expect(menu).toBeFocused()
  })

  test("сповіщення: лічильник у підписі, панель відкривається", async ({
    page,
  }) => {
    await openWith(page, {}, "/")
    await page.getByRole("button", { name: "Сповіщення: 3 нові" }).click()
    await expect(page.getByText("Нових сповіщень немає")).toBeVisible()
  })
})

test.describe("оболонка: планшет", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("вузька панель з іконками; кнопка розгортає сайдбар", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/primitives")
    expect(await sidebarState(page)).toBe("collapsed")
    await expect(
      page
        .getByRole("navigation", { name: "Основна навігація" })
        .getByRole("link", { name: "Примітиви" }),
    ).toHaveAttribute("aria-current", "page")
    await page
      .getByRole("button", { name: "Згорнути чи розгорнути меню" })
      .first()
      .click()
    await expect.poll(() => sidebarState(page)).toBe("expanded")
  })
})

test.describe("оболонка: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("нижня панель: 4 розділи + «Ще» з повним меню", async ({ page }) => {
    await openWith(page, {}, "/#/primitives")
    const bottom = page.getByRole("navigation", { name: "Швидкі розділи" })
    await expect(bottom.getByRole("link")).toHaveCount(4)
    await expect(
      bottom.getByRole("link", { name: "Примітиви" }),
    ).toHaveAttribute("aria-current", "page")
    await bottom.getByRole("button", { name: "Ще" }).click()
    const sheet = page.getByRole("dialog", { name: "Навігація" })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("link", { name: "Рахунки клієнтам" }).click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/#\/m\/K2$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Рахунки клієнтам" }),
    ).toBeVisible()
  })

  test("елемент у фокусі не ховається під нижньою панеллю (WCAG 2.4.11)", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/primitives")
    const field = page.getByRole("textbox", { name: "Коментар до рахунку" })
    await field.focus()
    const box = await field.boundingBox()
    const bar = await page
      .getByRole("navigation", { name: "Швидкі розділи" })
      .boundingBox()
    expect(box && bar && box.y + box.height <= bar.y).toBe(true)
  })
})

test.describe("оболонка: без горизонтальної прокрутки", () => {
  for (const width of [360, 390, 768] as const)
    test(`${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      for (const path of PAGES) {
        await openWith(page, {}, path)
        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        )
        expect(scrollWidth, path).toBeLessThanOrEqual(width)
      }
    })
})

test.describe("оболонка: axe на нових сторінках", () => {
  for (const path of ["/#/icons", "/#/states", "/#/m/K2"])
    for (const theme of ["light", "dark"] as const)
      for (const width of [390, 1024, 1440] as const)
        test(`${path} ${theme} ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 })
          await openWith(page, { theme, palette: "sapphire" }, path)
          await expectNoA11yViolations(page)
        })

  test("темний сайдбар у світлій темі", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, { theme: "light", sidebar: "dark" }, "/#/m/K2")
    await expectNoA11yViolations(page)
  })

  test("відкрита палітра команд і меню користувача", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, "/")
    await page.keyboard.press("Control+k")
    await page.getByRole("combobox", { name: "Пошук і команди" }).fill("пал")
    await expectNoA11yViolations(page)
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: /Меню користувача/ }).click()
    await expectNoA11yViolations(page)
  })
})
