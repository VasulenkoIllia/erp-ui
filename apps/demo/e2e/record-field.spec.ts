import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

/**
 * Крок A2a (ADR-0030): поле «запис із довідника сервера» на прикладі «Відповідального» організацій
 * B1 (ADR-0039) із довідника користувачів. Колонка й шапка беруть підпис із сервера одним запитом,
 * фільтр панелі — вибір із пошуком, чип — ім'я, а не `id`, форма — вибір запису, журнал — «було →
 * стало» іменами.
 */
const ORGANIZATIONS = "/#/m/B1/organizations"
/** Організація з фікстур, де відповідальний — Іван Петренко (`responsibleOf`). */
const IVAN_CARD = "/#/m/B1/organizations/org-002"
/** Підписи записів довідника: `GET /users?id=…` (ADR-0002). */
const USER_LABELS_API = /\/api\/v1\/users\?(?:.*&)?id=/

const headerValue = (page: Page, label: string) =>
  page
    .locator("header dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")

test.describe("поле-запис: десктоп", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("колонка — імена одним запитом; фільтр панелі — вибір із пошуком, чип з іменем", async ({
    page,
  }) => {
    let labelRequests = 0
    page.on("request", (request) => {
      if (USER_LABELS_API.test(request.url())) labelRequests += 1
    })
    await openWith(page, {}, ORGANIZATIONS)
    const header = page.getByRole("columnheader", { name: "Відповідальний" })
    await expect(header).toBeVisible()
    await expect(
      page.getByRole("gridcell", { name: "Іван Петренко" }).first(),
    ).toBeVisible()
    // Двадцять рядків — один запит підписів, а не запит на кожну комірку.
    expect(labelRequests).toBe(1)

    await page.getByRole("button", { name: /^Фільтри/ }).click()
    const panel = page.getByRole("dialog", { name: "Фільтри" })
    await panel
      .getByRole("combobox", { name: "Відповідальний", exact: true })
      .click()
    await page
      .getByRole("combobox", { name: "Пошук: Відповідальний" })
      .fill("Іван")
    await page.getByRole("option", { name: /Іван Петренко/ }).click()
    await panel.getByRole("button", { name: "Застосувати" }).click()

    await expect(page).toHaveURL(/responsibleId=u-ivan/)
    const chips = page.getByRole("list", { name: "Активні фільтри" })
    await expect(chips).toContainText("Відповідальний: Іван Петренко")
    const managerCells = page
      .getByRole("row")
      .filter({ has: page.getByRole("gridcell") })
      .getByRole("gridcell", { name: /Петренко|Коваль|Шевчук/ })
    await expect(managerCells.first()).toHaveText("Іван Петренко")
    expect(new Set(await managerCells.allTextContents())).toEqual(
      new Set(["Іван Петренко"]),
    )
    await expectNoA11yViolations(page)

    await page
      .getByRole("button", { name: "Прибрати фільтр «Відповідальний»" })
      .click()
    await expect(page).not.toHaveURL(/responsibleId=/)
  })

  test("форма: вибір запису з пошуком, шапка й стрічка — іменами; очищення — «—»", async ({
    page,
  }) => {
    await openWith(page, {}, IVAN_CARD)
    await expect(headerValue(page, "Відповідальний")).toHaveText(
      "Іван Петренко",
    )
    const edit = page.getByRole("button", { name: "Змінити", exact: true })
    await edit.click()
    const form = page.getByRole("dialog", { name: "Змінити організацію" })
    const picker = form.getByRole("combobox", {
      name: "Відповідальний",
      exact: true,
    })
    await expect(picker).toHaveText(/Іван Петренко/)
    await picker.click()
    await page
      .getByRole("combobox", { name: "Пошук: Відповідальний" })
      .fill("Мар")
    await page.getByRole("option", { name: /Марта Шевчук/ }).click()
    await expect(picker).toHaveText(/Марта Шевчук/)
    await expectNoA11yViolations(page)
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(form).toBeHidden()
    await expect(headerValue(page, "Відповідальний")).toHaveText("Марта Шевчук")

    // На широкому екрані стрічка — поруч із вкладками картки.
    await expect(
      page
        .getByRole("region", { name: "Стрічка" })
        .locator('[data-slot="audit-change"]')
        .filter({ hasText: "Відповідальний" }),
    ).toContainText("БулоІван ПетренкоСталоМарта Шевчук")

    await edit.click()
    await form.getByRole("button", { name: "Очистити: Відповідальний" }).click()
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(form).toBeHidden()
    await expect(headerValue(page, "Відповідальний")).toHaveText("—")
  })

  test("без права `users:read` — імена з довідника колег, а не «Немає доступу» (ADR-0031)", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS, { user: USERS.sales })
    await expect(
      page.getByRole("gridcell", { name: "Іван Петренко" }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole("gridcell", { name: "Немає доступу" }),
    ).toHaveCount(0)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Організації",
    )
  })
})

test.describe("поле-запис: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картка списку показує менеджера, вибір у фільтрі — шторкою без прокрутки вбік", async ({
    page,
  }) => {
    await openWith(page, {}, `${ORGANIZATIONS}?responsibleId=u-ivan`)
    await expect(
      page.getByRole("list", { name: "Активні фільтри" }),
    ).toContainText("Іван Петренко")
    await expect(page.getByText("Відповідальний").first()).toBeVisible()
    await page.getByRole("button", { name: /^Фільтри/ }).click()
    await page
      .getByRole("combobox", { name: "Відповідальний", exact: true })
      .click()
    const sheet = page.getByRole("dialog", { name: "Відповідальний" })
    await expect(
      sheet.getByRole("option", { name: /Іван Петренко/ }),
    ).toBeVisible()
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(scroll).toBeLessThanOrEqual(0)
  })
})
