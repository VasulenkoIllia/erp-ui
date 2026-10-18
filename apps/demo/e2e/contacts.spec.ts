import { expect, test, type Page } from "@playwright/test"

import { cellOf, expectNoA11yViolations, openWith, USERS } from "./helpers"

/**
 * Крок 1.4 (ADR-0025): модуль B1 «Контакти й компанії» на місці заглушки `/m/B1` з розширенням
 * проекту (`src/extensions/B1-contacts.ts`): статус «Призупинена», поля «Платник ПДВ» і «Зручний
 * канал», вкладки «Ключові» й «Нотатки», пояснення списку контактів. Фікстури детерміновані: у
 * компанії бухгалтера 48 контактів (32 представники, 16 приватних осіб) і 31 організація.
 */
const MODULE = "/#/m/B1"
const CONTACTS = "/#/m/B1/contacts"
const ORGANIZATIONS = "/#/m/B1/organizations"
/** Приватна особа без організації. */
const PRIVATE_CONTACT = "/#/m/B1/contacts/contact-003"
const PRIVATE_NAME = "Марта Романюк"
/** ФОП із двома рахунками. */
const FOP_CARD = "/#/m/B1/organizations/org-003"

const grid = (page: Page, name: string) =>
  page.getByRole("grid", { name, exact: true })
const rows = (page: Page, name: string) =>
  grid(page, name).locator('[role="row"][data-index]')
const listTab = (page: Page, name: RegExp) => page.getByRole("tab", { name })
const cardTabs = (page: Page) =>
  page.getByRole("tablist", { name: "Розділи організації" }).getByRole("tab")

test.describe("B1: контакти", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("адреса модуля веде на список; вкладки з лічильниками, вкладка розширення, пояснення з розширення", async ({
    page,
  }) => {
    await openWith(page, {}, MODULE)
    await expect(page).toHaveURL(/#\/m\/B1\/contacts$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Контакти")
    await expect(page.getByText(/працює студія/)).toBeVisible()
    await expect(listTab(page, /^Усі/)).toHaveText(/48/)
    await expect(listTab(page, /^Представники організацій/)).toHaveText(/32/)
    await expect(listTab(page, /^Приватні особи/)).toHaveText(/16/)
    await expect(listTab(page, /^Ключові/)).toHaveText(/11/)

    await listTab(page, /^Приватні особи/).click()
    await expect(page).toHaveURL(/[?&]tab=private/)
    const organizations = await cellOf(
      grid(page, "Контакти"),
      rows(page, "Контакти"),
      "Організація",
    )
    await expect(organizations.first()).toHaveText("Приватна особа")
    await expect(
      organizations.filter({ hasNotText: "Приватна особа" }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)
  })

  test("картка зі списку й «До контактів» із тією ж вкладкою; організація — посилання на її картку", async ({
    page,
  }) => {
    await openWith(page, {}, `${CONTACTS}?tab=representatives`)
    const first = rows(page, "Контакти").first()
    const name = (await first.getByRole("link").first().textContent()) ?? ""
    await first.getByRole("link", { name, exact: true }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
    await expect(page.getByText("Зручний канал")).toBeVisible()
    await page.getByRole("link", { name: "До контактів" }).click()
    await expect(page).toHaveURL(/[?&]tab=representatives/)
  })

  test("вибір організації: зберігається одразу, картка й організація бачать зв'язок", async ({
    page,
  }) => {
    await openWith(page, {}, PRIVATE_CONTACT)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      PRIVATE_NAME,
    )
    await expect(page.getByText("Приватна особа").first()).toBeVisible()
    const history = page.getByRole("region", { name: "Історія" })
    await expect(history.getByText("Подій ще немає.")).toBeVisible()
    await page
      .getByRole("combobox", { name: "Організація контакту", exact: true })
      .click()
    await page
      .getByRole("combobox", { name: "Пошук: Організація контакту" })
      .fill("агро")
    await page.getByRole("option", { name: /^ПП «Агросвіт»/ }).click()
    await expect(page.getByText("Організацію контакту змінено")).toBeVisible()
    await expect(
      page.getByRole("link", { name: "ПП «Агросвіт»", exact: true }),
    ).toBeVisible()
    // Історія перечитується з новою версією запису (ADR-0028, п. 7).
    await expect(
      history.getByRole("button", { name: "Подробиці: Контакти: зміна" }),
    ).toHaveCount(1)

    await page
      .getByRole("link", { name: "Відкрити картку організації" })
      .click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "ПП «Агросвіт»",
    )
    await cardTabs(page).filter({ hasText: "Контактні особи" }).click()
    await expect(page).toHaveURL(/[?&]tab=contacts/)
    await expect(grid(page, "Контактні особи: ПП «Агросвіт»")).toContainText(
      PRIVATE_NAME,
    )
  })

  test("без права змінювати контакти поле організації — лише читання", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/B1/contacts/contact-001", {
      user: USERS.sales,
    })
    const field = page.getByRole("textbox", { name: "Організація контакту" })
    await expect(field).toHaveAttribute("readonly")
    await expect(field).toHaveValue("ТОВ «Дніпро Трейд»")
  })
})

