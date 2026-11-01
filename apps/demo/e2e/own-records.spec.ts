import { expect, test, type Page } from "@playwright/test"

import {
  cellOf,
  expectNoA11yViolations,
  openWith,
  timelineChanges,
  USERS,
} from "./helpers"

/**
 * Крок A2c2b2 (ADR-0039): «свої» записи в модулі B1 на моках демо. Іван — «Менеджер з продажу»: бачить
 * і змінює лише своїх клієнтів; Олена — усіх; поле «Відповідальний» — у списку, фільтрі, шапці й формі.
 * Відповідальні — `responsibleOf` з `src/data/organizations.ts`.
 */
const ORGANIZATIONS = "/#/m/B1/organizations"
const CONTACTS = "/#/m/B1/contacts"
/** Організації № 2 — Іванова, № 1 — Оленина. */
const IVAN_CARD = `${ORGANIZATIONS}/org-002`
const OLENA_CARD = `${ORGANIZATIONS}/org-001`
/** Контакт Івана, чия організація Оленина: Іванові вона прихована. */
const HIDDEN_ORGANIZATION_CONTACT = `${CONTACTS}/contact-001`
const IVAN_ORGANIZATIONS_COUNT = 8
const HANDED_OVER = /закріплено не за вами/

const grid = (page: Page, name: string | RegExp) =>
  page.getByRole("grid", { name })
const rows = (page: Page, name: string | RegExp) =>
  grid(page, name)
    .getByRole("row")
    .filter({ has: page.getByRole("gridcell") })
const headerValue = (page: Page, label: string) =>
  page
    .locator("header dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

/** Форма за назвою: шторка вибору, що закривається, теж має роль dialog. */
const editForm = (page: Page) =>
  page.getByRole("dialog", { name: "Змінити організацію" })
const newForm = (page: Page) =>
  page.getByRole("dialog", { name: "Нова організація" })

async function chooseResponsible(page: Page, name: RegExp) {
  await page.getByRole("combobox", { name: "Відповідальний" }).click()
  await page.getByRole("option", { name }).click()
}

/** Роль демо на цю компанію: як змінив би її адміністратор. */
async function seedRole(page: Page, id: string, permissions: string[]) {
  await page.addInitScript(
    ([key, roleId, granted]) => {
      if (window !== window.top) return
      localStorage.setItem(
        key as string,
        JSON.stringify({
          zoriana: {
            removed: [],
            roles: [
              {
                id: roleId,
                name: { uk: "Керівник відділу", en: "Team lead" },
                permissions: granted,
              },
            ],
          },
        }),
      )
    },
    ["erp-ui:mock-company-roles", id, permissions],
  )
}

test.describe("«Свої» записи: менеджер", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("список, лічильник і вкладки — лише свої клієнти", async ({ page }) => {
    await openWith(page, {}, ORGANIZATIONS, { user: USERS.sales })
    await expect(
      page.getByText(
        `1-${IVAN_ORGANIZATIONS_COUNT} з ${IVAN_ORGANIZATIONS_COUNT}`,
      ),
    ).toBeVisible()
    await expect(rows(page, "Організації")).toHaveCount(
      IVAN_ORGANIZATIONS_COUNT,
    )
    const responsible = await cellOf(
      grid(page, "Організації"),
      rows(page, "Організації"),
      "Відповідальний",
    )
    await expect(responsible.first()).toHaveText("Іван Петренко")
    await expect(responsible.filter({ hasText: "Олена Коваль" })).toHaveCount(0)
    await expect(page.getByRole("tab", { name: /^Усі/ })).toHaveText(
      new RegExp(String(IVAN_ORGANIZATIONS_COUNT)),
    )
    await expectNoA11yViolations(page)
  })

  test("чужа картка — «не знайдено», а не чужі дані", async ({ page }) => {
    await openWith(page, {}, OLENA_CARD, { user: USERS.sales })
    await expect(page.getByText(/не знайдено/i).first()).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Змінити", exact: true }),
    ).toHaveCount(0)
  })

  test("передача колезі: клієнт більше не його, картка — назад до списку", async ({
    page,
  }) => {
    await openWith(page, {}, IVAN_CARD, { user: USERS.sales })
    await expect(headerValue(page, "Відповідальний")).toHaveText(
      "Іван Петренко",
    )
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const form = editForm(page)
    await expect(form).toContainText(
      "Якщо передасте запис колезі чи приберете відповідального, він більше не буде вашим.",
    )
    await chooseResponsible(page, /Марта Шевчук/)
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(page).toHaveURL(/\/m\/B1\/organizations$/)
    await expect(toast(page, HANDED_OVER)).toBeVisible()
    await expect(rows(page, "Організації")).toHaveCount(
      IVAN_ORGANIZATIONS_COUNT - 1,
    )
    await expect(page.getByText(/не знайдено/i)).toHaveCount(0)
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
  })

  test("нова організація на колегу: лишається в списку, тост пояснює чому", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS, { user: USERS.sales })
    await page.getByRole("button", { name: "Створити організацію" }).click()
    const form = newForm(page)
    await form.getByRole("textbox", { name: "Назва" }).fill("ТОВ «Для Марти»")
    await chooseResponsible(page, /Марта Шевчук/)
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(form).toBeHidden()
    await expect(toast(page, HANDED_OVER)).toBeVisible()
    await expect(page).toHaveURL(/\/m\/B1\/organizations$/)
    await expect(rows(page, "Організації")).toHaveCount(
      IVAN_ORGANIZATIONS_COUNT,
    )
    await expect(page.getByText(/не знайдено/i)).toHaveCount(0)
  })

  test("нова організація — його: відповідальний автор, картка відкрита", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS, { user: USERS.sales })
    await page.getByRole("button", { name: "Створити організацію" }).click()
    const form = newForm(page)
    await expect(form).toContainText(
      "Якщо не вибрати, відповідальним станете ви.",
    )
    await form.getByRole("textbox", { name: "Назва" }).fill("ТОВ «Нова»")
    await form.getByRole("button", { name: "Створити" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "ТОВ «Нова»",
    )
    await expect(headerValue(page, "Відповідальний")).toHaveText(
      "Іван Петренко",
    )
  })

  test("організація, якої він не бачить, — «прихована»: без назви й посилання", async ({
    page,
  }) => {
    await openWith(page, {}, HIDDEN_ORGANIZATION_CONTACT, { user: USERS.sales })
    await expect(headerValue(page, "Організація")).toHaveText(
      "Організація прихована",
    )
    await expect(
      page.getByRole("combobox", { name: "Організація контакту" }),
    ).toHaveText(/Організація прихована/)
    await expect(
      page.getByRole("link", { name: "Відкрити картку організації" }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)
  })

  test("вибір організації контакту — лише свої", async ({ page }) => {
    await openWith(page, {}, HIDDEN_ORGANIZATION_CONTACT, { user: USERS.sales })
    await page.getByRole("combobox", { name: "Організація контакту" }).click()
    const options = page.getByRole("option")
    await expect(options).toHaveCount(IVAN_ORGANIZATIONS_COUNT)
    await expect(
      page.getByRole("option", { name: /ТОВ «Дніпро Трейд»/ }),
    ).toHaveCount(0)
  })
})

