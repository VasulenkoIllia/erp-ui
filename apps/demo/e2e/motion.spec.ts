import { expect, test, type Page } from "@playwright/test"

import { chooseLanguage, openWith } from "./helpers"

/** ADR-0009: токени руху доходять до попапів, а в пам'яті лише мова інтерфейсу. */
test.use({ viewport: { width: 1440, height: 900 } })

const userMenu = (page: Page) =>
  page.getByRole("button", { name: /Меню користувача/ })

/** Тривалість і крива анімації появи меню користувача. */
async function menuAnimation(page: Page) {
  await userMenu(page).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  return menu.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      duration: style.animationDuration,
      easing: style.animationTimingFunction,
    }
  })
}

test.describe("рух і швидкість", () => {
  test("меню з'являється за duration-fast з кривою появи", async ({ page }) => {
    await openWith(page, {})
    expect(await menuAnimation(page)).toEqual({
      duration: "0.15s",
      easing: "cubic-bezier(0, 0, 0.2, 1)",
    })
  })

  test("зменшений рух вимикає анімацію", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openWith(page, {})
    expect((await menuAnimation(page)).duration).toBe("1e-05s")
  })

  test("англійські рядки вантажаться лише після перемикання мови", async ({
    page,
  }) => {
    const englishChunks = () =>
      page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name.split("/").pop() ?? "")
          .filter((name) => /^(i18n-en|en)-[\w-]+\.js$/.test(name)),
      )
    await openWith(page, {})
    expect(await englishChunks()).toEqual([])

    await chooseLanguage(page, "English")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(
      page.getByRole("heading", { level: 1, name: "Themes & appearance" }),
    ).toBeVisible()
    expect(await englishChunks()).toHaveLength(2)
  })

  test("збережена англійська — перший кадр уже англійською", async ({
    page,
  }) => {
    // Перший заголовок h1, що з'явився, записуємо до будь-якого рендеру React.
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        const heading = document.querySelector("h1")?.textContent
        if (heading) {
          sessionStorage.setItem("first-h1", heading)
          observer.disconnect()
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await openWith(page, { language: "en" })
    expect(await page.evaluate(() => sessionStorage.getItem("first-h1"))).toBe(
      "Themes & appearance",
    )
  })
})