test.describe("B1: організації", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("статус розширення — вкладка й бейдж; поле розширення — колонка", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS)
    await expect(listTab(page, /^Усі/)).toHaveText(/31/)
    await listTab(page, /^Призупинена/).click()
    await expect(page).toHaveURL(/[?&]tab=suspended/)
    const statuses = await cellOf(
      grid(page, "Організації"),
      rows(page, "Організації"),
      "Статус",
    )
    await expect(statuses).toHaveCount(3)
    await expect(statuses.filter({ hasNotText: "Призупинена" })).toHaveCount(0)
    await expect(
      grid(page, "Організації").getByRole("columnheader", {
        name: "Платник ПДВ",
      }),
    ).toBeVisible()
  })

  test("картка: вкладки модуля й розширення, рахунки з детального запису, вкладка в адресі", async ({
    page,
  }) => {
    await openWith(page, {}, FOP_CARD)
    await expect(cardTabs(page)).toHaveText([
      "Реквізити",
      "Нотатки",
      "Адреси",
      "Рахунки",
      "Контактні особи",
    ])
    await expect(page.getByText("РНОКПП").first()).toBeVisible()
    await cardTabs(page).filter({ hasText: "Рахунки" }).click()
    await expect(page).toHaveURL(/[?&]tab=bankAccounts/)
    const accounts = rows(page, "Банківські рахунки: ФОП Коваленко О. В.")
    await expect(accounts).toHaveCount(2)
    await expect(accounts.first()).toContainText("Основний")
    await expectNoA11yViolations(page)

    await page.reload()
    await expect(cardTabs(page).filter({ hasText: "Рахунки" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })
})

test.describe("B1: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картки списків, історія — остання вкладка картки, без прокрутки вбік", async ({
    page,
  }) => {
    await openWith(page, {}, CONTACTS)
    await expect(page.locator("article[data-card]").first()).toBeVisible()
    await page.goto(FOP_CARD)
    await expect(cardTabs(page).last()).toHaveText("Історія")
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
  })
})

test.describe("B1: axe", () => {
  for (const theme of ["light", "dark"] as const)
    test(`списки й картки sapphire ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openWith(page, { palette: "sapphire", theme }, CONTACTS)
      await expect(rows(page, "Контакти").first()).toBeVisible()
      await expectNoA11yViolations(page)
      await page.goto(PRIVATE_CONTACT)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        PRIVATE_NAME,
      )
      await expectNoA11yViolations(page)
      await page.goto(ORGANIZATIONS)
      await expect(rows(page, "Організації").first()).toBeVisible()
      await expectNoA11yViolations(page)
      await page.goto(FOP_CARD)
      await expect(cardTabs(page).first()).toBeVisible()
      await expectNoA11yViolations(page)
    })

  test("360px англійською", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 })
    await openWith(page, { language: "en" }, CONTACTS)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contacts")
    await expect(page.getByText(/the studio works with/)).toBeVisible()
    await expectNoA11yViolations(page)
    await page.goto(FOP_CARD)
    await expect(
      page.getByRole("tablist", { name: "Organization sections" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
