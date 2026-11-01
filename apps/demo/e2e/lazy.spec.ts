import { expect, test, type Locator, type Page } from "@playwright/test"

import { chooseLanguage, expectNoA11yViolations, openWith } from "./helpers"

/**
 * ADR-0009, ADR-0055: ліниві чанки й мови можуть не завантажитись (офлайн, застарілий чанк після
 * деплою). Замість білого екрана — стан із «Оновити сторінку» й повтором; мова лишається запасною
 * й про це видно.
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

/** Після деплою старого файла немає: сервер із запасним index.html відповідає сторінкою, а не JS. */
async function removeChunks(page: Page, chunks: RegExp) {
  await page.context().route(chunks, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>app</title>",
    }),
  )
}

/** Клік, після якого сторінка завантажується заново. */
async function clickAndWaitForLoad(page: Page, button: Locator) {
  await Promise.all([page.waitForEvent("load"), button.click()])
}

test.describe("збій лінивого завантаження", () => {
  test("сторінка не завантажилась — «Спробувати ще» вантажить її знову", async ({
    page,
  }) => {
    await openWith(page, {})
    await blockChunks(page, DATA_CHUNK)
    await page.getByRole("link", { name: "Дані й моки" }).click()
    const failure = page.getByRole("alert")
    await expect(failure).toContainText("Потрібно оновити сторінку")
    // Стан замість усієї сторінки — її h1, єдиний на сторінці (ADR-0029, headingLevel).
    await expect(
      page.getByRole("main").getByRole("heading", {
        level: 1,
        name: "Потрібно оновити сторінку",
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
      page.getByRole("heading", {
        level: 1,
        name: "Потрібно оновити сторінку",
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
        name: "Потрібно оновити сторінку",
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

  test("після деплою файла немає — «Оновити сторінку» відкриває ту саму адресу", async ({
    page,
  }) => {
    await openWith(page, {})
    await removeChunks(page, DATA_CHUNK)
    await page.getByRole("link", { name: "Дані й моки" }).click()
    const failure = page.getByRole("alert")
    await expect(failure).toContainText("Застосунок міг оновитися")
    await expectNoA11yViolations(page)

    await page.context().unroute(DATA_CHUNK)
    await clickAndWaitForLoad(
      page,
      failure.getByRole("button", { name: "Оновити сторінку" }),
    )
    await expect(
      page.getByRole("grid", { name: "Рахунки клієнтам" }),
    ).toBeVisible()
  })

  test("оновлення не допомогло — кнопки немає, чесний текст, повтор працює", async ({
    page,
  }) => {
    await openWith(page, {})
    await removeChunks(page, DATA_CHUNK)
    await page.getByRole("link", { name: "Дані й моки" }).click()
    const failure = page.getByRole("alert")
    await clickAndWaitForLoad(
      page,
      failure.getByRole("button", { name: "Оновити сторінку" }),
    )

    await expect(failure).toContainText("Оновлення не допомогло")
    await expect(
      failure.getByRole("button", { name: "Спробувати ще" }),
    ).toBeVisible()
    await expect(
      failure.getByRole("button", { name: "Оновити сторінку" }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)

    await page.context().unroute(DATA_CHUNK)
    await failure.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(
      page.getByRole("grid", { name: "Рахунки клієнтам" }),
    ).toBeVisible()
  })

  test("без мережі — стан офлайн без оновлення, після зв'язку сторінка приходить", async ({
    page,
  }) => {
    await openWith(page, {})
    await page.context().setOffline(true)
    await page.getByRole("link", { name: "Дані й моки" }).click()
    const failure = page.getByRole("alert")
    await expect(failure).toContainText("Немає з'єднання")
    await expect(
      failure.getByRole("button", { name: "Оновити сторінку" }),
    ).toHaveCount(0)

    await page.context().setOffline(false)
    await failure.getByRole("button", { name: "Перевірити ще раз" }).click()
    await expect(
      page.getByRole("grid", { name: "Рахунки клієнтам" }),
    ).toBeVisible()
  })

  test("незбережені зміни — питає на місці, без другого запиту браузера", async ({
    page,
  }) => {
    const nativeDialogs: string[] = []
    page.on("dialog", (dialog) => {
      nativeDialogs.push(dialog.type())
      void dialog.accept()
    })
    await openWith(page, {}, "/#/states")
    const failure = page.getByTestId("chunk-failure")
    const reload = failure.getByRole("button", { name: "Оновити сторінку" })
    await page
      .getByRole("checkbox", { name: "Форма поруч має незбережені зміни" })
      .click()

    await reload.click()
    const keep = failure.getByRole("button", { name: "Не оновлювати" })
    await expect(keep).toBeFocused()
    await expect(failure).toContainText("Є незбережені зміни")
    await expectNoA11yViolations(page)
    await keep.click()
    await expect(reload).toBeFocused()

    await reload.click()
    await clickAndWaitForLoad(
      page,
      failure.getByRole("button", { name: "Усе одно оновити" }),
    )
    await expect(failure).toContainText("Оновлення не допомогло")
    expect(nativeDialogs).toEqual([])
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
