import { expect, test, type Page } from "@playwright/test"

import { chooseLanguage, openWith } from "./helpers"

/**
 * ADR-0009: ліниві чанки й мови можуть не завантажитись (офлайн, застарілий чанк після деплою).
 * Замість білого екрана — стан помилки з повтором; мова лишається запасною й про це видно.
 */
test.use({ viewport: { width: 1440, height: 900 } })

const DATA_CHUNK = /\/DataPage-[\w-]+\.js$/
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
    // Оболонка жива: меню й пошук на місці.
    await expect(
      page.getByRole("button", { name: /Меню користувача/ }),
    ).toBeVisible()

    await page.context().unroute(DATA_CHUNK)
    await failure.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(
      page.getByRole("grid", { name: "Рахунки клієнтам" }),
    ).toBeVisible()
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
