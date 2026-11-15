import { expect, test } from "@playwright/test"

import { chooseInSubmenu, openWith } from "./helpers"

test.describe("перемикачі вигляду", () => {
  test("ставлять атрибути на <html> і переживають перезавантаження", async ({
    page,
  }) => {
    // Без openWith: його init-скрипт перезаписав би вибір під час reload.
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto("/")
    const html = page.locator("html")

    await page.getByRole("radio", { name: "Графіт" }).check()
    await page.getByRole("radio", { name: "Темна" }).check()
    await page.getByRole("radio", { name: "Компактна" }).check()
    await page.getByRole("radio", { name: "Темний" }).check()

    await expect(html).toHaveAttribute("data-palette", "graphite")
    await expect(html).toHaveClass(/\bdark\b/)
    await expect(html).toHaveAttribute("data-density", "compact")
    await expect(html).toHaveAttribute("data-sidebar", "dark")

    await page.reload()
    await expect(html).toHaveAttribute("data-palette", "graphite")
    await expect(html).toHaveClass(/\bdark\b/)
    await expect(html).toHaveAttribute("data-density", "compact")
    await expect(page.getByRole("radio", { name: "Графіт" })).toBeChecked()
  })

  test("тема «Як у системі» слідує за prefers-color-scheme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await openWith(page, { theme: "system" })
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)

    await page.emulateMedia({ colorScheme: "light" })
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
  })

  test("щільність змінює висоту рядків", async ({ page }) => {
    await openWith(page, { density: "comfortable" })
    const row = page.getByRole("row").nth(1)
    expect((await row.boundingBox())?.height).toBeCloseTo(44, 0)

    await page.getByRole("radio", { name: "Компактна" }).check()
    expect((await row.boundingBox())?.height).toBeCloseTo(32, 0)
  })

  test("меню користувача: проект ховає палітру й щільність, мову зберігає сам", async ({
    page,
  }) => {
    await openWith(page, {})
    const menuOf = (name: string) =>
      page.getByRole("button", { name: `Меню користувача: ${name}` })

    await menuOf("Ігор Савчук").click()
    const menu = page.getByRole("menu")
    await expect(
      menu.getByRole("menuitemradio", { name: "Темна" }),
    ).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: /Мова/ })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: /Палітра/ })).toHaveCount(0)
    await expect(menu.getByRole("menuitem", { name: /Щільність/ })).toHaveCount(
      0,
    )
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()

    await menuOf("Ніна Левченко").click()
    await chooseInSubmenu(page, /Мова/, "English")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(
      page.getByRole("status").filter({ hasText: "English" }),
    ).toHaveText("Language “English” saved on the server (demo)")
  })

  test("усе керується з клавіатури", async ({ page }) => {
    await openWith(page, { palette: "sapphire" })
    const sapphire = page.getByRole("radio", { name: "Сапфір" })
    // Перший Tab — «Перейти до вмісту»; Enter переносить фокус на вміст, наступний Tab — перша група перемикачів.
    await page.keyboard.press("Tab")
    await expect(
      page.getByRole("link", { name: "Перейти до вмісту" }),
    ).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.locator("main")).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(sapphire).toBeFocused()

    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("radio", { name: "Графіт" })).toBeFocused()
    await expect(page.locator("html")).toHaveAttribute(
      "data-palette",
      "graphite",
    )

    await page.keyboard.press("Tab")
    await expect(
      page.getByRole("radio", { name: "Як у системі" }),
    ).toBeFocused()
  })
})
