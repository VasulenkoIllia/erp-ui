import { expect, test, type Page } from "@playwright/test"

import {
  confirmWithPassword,
  expectNoA11yViolations,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок A2c3 (ADR-0040): запрошення на адресу, що вже має обліковий запис: вхід прямо на екрані
 * запрошення, одна кнопка для того, хто вже ввійшов, вихід для того, хто ввійшов іншим записом;
 * запрошення людини з іншої компанії; поле сервера `canManage` на картці людини.
 */
const INVITE = "/#/login/invite?token=demo-invite-account"
const TITLE = "Приєднатися до ФОП Коваленко О. В."
const USER_ID = "u-ivan"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()
const tokenInTab = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem("erp-ui:email-link-token:invite"))
const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )

async function expectJoined(page: Page) {
  await expect(toast(page, `Ви приєднались до ФОП Коваленко`)).toBeVisible()
  await expect(page).toHaveURL(/#\/data$/)
  expect(await tokenInTab(page)).toBeNull()
  expect(
    await page.evaluate(() => localStorage.getItem("erp-ui:company")),
  ).toBe("kovalenko")
}

test.describe("запрошення наявним обліковим записом", () => {
  test("гість: вхід на екрані запрошення, запрошення прийнято, нова компанія поточна", async ({
    page,
  }) => {
    await openWith(page, {}, INVITE, { user: null })
    await expect(heading(page)).toHaveText(TITLE)
    await expect(page.getByText(/Олена Коваль запрошує вас/)).toBeVisible()
    await expect(
      page.getByText("Увійдіть, щоб прийняти запрошення."),
    ).toBeVisible()
    await expect(page.getByLabel("Новий пароль")).toHaveCount(0)
    await expect(page.getByLabel("Email")).toHaveValue("ivan@zoriana.example")
    await expect(
      page.getByRole("link", { name: "Зареєструватися" }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)

    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expectJoined(page)

    await page.reload()
    await expect(
      page.getByRole("button", { name: /Меню користувача: Іван/ }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => localStorage.getItem("erp-ui:company")),
    ).toBe("kovalenko")
  })

  test("неправильний пароль: лишаємось на екрані запрошення, токен у вкладці", async ({
    page,
  }) => {
    await openWith(page, {}, INVITE, { user: null })
    await page.getByLabel("Пароль", { exact: true }).fill("wrong-password")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(page.getByRole("alert").first()).toBeVisible()
    await expect(heading(page)).toHaveText(TITLE)
    expect(await tokenInTab(page)).toBe("demo-invite-account")
  })

  test("уже ввійшла цим записом: одна кнопка", async ({ page }) => {
    await openWith(page, {}, INVITE, { user: USERS.sales })
    await expect(heading(page)).toHaveText(TITLE)
    await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0)
    await expectNoA11yViolations(page)
    await page.getByRole("button", { name: "Прийняти запрошення" }).click()
    await expectJoined(page)
  })

  test("увійшла іншим записом: вихід, вхід потрібним, запрошення прийнято", async ({
    page,
  }) => {
    await openWith(page, {}, INVITE)
    await expect(
      page.getByText(
        "Ви увійшли іншим обліковим записом. Вийдіть, щоб прийняти запрошення для ivan@zoriana.example.",
      ),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    await page.getByRole("button", { name: "Вийти", exact: true }).click()
    await expect(page.getByLabel("Email")).toHaveValue("ivan@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expectJoined(page)
  })

  test("на формі ввели іншу адресу: запрошення не прийнято, екран каже вийти", async ({
    page,
  }) => {
    await openWith(page, {}, INVITE, { user: null })
    await page.getByLabel("Email").fill("taras@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(
      page.getByText(/Ви увійшли іншим обліковим записом/),
    ).toBeVisible()
    await expect(page).toHaveURL(/#\/login\/invite$/)
  })

  test.describe("телефон", () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test("усі варіанти без горизонтального прокручування", async ({ page }) => {
      await openWith(page, {}, INVITE, { user: null })
      await expect(heading(page)).toHaveText(TITLE)
      expect(await noHorizontalScroll(page)).toBe(true)
      await expectNoA11yViolations(page)
    })

    test("кнопка прийняття — у ширину екрана, axe", async ({ page }) => {
      await openWith(page, {}, INVITE, { user: USERS.sales })
      await expect(
        page.getByRole("button", { name: "Прийняти запрошення" }),
      ).toBeVisible()
      expect(await noHorizontalScroll(page)).toBe(true)
      await expectNoA11yViolations(page)
    })
  })
})

test.describe("людина з іншої компанії", () => {
  test("адреса з іншої компанії запрошується, як нова", async ({ page }) => {
    await page.addInitScript(() => {
      if (window === window.top)
        localStorage.setItem("erp-ui:company", "kovalenko")
    })
    await openWith(page, {}, "/#/m/A2/invitations")
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("ivan@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Аудитор" }).check()
    await dialog.getByRole("button", { name: "Надіслати запрошення" }).click()
    await confirmWithPassword(page)
    await expect(
      toast(page, "Запрошення надіслано на ivan@zoriana.example"),
    ).toBeVisible()
  })
})

test.describe("картка людини: поле сервера canManage", () => {
  test("права людини в іншій компанії: дії доступу неактивні до запиту", async ({
    page,
  }) => {
    // Іван працює ще й у другій компанії власником: у першій роль менша, а сервер знає про обидві.
    await page.addInitScript(
      ([id]) => {
        if (window !== window.top) return
        localStorage.setItem(
          "erp-ui:mock-joined-companies:v1",
          JSON.stringify({
            [id]: [{ id: "kovalenko", name: "ФОП Коваленко О. В." }],
          }),
        )
        localStorage.setItem(
          "erp-ui:mock-user-roles",
          JSON.stringify({
            [id]: { zoriana: ["sales"], kovalenko: ["owner"] },
          }),
        )
      },
      [USER_ID] as const,
    )
    await openWith(page, {}, `/#/m/A2/users/${USER_ID}?tab=access`)
    const block = page.getByRole("button", { name: "Заблокувати" })
    await expect(block).toHaveAttribute("aria-disabled", "true")
    await expect(
      page.getByText(/Змінювати доступ цієї людини може лише той/).first(),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("людина ще в одній компанії: шторка доступу теж знає про це", async ({
    page,
  }) => {
    await page.addInitScript(
      ([id]) => {
        if (window !== window.top) return
        localStorage.setItem(
          "erp-ui:mock-joined-companies:v1",
          JSON.stringify({
            [id]: [{ id: "c-other", name: "ТОВ «Сусіди»" }],
          }),
        )
      },
      [USER_ID] as const,
    )
    await openWith(page, {}, "/#/settings/users")
    await page.getByRole("button", { name: "Доступ: Іван Петренко" }).click()
    const sheet = page.getByRole("dialog", { name: "Доступ: Іван Петренко" })
    await expect(
      sheet.getByRole("button", { name: "Заблокувати" }),
    ).toHaveAttribute("aria-disabled", "true")
  })
})
