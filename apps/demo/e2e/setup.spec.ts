import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  confirmWithPassword,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Онбординг PF12 (ADR-0044): майстер першого запуску модуля A1 і чек-лист «Почніть роботу». У компанії
 * бухгалтерки реквізити заповнено, а логотипа немає. Новий обліковий запис — порожня компанія.
 */
const WIZARD = "/#/m/A1/setup"
const COMPANY = "/#/m/A1/company"
const SETUP_PAGE = "/#/setup"

const next = (page: Page) =>
  page.getByRole("button", { name: "Далі", exact: true })
const stepHeading = (page: Page, name: RegExp) =>
  page.getByRole("heading", { level: 2, name })
const checklist = (page: Page) =>
  page.locator('[data-slot="setup-checklist"]').first()
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

/** Новий обліковий запис: порожня компанія, і майстер уже відкритий. */
const signUp = async (page: Page) => {
  await openWith(page, {}, "/#/signup", { user: null })
  await page.getByLabel("Ваше ім'я").fill("Ірина Нова")
  await page.getByLabel("Email").fill("iryna@new.example")
  await page.getByLabel("Пароль", { exact: true }).fill("Very-strong-demo-1")
  await page.getByLabel("Назва компанії").fill("Нова компанія")
  await page.getByRole("button", { name: "Створити акаунт" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Підтвердьте email",
  )
  await page.getByLabel("Код", { exact: true }).fill("123456")
  await expect(
    page.getByRole("heading", { level: 1, name: "Налаштування компанії" }),
  ).toBeVisible()
}

test.describe("майстер першого запуску", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("після реєстрації відкривається майстер: реквізити порожні й зберігаються кроком", async ({
    page,
  }) => {
    await signUp(page)
    await expect(page).toHaveURL(/#\/m\/A1\/setup/)
    await expect(page.getByLabel("Коротка назва")).toHaveValue("Нова компанія")

    await next(page).click()
    await expect(stepHeading(page, /Реквізити/)).toBeVisible()
    await expect(page.getByText("Заповніть це поле").first()).toBeVisible()
    await page.getByLabel("ЄДРПОУ").fill("32855961")
    await next(page).click()
    await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()
  })

  test("кроки до кінця: хибний код не пускає далі, огляд показує збережене, кінець веде на картку", async ({
    page,
  }) => {
    await openWith(page, {}, WIZARD)
    await page.getByLabel("ЄДРПОУ").fill("32855962")
    await next(page).click()
    await expect(page.getByText(/контрольн/i).first()).toBeVisible()
    await expect(stepHeading(page, /Реквізити/)).toBeVisible()
    await page.getByLabel("ЄДРПОУ").fill("32855961")
    await page.getByLabel("Повна назва").fill("ТОВ «Зоряна логістика плюс»")
    await next(page).click()
    await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()

    await page.getByRole("combobox", { name: "Палітра" }).click()
    await page.getByRole("option", { name: "Графіт" }).click()
    await next(page).click()
    await expect(stepHeading(page, /Колеги/)).toBeVisible()
    await next(page).click()
    await expect(stepHeading(page, /Огляд/)).toBeVisible()
    await expect(page.getByText("ТОВ «Зоряна логістика плюс»")).toBeVisible()
    await expect(
      page.getByRole("definition").filter({ hasText: "Графіт" }),
    ).toBeVisible()

    await page.getByRole("button", { name: "Завершити налаштування" }).click()
    await expect(toast(page, "Компанію налаштовано")).toBeVisible()
    await expect(page).toHaveURL(/#\/m\/A1\/company/)
    await expect(page.getByLabel("Повна назва")).toHaveValue(
      "ТОВ «Зоряна логістика плюс»",
    )
  })

  test("пропустити майстер можна на будь-якому кроці, а прогрес лишається після перезавантаження", async ({
    page,
  }) => {
    await openWith(page, {}, WIZARD)
    await next(page).click()
    await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()
    await page.reload()
    await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()
    await page.getByRole("button", { name: "Пропустити майстер" }).click()
    await expect(page).toHaveURL(/#\/m\/A1\/company/)
  })

  test("пропущений крок палітри нічого не зберігає", async ({ page }) => {
    const patches: string[] = []
    await page.route("**/api/v1/company", async (route) => {
      if (route.request().method() === "PATCH")
        patches.push(route.request().postData() ?? "")
      await route.fallback()
    })
    await openWith(page, {}, WIZARD)
    await next(page).click()
    await page.getByRole("combobox", { name: "Палітра" }).click()
    await page.getByRole("option", { name: "Графіт" }).click()
    await page.getByRole("button", { name: "Пропустити", exact: true }).click()
    await expect(stepHeading(page, /Колеги/)).toBeVisible()
    await page.getByRole("button", { name: "Назад" }).click()
    await expect(page.getByRole("combobox", { name: "Палітра" })).toHaveText(
      /Як у бренду/,
    )
    expect(patches).toEqual([])
  })

  test("пробіл у кінці поля не зміна: «Далі» не шле запит", async ({
    page,
  }) => {
    const patches: string[] = []
    await page.route("**/api/v1/company", async (route) => {
      if (route.request().method() === "PATCH")
        patches.push(route.request().postData() ?? "")
      await route.fallback()
    })
    await openWith(page, {}, WIZARD)
    const name = page.getByLabel("Коротка назва")
    await expect(name).not.toHaveValue("")
    await name.fill(`${await name.inputValue()} `)
    await next(page).click()
    await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()
    expect(patches).toEqual([])
    // Збережено все, тож вихід не питає про незбережені зміни.
    await page.getByRole("button", { name: "Пропустити майстер" }).click()
    await expect(page).toHaveURL(/#\/m\/A1\/company/)
  })

  test("у посиланні не можна перестрибнути на огляд: майстер починає з реквізитів", async ({
    page,
  }) => {
    await openWith(page, {}, `${WIZARD}?step=review`)
    await expect(stepHeading(page, /Реквізити/)).toBeVisible()
  })

  test("з чек-листа одразу на «Колеги»: завершення не каже, що все готово", async ({
    page,
  }) => {
    await signUp(page)
    await page.getByRole("button", { name: "Пропустити майстер" }).click()
    await expect(page).toHaveURL(/#\/m\/A1\/company/)
    await page.evaluate(() => {
      window.location.hash = "#/setup"
    })
    await checklist(page)
      .getByRole("link", { name: /^Запросити:/ })
      .click()
    await expect(stepHeading(page, /Колеги/)).toBeVisible()
    await next(page).click()
    await expect(stepHeading(page, /Огляд/)).toBeVisible()
    await page.getByRole("button", { name: "Завершити налаштування" }).click()
    await expect(toast(page, "Реквізити ще не заповнено")).toBeVisible()
    await expect(toast(page, "Компанію налаштовано")).toBeHidden()
  })

  test("запрошення на кроці «Колеги» не переводить майстер далі", async ({
    page,
  }) => {
    await openWith(page, {}, `${WIZARD}?step=team`)
    await expect(stepHeading(page, /Колеги/)).toBeVisible()
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("new@zoriana.example")
    await dialog.getByRole("checkbox").first().check()
    await dialog.getByRole("button", { name: /Надіслати/ }).click()
    await confirmWithPassword(page)
    await expect(dialog).toBeHidden()
    await expect(
      page.getByText("new@zoriana.example", { exact: true }),
    ).toBeVisible()
    await expect(stepHeading(page, /Колеги/)).toBeVisible()
  })

  test("без права змінювати компанію майстра немає: сторінка веде на картку", async ({
    page,
  }) => {
    await openWith(page, {}, WIZARD, { user: USERS.sales })
    await expect(page).toHaveURL(/#\/m\/A1\/company/)
    await expect(next(page)).toBeHidden()
  })

  test("збій профілю: стан помилки, а не порожній майстер", async ({
    page,
  }) => {
    await openWith(page, {}, COMPANY)
    await chooseScenario(page, "Помилка сервера")
    await page.goto(WIZARD)
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Спробувати ще" }).first(),
    ).toBeVisible()
    await expect(next(page)).toBeHidden()
  })
})

test.describe("чек-лист «Почніть роботу»", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("рахує з даних компанії: реквізити зроблено, логотип і колеги чекають", async ({
    page,
  }) => {
    await openWith(page, {}, SETUP_PAGE)
    const list = checklist(page)
    await expect(list.getByText("Зроблено 2 з 3")).toBeVisible()
    await expect(
      list.getByRole("link", { name: "Завантажити: Додайте логотип" }),
    ).toBeVisible()
    await expect(list.getByRole("link", { name: /Заповнити/ })).toBeHidden()
    await list.getByRole("link", { name: "Запустити майстер" }).click()
    await expect(page).toHaveURL(/#\/m\/A1\/setup/)
  })

  test("«Не потрібно»: лишається після перезавантаження, повертається, останній пункт закриває чек-лист", async ({
    page,
  }) => {
    await openWith(page, {}, SETUP_PAGE)
    const list = checklist(page)
    await expect(list.getByText("Зроблено 2 з 3")).toBeVisible()
    const dismiss = list.getByRole("button", {
      name: "Не потрібно: Додайте логотип",
    })
    await dismiss.focus()
    await dismiss.press("Enter")
    // Чек-лист закрито останнім пунктом: фокус на повідомленні, а не на порожньому місці.
    await expect(
      page.getByRole("status").filter({ hasText: "Усе налаштовано" }),
    ).toBeFocused()
    await page.reload()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByText("Зроблено 1 з 3")).toBeVisible()
  })

  test("«Повернути»: фокус лишається на тому самому місці", async ({
    page,
  }) => {
    await openWith(page, {}, SETUP_PAGE)
    const sample = page
      .locator('[data-slot="setup-checklist"]')
      .filter({ hasText: "Заповніть реквізити" })
      .last()
    await sample
      .getByRole("button", { name: "Не потрібно: Запросіть колег" })
      .click()
    const restore = sample.getByRole("button", {
      name: "Повернути: Запросіть колег",
    })
    await expect(restore).toBeFocused()
    await restore.click()
    await expect(
      sample.getByRole("button", { name: "Не потрібно: Запросіть колег" }),
    ).toBeFocused()
  })

  test("без мережі: стан у картці, а не вічний скелетон", async ({ page }) => {
    await openWith(page, {}, SETUP_PAGE)
    await chooseScenario(page, "Офлайн")
    await page.goto(SETUP_PAGE)
    await page.reload()
    await expect(checklist(page).locator('[data-kind="offline"]')).toBeVisible()
  })

  test("без права змінювати компанію чек-листа немає", async ({ page }) => {
    await openWith(page, {}, SETUP_PAGE, { user: USERS.sales })
    await expect(page.getByText("Зроблено 2 з 3")).toBeHidden()
  })
})

test.describe("онбординг: адаптив і доступність", () => {
  for (const [width, height] of [
    [360, 740],
    [768, 1024],
    [1440, 900],
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${String(width)} px, ${theme}: axe, без горизонтальної прокрутки`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ colorScheme: theme })
        await openWith(page, { theme }, SETUP_PAGE)
        await expect(checklist(page).getByText(/Зроблено \d/)).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)
        await openWith(page, { theme }, WIZARD)
        await expect(next(page)).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)
        await next(page).click()
        await expect(stepHeading(page, /Логотип і палітра/)).toBeVisible()
        await expectNoHorizontalScroll(page)
        await expectNoA11yViolations(page)
      })
    }
  }
})