test.describe("«Свої» записи: бачить усіх, змінює своїх", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("чужий запис: дії неактивні з причиною own, свій — діють", async ({
    page,
  }) => {
    await seedRole(page, "lead", [
      "organizations:read",
      "organizations:update:own",
      "contacts:read",
      "contacts:update:own",
      "segments:read",
      "users:read",
      "roles:read",
    ])
    await openWith(page, {}, `${OLENA_CARD}?tab=addresses`, {
      user: USERS.lead,
    })
    const reason =
      "Запис закріплено за іншою людиною: вам можна змінювати лише свої записи"
    const edit = page.getByRole("button", { name: "Змінити", exact: true })
    await expect(edit).toHaveAttribute("aria-disabled", "true")
    await expect(edit).toHaveAccessibleDescription(reason)
    const add = page.getByRole("button", { name: "Додати адресу" })
    await expect(add).toHaveAttribute("aria-disabled", "true")
    await expect(add).toHaveAccessibleDescription(reason)
    await expectNoA11yViolations(page)
  })
})

test.describe("«Відповідальний»: бухгалтер бачить усіх", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("колонка, фільтр із чипом іменем, порожній — «—»", async ({ page }) => {
    await openWith(page, {}, ORGANIZATIONS)
    await expect(
      page.getByRole("columnheader", { name: "Відповідальний" }),
    ).toBeVisible()
    await page.getByRole("button", { name: /^Фільтри/ }).click()
    const panel = page.getByRole("dialog", { name: "Фільтри" })
    await panel
      .getByRole("combobox", { name: "Відповідальний", exact: true })
      .click()
    await page
      .getByRole("combobox", { name: "Пошук: Відповідальний" })
      .fill("Марта")
    await page.getByRole("option", { name: /Марта Шевчук/ }).click()
    await panel.getByRole("button", { name: "Застосувати" }).click()
    await expect(page).toHaveURL(/responsibleId=u-marta/)
    await expect(
      page.getByRole("list", { name: "Активні фільтри" }),
    ).toContainText("Відповідальний: Марта Шевчук")
  })

  test("передача: шапка й стрічка — іменами, запис лишається видно", async ({
    page,
  }) => {
    await openWith(page, {}, OLENA_CARD)
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const form = editForm(page)
    await chooseResponsible(page, /Іван Петренко/)
    await form.getByRole("button", { name: "Зберегти" }).click()
    await expect(form).toBeHidden()
    await expect(toast(page, /Зміни збережено/)).toBeVisible()
    await expect(headerValue(page, "Відповідальний")).toHaveText(
      "Іван Петренко",
    )
    await expect(
      timelineChanges(page).filter({ hasText: "Олена Коваль" }),
    ).toHaveCount(1)
  })

  test("у контакті — свій відповідальний, у шапці й колонці", async ({
    page,
  }) => {
    await openWith(page, {}, CONTACTS)
    await expect(
      page.getByRole("columnheader", { name: "Відповідальний" }),
    ).toBeVisible()
    await page.goto(HIDDEN_ORGANIZATION_CONTACT)
    await expect(headerValue(page, "Відповідальний")).toHaveText(
      "Іван Петренко",
    )
    await expect(headerValue(page, "Організація")).toHaveText(
      "ТОВ «Дніпро Трейд»",
    )
  })
})

test.describe("«Свої» записи: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картки менеджера без прокрутки вбік, передача — шторкою", async ({
    page,
  }) => {
    await openWith(page, {}, ORGANIZATIONS, { user: USERS.sales })
    await expect(page.getByText("Іван Петренко").first()).toBeVisible()
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(width).toBeLessThanOrEqual(390)
    await page.goto(IVAN_CARD)
    await page.getByRole("button", { name: "Змінити", exact: true }).click()
    const form = editForm(page)
    await form.getByRole("combobox", { name: "Відповідальний" }).click()
    await expect(
      page.getByRole("option", { name: /Марта Шевчук/ }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
