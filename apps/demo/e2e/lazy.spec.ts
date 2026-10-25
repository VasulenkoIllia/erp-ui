import { expect, test, type Page } from "@playwright/test"

import { chooseLanguage, expectNoA11yViolations, openWith } from "./helpers"

/**
 * ADR-0009: ліниві чанки й мови можуть не завантажитись (офлайн, застарілий чанк після деплою).
 * Замість білого екрана — стан помилки з повтором; мова лишається запасною й про це видно.
 */
test.use({ viewport: { width: 1440, height: 900 } })

const DATA_CHUNK = /\/DataPage-[\w-]+\.js$/
const AUTH_CHUNK = /\/AuthPage-[\w-]+\.js$/
const ENGLISH_CHUNKS = /\/(i18n-en|en)-[\w-]+\.js$/

/** Чанки йдуть через service worker MSW — перехоплювати їх треба на рівні контексту. */
async function blockChunks(page: Page, chunks: RegExp) {
  await page
    .context()
    .route(chunks, (route) => route.abort("internetdisconnected"))
}

test.describe("збій лінивого завантаження", () => {
  test("сторінка не завантажилась — «Спробувати ще» вантажить її знову", async ({
    page,
  }) => {
    await openWith(page, {})
    await blockChunks(page, DATA_CHUNK)
    await page.getByRole("link", { name: "Дані й моки" }).click()
    const failure = page.getByRole("alert")
    await expect(failure).toContainText("Не вдалося завантажити дані")
    // Стан замість усієї сторінки — її h1, єдиний на сторінці (ADR-0029, headingLevel).
    await expect(
      page.getByRole("main").getByRole("heading", {
        level: 1,
        name: "Не вдалося завантажити дані",
      }),
    ).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
    await expect(page.getByRole("main")).toHaveCount(1)
    // Оболонка жива: меню й пошук на місці.
    await expect(
      page.getByRole("button", { name: /Меню користувача/ }),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    // Повтор не вдався: кнопка зникла разом зі станом — фокус на h1 нового стану (WCAG 2.4.3).
    await failure.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(
      page.getByRole("button", { name: "Оновити сторінку" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Не вдалося завантажити дані",
      }),
    ).toBeFocused()

    await page.context().unroute(DATA_CHUNK)
    await failure.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(
      page.getByRole("grid", { name: "Рахунки клієнтам" }),
    ).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
    // Вдалий повтор — фокус на h1 сторінки, а не на body.
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
  })

  test("екран входу не завантажився — h1 у <main>, «Спробувати ще» вантажить його", async ({
    page,
  }) => {
    await blockChunks(page, AUTH_CHUNK)
    // openWith чекає h1: до кроку fix-kit-deps стан помилки входу був без нього.
    await openWith(page, {}, "/#/login", { user: null })
    const main = page.getByRole("main")
    await expect(
      main.getByRole("heading", {
        level: 1,
        name: "Не вдалося завантажити дані",
      }),
    ).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
    await expect(main).toHaveCount(1)
    await expectNoA11yViolations(page)

    await page.context().unroute(AUTH_CHUNK)
    await main.getByRole("button", { name: "Спробувати ще" }).click()
    // Рамки стану вже немає: один <main> — екрана входу, один h1 — і фокус на ньому.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вхід")
    await expect(main).toHaveCount(1)
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
  })

  test("мова не завантажилась — українська, <html lang> чесний, повтор у сповіщенні", async ({
    page,
  }) => {
    await openWith(page, {})
    await blockChunks(page, ENGLISH_CHUNKS)
    await chooseLanguage(page, "English")

    const notice = page.getByText(/Не вдалося завантажити мову інтерфейсу/)
    await expect(notice).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "uk")
    await expect(
      page.getByRole("heading", { level: 1, name: "Теми й вигляд" }),
    ).toBeVisible()

    await page.context().unroute(ENGLISH_CHUNKS)
    await page.getByRole("button", { name: "Повторити" }).click()
    await expect(
      page.getByRole("heading", { level: 1, name: "Themes & appearance" }),
    ).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(notice).toBeHidden()
  })
})
