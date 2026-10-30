import { expect, test, type Page } from "@playwright/test"

import {
  confirmWithPassword,
  expectNoA11yViolations,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок A2b2b2b (ADR-0035): сторінка «Запрошення» модуля A2 — пункт навігації з правом
 * `users:create`, запросити колегу, запрошення з роллю понад свої права (дії неактивні з причиною в
 * порядку Tab), права того, хто запросив, у момент прийняття (410), сценарії ресурсу `invitations`,
 * телефон.
 */
const INVITATIONS = "/#/m/A2/invitations"
const INVITES_KEY = "erp-ui:mock-invitations"
const OWNER_INVITE = "partner@zoriana.example"
const SALES_INVITE = "olha@zoriana.example"
const BEYOND =
  "У запрошенні є ролі з правами, яких немає у вас: надіслати його ще раз чи відкликати може лише той, хто має всі ці права."

const list = (page: Page) => page.getByRole("list", { name: "Запрошення" })
/** Причина видимим текстом у рядку (та сама — в описі кожної неактивної кнопки). */
const reasonText = (page: Page) => page.locator("p", { hasText: BEYOND })
const navLink = (page: Page, path: string) =>
  page
    .getByRole("navigation", { name: "Основна навігація" })
    .locator(`a[href$="${path}"]`)
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()
const resendButton = (page: Page, email: string) =>
  page.getByRole("button", { name: `Надіслати ще раз: ${email}` })
const revokeButton = (page: Page, email: string) =>
  page.getByRole("button", { name: `Відкликати запрошення: ${email}` })

/**
 * Запрошення в компанію демо до відкриття сторінки (раз на тест): від «Власника компанії» з роллю
 * «Власник» (понад права Олени) і від Олени з роллю менеджера.
 */
async function seedInvitations(page: Page) {
  await page.addInitScript(
    ([key, owner, sales]) => {
      if (window !== window.top || localStorage.getItem(key)) return
      const now = Date.now()
      const iso = (ms: number) => new Date(ms).toISOString()
      const company = { id: "zoriana", name: "ТОВ «Зоряна логістика»" }
      const invite = (
        id: string,
        email: string,
        roles: string[],
        invitedBy: string,
        invitedById: string,
        minutesAgo: number,
      ) => ({
        id,
        token: `tok-${id}`,
        email,
        roles,
        invitedBy,
        invitedById,
        companyName: company.name,
        companies: [company],
        companyId: company.id,
        createdAt: iso(now - minutesAgo * 60_000),
        lastSentAt: iso(now - minutesAgo * 60_000),
        expiresAt: iso(now + 6 * 86_400_000),
      })
      localStorage.setItem(
        key,
        JSON.stringify([
          invite(
            "inv-owner",
            owner,
            ["owner"],
            "Власник компанії",
            "u-owner",
            60,
          ),
          invite("inv-sales", sales, ["sales"], "Олена Коваль", "u-olena", 120),
        ]),
      )
    },
    [INVITES_KEY, OWNER_INVITE, SALES_INVITE] as const,
  )
}

/** Сценарій лише для запрошень: вхід, профіль і решта працюють як звичайно. */
const withInvitationsScenario = (page: Page, scenario: string) =>
  page.addInitScript(
    (value) => {
      localStorage.setItem("erp-ui:mock-scenarios", value)
    },
    JSON.stringify({ global: "success", resources: { invitations: scenario } }),
  )

const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )

test.describe("A2: запрошення", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("пункт навігації, порожній список, запросити колегу", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/m/A2/users")
    await expect(navLink(page, "/m/A2/invitations")).toHaveText("Запрошення")
    await navLink(page, "/m/A2/invitations").click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Запрошення",
    )
    await expect(page.getByText("Запрошень, що чекають, немає.")).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("petro@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Аудитор" }).check()
    await dialog.getByRole("button", { name: "Надіслати запрошення" }).click()
    await confirmWithPassword(page)
    await expect(
      toast(page, "Запрошення надіслано на petro@zoriana.example"),
    ).toBeVisible()
    await expect(list(page).getByRole("listitem")).toHaveCount(1)
    await expect(list(page).getByText(/Олена Коваль · /)).toBeVisible()
  })

  test("запрошення з роллю понад свої права — дії неактивні з причиною в порядку Tab", async ({
    page,
  }) => {
    await seedInvitations(page)
    await openWith(page, {}, INVITATIONS)
    await expect(list(page).getByRole("listitem")).toHaveCount(2)
    const owner = list(page)
      .getByRole("listitem")
      .filter({ hasText: OWNER_INVITE })
    await expect(owner.locator("p", { hasText: BEYOND })).toBeVisible()
    for (const button of [
      resendButton(page, OWNER_INVITE),
      revokeButton(page, OWNER_INVITE),
    ]) {
      await expect(button).toHaveAttribute("aria-disabled", "true")
      await expect(button).toHaveAccessibleDescription(BEYOND)
    }
    // У фокусі: Tab доходить до неактивної кнопки, а не перескакує її.
    await resendButton(page, OWNER_INVITE).focus()
    await expect(resendButton(page, OWNER_INVITE)).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(revokeButton(page, OWNER_INVITE)).toBeFocused()
    // Запрошення з роллю в межах прав — як звичайно.
    await expect(revokeButton(page, SALES_INVITE)).toBeEnabled()
    await expectNoA11yViolations(page)
  })

  test("надіслати ще раз: пароль, тост, спінер не лишається", async ({
    page,
  }) => {
    await seedInvitations(page)
    await openWith(page, {}, INVITATIONS)
    await resendButton(page, SALES_INVITE).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Запрошення надіслано ще раз")).toBeVisible()
    await expect(resendButton(page, SALES_INVITE)).toBeEnabled()
    await expect(resendButton(page, SALES_INVITE)).not.toHaveAttribute(
      "aria-busy",
      "true",
    )
  })

  test("пароль скасовано: запрошення не надіслано, введене лишилось", async ({
    page,
  }) => {
    await openWith(page, {}, INVITATIONS)
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("later@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Аудитор" }).check()
    await dialog.getByRole("button", { name: "Надіслати запрошення" }).click()
    const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
    await reauth.getByRole("button", { name: "Скасувати" }).click()
    await expect(reauth).toBeHidden()
    await expect(
      dialog.getByText("Дію не виконано: підтвердження скасовано"),
    ).toBeVisible()
    await expect(dialog.getByLabel("Email")).toHaveValue(
      "later@zoriana.example",
    )
    await expect(
      dialog.getByRole("button", { name: "Надіслати запрошення" }),
    ).toBeEnabled()
  })

  test("зайнята адреса — лише в цій компанії: без пароля біля поля", async ({
    page,
  }) => {
    await openWith(page, {}, INVITATIONS)
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("ivan@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Аудитор" }).check()
    await dialog.getByRole("button", { name: "Надіслати запрошення" }).click()
    await expect(dialog.getByText("Ця людина вже в компанії")).toBeVisible()
    await expect(
      page.getByRole("dialog", { name: "Підтвердьте, що це ви" }),
    ).toHaveCount(0)
  })

  test("того, хто запросив, понизили — посилання з листа не діє", async ({
    page,
  }) => {
    await openWith(page, {}, INVITATIONS)
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("nadia@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Менеджер з продажу" }).check()
    await dialog.getByRole("button", { name: "Надіслати запрошення" }).click()
    await confirmWithPassword(page)
    await expect(
      toast(page, "Запрошення надіслано на nadia@zoriana.example"),
    ).toBeVisible()
    // Олені лишили тільки роль бухгалтера: запрошувати вона більше не може.
    await page.evaluate(() => {
      localStorage.setItem(
        "erp-ui:mock-user-roles",
        JSON.stringify({ "u-olena": ["accountant"] }),
      )
    })
    await toast(page, "Лист на nadia@zoriana.example")
      .getByRole("button", { name: "Відкрити посилання з листа" })
      .click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Запрошення недійсне",
    )
  })

  test("сценарій conflict: запрошення щойно змінилось — тост і свіжий список", async ({
    page,
  }) => {
    await seedInvitations(page)
    await withInvitationsScenario(page, "conflict")
    await openWith(page, {}, INVITATIONS)
    await revokeButton(page, SALES_INVITE).click()
    const confirm = page.getByRole("alertdialog", {
      name: `Відкликати запрошення для ${SALES_INVITE}?`,
    })
    await confirm.getByRole("button", { name: "Відкликати" }).click()
    await expect(
      toast(page, "Запрошення щойно змінилось: список оновлено"),
    ).toBeVisible()
    await expect(confirm).toBeHidden()
    // Рядок лишився — фокус повертається на кнопку, з якої відкрили.
    await expect(revokeButton(page, SALES_INVITE)).toBeFocused()
    // Друга спроба — проходить.
    await revokeButton(page, SALES_INVITE).click()
    await confirm.getByRole("button", { name: "Відкликати" }).click()
    await expect(toast(page, "Запрошення відкликано")).toBeVisible()
    await expect(list(page).getByRole("listitem")).toHaveCount(1)
    // Рядка вже немає — фокус на «Запросити колегу», а не на початку сторінки.
    await expect(
      page.getByRole("button", { name: "Запросити колегу" }),
    ).toBeFocused()
  })

  test("повільний сервер: після відкликання фокус на «Запросити колегу», а не на початку сторінки", async ({
    page,
  }) => {
    test.slow()
    await seedInvitations(page)
    await withInvitationsScenario(page, "slow")
    await openWith(page, {}, INVITATIONS)
    await expect(list(page).getByRole("listitem")).toHaveCount(2)
    await revokeButton(page, SALES_INVITE).click()
    await page
      .getByRole("alertdialog", {
        name: `Відкликати запрошення для ${SALES_INVITE}?`,
      })
      .getByRole("button", { name: "Відкликати" })
      .click()
    await expect(list(page).getByRole("listitem")).toHaveCount(1, {
      timeout: 15_000,
    })
    await expect(
      page.getByRole("button", { name: "Запросити колегу" }),
    ).toBeFocused()
  })

  test("повільний сервер: Esc під час запиту не закриває діалог, пароль усе одно просимо", async ({
    page,
  }) => {
    test.slow()
    await withInvitationsScenario(page, "slow")
    await openWith(page, {}, INVITATIONS)
    await page.getByRole("button", { name: "Запросити колегу" }).click()
    const dialog = page.getByRole("dialog", { name: "Запросити колегу" })
    await dialog.getByLabel("Email").fill("olha@zoriana.example")
    await dialog.getByRole("checkbox", { name: "Аудитор" }).check()
    const send = dialog.getByRole("button", { name: "Надіслати запрошення" })
    await send.click()
    await expect(send).toHaveAttribute("aria-busy", "true")
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Скасувати" }),
    ).toBeDisabled()
    await expect(
      page.getByRole("dialog", { name: "Підтвердьте, що це ви" }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test("повтор: 409 і 404 — тост «щойно змінилось» і свіжий список", async ({
    page,
  }) => {
    await seedInvitations(page)
    await withInvitationsScenario(page, "conflict")
    await openWith(page, {}, INVITATIONS)
    await resendButton(page, SALES_INVITE).click()
    await expect(
      toast(page, "Запрошення щойно змінилось: список оновлено"),
    ).toBeVisible()
    await expect(list(page).getByRole("listitem")).toHaveCount(2)
    // Запрошення прийняли деінде: сервер його вже не знає — 404, рядок зникає.
    await page.evaluate(
      ([key, email]) => {
        const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as {
          email: string
        }[]
        localStorage.setItem(
          key,
          JSON.stringify(stored.filter((item) => item.email !== email)),
        )
      },
      [INVITES_KEY, SALES_INVITE] as const,
    )
    await resendButton(page, SALES_INVITE).click()
    await expect(list(page).getByRole("listitem")).toHaveCount(1)
    await expect(resendButton(page, SALES_INVITE)).toHaveCount(0)
  })

  test("сценарій error — помилка з «Спробувати ще»", async ({ page }) => {
    await withInvitationsScenario(page, "error")
    await openWith(page, {}, INVITATIONS)
    await expect(
      page.getByRole("button", { name: "Спробувати ще" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("сценарій forbidden — «Немає доступу»", async ({ page }) => {
    await withInvitationsScenario(page, "forbidden")
    await openWith(page, {}, INVITATIONS)
    await expect(
      page.getByRole("heading", { name: "Немає доступу" }),
    ).toBeVisible()
  })

  test("може запрошувати, але не бачить ролей (без roles:read) — дії активні, відмову «стелі» показує тост", async ({
    page,
  }) => {
    await seedInvitations(page)
    // Іван — лише «Кадровик»: запрошувати може, каталогу ролей не бачить.
    await page.addInitScript(() => {
      if (window !== window.top || sessionStorage.getItem("a2-recruiter"))
        return
      sessionStorage.setItem("a2-recruiter", "1")
      localStorage.setItem(
        "erp-ui:mock-company-roles",
        JSON.stringify({
          zoriana: {
            roles: [
              {
                id: "recruiter",
                name: { uk: "Кадровик", en: "Recruiter" },
                permissions: ["users:read", "users:create"],
              },
            ],
            removed: [],
          },
        }),
      )
      localStorage.setItem(
        "erp-ui:mock-user-roles",
        JSON.stringify({ "u-ivan": ["recruiter"] }),
      )
    })
    await openWith(page, {}, INVITATIONS, { user: USERS.sales })
    await expect(list(page).getByRole("listitem")).toHaveCount(2)
    await expect(reasonText(page)).toHaveCount(0)
    await expect(resendButton(page, OWNER_INVITE)).toBeEnabled()
    await resendButton(page, OWNER_INVITE).click()
    await expect(toast(page, "Недостатньо прав для цієї дії")).toBeVisible()
    await expect(list(page).getByText(/Власник компанії · /)).toBeVisible()
  })

  test("керівник відділу без users:create — без пункту навігації, сторінка — «Немає доступу»", async ({
    page,
  }) => {
    await openWith(page, {}, INVITATIONS, { user: USERS.lead })
    await expect(
      page.getByRole("heading", { name: "Немає доступу" }),
    ).toBeVisible()
    await expect(navLink(page, "/m/A2/users")).toBeVisible()
    await expect(navLink(page, "/m/A2/invitations")).toHaveCount(0)
  })
})

test.describe("A2: запрошення на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("рядки без горизонтального прокручування, причина видима, axe", async ({
    page,
  }) => {
    await seedInvitations(page)
    await openWith(page, {}, INVITATIONS)
    await expect(list(page).getByRole("listitem")).toHaveCount(2)
    await expect(reasonText(page)).toBeVisible()
    await expect(resendButton(page, SALES_INVITE)).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    await expectNoA11yViolations(page)
  })
})
