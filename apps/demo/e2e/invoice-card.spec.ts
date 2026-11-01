import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  openWith,
  timelineChanges,
  USERS,
} from "./helpers"

/**
 * Крок 0.6d (ADR-0019): картка рахунку на шаблоні Object Page — перехід зі списку й назад із
 * фільтром, шапка, етапи, рядки з `GET /invoices/:id`, погодження й зміна з картки, права,
 * «не знайдено», збій рядків при шапці з кешу, вкладки на телефоні. Фікстури детерміновані:
 * перша чернетка (дата за спаданням) — 2026-2231; рахунок 2026-0005 належить другій компанії.
 */
const DRAFTS = "/#/data?tab=draft"
const FIRST = "2026-2231"
const FIRST_CARD = "/#/data/inv-02231"
const JOB_TIMEOUT_MS = 15_000

const count = (page: Page) => page.locator('[data-slot="data-table-status"]')
const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const currentStep = (page: Page) =>
  page.getByRole("list", { name: "Етапи рахунку" }).locator("[aria-current]")
const lineRows = (page: Page) =>
  page
    .getByRole("grid", { name: `Рядки рахунку № ${FIRST}` })
    .locator('[role="row"][data-index]')
const history = (page: Page) => page.locator('[data-slot="object-page-aside"]')

test.describe("картка рахунку: десктоп", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("зі списку з фільтром: шапка, етапи, рядки й разом; «До списку» повертає фільтр", async ({
    page,
  }) => {
    await openWith(page, {}, DRAFTS)
    await expect(count(page)).toHaveText("1 229 рахунків")
    await page.getByRole("link", { name: FIRST, exact: true }).click()

    await expect(heading(page)).toHaveText(`Рахунок № ${FIRST}`)
    await expect(heading(page)).toBeFocused()
    await expect(page).toHaveTitle(`(3) Рахунок № ${FIRST} · erp-ui`)
    await expect(currentStep(page)).toHaveText("Чернетка")
    await expect(lineRows(page).first()).toBeVisible()
    await expect(page.getByRole("region", { name: "Рядки" })).toContainText(
      /Разом\s*[\d\s]+,\d\d\s₴/,
    )
    await expectNoA11yViolations(page)

    await page.getByRole("link", { name: "До списку рахунків" }).click()
    await expect(page).toHaveURL(/#\/data\?tab=draft$/)
    await expect(page.getByRole("tab", { name: /^Чернетки/ })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })

  test("погодити чернетку: задача, етап «Погоджено», фокус на заголовку, подія в історії", async ({
    page,
  }) => {
    await openWith(page, {}, FIRST_CARD)
    await expect(history(page)).toContainText("У стрічці ще нічого немає")
    await page.getByRole("button", { name: "Погодити", exact: true }).click()
    const dialog = page.getByRole("alertdialog", {
      name: `Погодити рахунок № ${FIRST}?`,
    })
    await dialog.getByRole("button", { name: "Погодити рахунок" }).click()
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Погоджено рахунків: 1" }),
    ).toBeVisible({ timeout: JOB_TIMEOUT_MS })
    await expect(currentStep(page)).toHaveText("Погоджено")
    // Кнопка «Погодити» зникла разом із фокусом — фокус на заголовку, а не на body.
    await expect(heading(page)).toBeFocused()
    await expect(timelineChanges(history(page))).toHaveCount(1)
  })

  test("«Змінити» мишею: збереження з версією, рядки лишаються, фокус на «Змінити»", async ({
    page,
  }) => {
    await openWith(page, {}, FIRST_CARD)
    await expect(lineRows(page).first()).toBeVisible()
    const linesBefore = await lineRows(page).count()
    const edit = page.getByRole("button", { name: "Змінити", exact: true })
    await edit.click()
    const dialog = page.getByRole("dialog", { name: `Рахунок № ${FIRST}` })
    await dialog.getByLabel("Клієнт").fill("ТОВ «Нова назва»")
    await dialog.getByRole("button", { name: "Зберегти" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('[data-slot="record-header"]')).toContainText(
      "ТОВ «Нова назва»",
    )
    await expect(lineRows(page)).toHaveCount(linesBefore)
    await expect(edit).toBeFocused()
    await expect(timelineChanges(history(page))).toHaveCount(1)
  })

  test("без права на зміну: дії неактивні з причиною, стрічка лишається", async ({
    page,
  }) => {
    await openWith(page, {}, FIRST_CARD, { user: USERS.sales })
    const edit = page.getByRole("button", { name: "Змінити", exact: true })
    await expect(edit).toHaveAttribute("aria-disabled", "true")
    await expect(
      page.getByRole("button", { name: "Погодити", exact: true }),
    ).toHaveAttribute("aria-disabled", "true")
    await edit.focus()
    // Причина — у підказці й в описі кнопки для скрінрідера (DeniedAction).
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(
      "Редагування доступне для ролі «Бухгалтер»",
    )
    await expect(edit).toHaveAccessibleDescription(
      "Редагування доступне для ролі «Бухгалтер»",
    )
    await expect(history(page)).toContainText("У стрічці ще нічого немає")
    await expectNoA11yViolations(page)
  })

  test("рахунок іншої компанії: «не знайдено», заголовок сторінки й «До списку»", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/data/inv-00005")
    await expect(
      page.getByRole("heading", { name: "Сторінку не знайдено" }),
    ).toBeVisible()
    await expect(heading(page)).toHaveText("Рахунок")
    await expect(
      page.getByRole("link", { name: "До списку рахунків" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test("рядки не прийшли: шапка з кешу списку, помилка й повтор лише в секції", async ({
    page,
  }) => {
    await openWith(page, {}, DRAFTS)
    await expect(count(page)).toHaveText("1 229 рахунків")
    await failCardRequest(page, 500)
    await page.getByRole("link", { name: FIRST, exact: true }).click()

    await expect(heading(page)).toHaveText(`Рахунок № ${FIRST}`)
    const section = page.getByRole("region", { name: "Рядки" })
    await expect(section.getByText("Не вдалося завантажити дані")).toBeVisible()
    await restoreFetch(page)
    await section.getByRole("button", { name: "Спробувати ще" }).click()
    await expect(lineRows(page).first()).toBeVisible()
  })

  test("запису вже немає (404), хоч шапка була в кеші списку: «не знайдено» без дій", async ({
    page,
  }) => {
    await openWith(page, {}, DRAFTS)
    await expect(count(page)).toHaveText("1 229 рахунків")
    await failCardRequest(page, 404)
    await page.getByRole("link", { name: FIRST, exact: true }).click()

    await expect(
      page.getByRole("heading", { name: "Сторінку не знайдено" }),
    ).toBeVisible()
    await expect(heading(page)).toHaveText("Рахунок")
    await expect(
      page.getByRole("button", { name: "Змінити", exact: true }),
    ).toHaveCount(0)
  })
})

/**
 * Відмова лише для запиту картки (список і журнал працюють далі). Не `page.route`: запити йдуть
 * через service worker MSW, і Playwright їх не бачить.
 */
async function failCardRequest(page: Page, status: number) {
  await page.evaluate(
    ([path, code]) => {
      const original = window.fetch.bind(window)
      Object.assign(window, { originalFetch: original })
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        return new URL(url, location.href).pathname.endsWith(path)
          ? Promise.resolve(
              new Response(
                JSON.stringify({ code: "internal", message: "boom" }),
                {
                  status: code,
                  headers: { "content-type": "application/json" },
                },
              ),
            )
          : original(input, init)
      }
    },
    ["/invoices/inv-02231", status] as const,
  )
}

async function restoreFetch(page: Page) {
  await page.evaluate(() => {
    window.fetch = (
      window as unknown as { originalFetch: typeof fetch }
    ).originalFetch
  })
}

test.describe("картка рахунку: лише клавіатура", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("зі списку Enter, «Погодити» з клавіатури, Escape повертає фокус, «До списку»", async ({
    page,
  }) => {
    await openWith(page, {}, DRAFTS)
    await expect(count(page)).toHaveText("1 229 рахунків")
    // У грід — з «Оновити» в рядку стану (одна зупинка Tab), далі стрілками до номера першого рядка:
    // клітинка з одним елементом фокусує саме посилання.
    await page.getByRole("button", { name: "Оновити" }).focus()
    await page.keyboard.press("Tab")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowRight")
    await expect(
      page.getByRole("link", { name: FIRST, exact: true }),
    ).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(heading(page)).toBeFocused()

    await page.keyboard.press("Tab")
    const approve = page.getByRole("button", { name: "Погодити", exact: true })
    await expect(approve).toBeFocused()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("alertdialog", {
      name: `Погодити рахунок № ${FIRST}?`,
    })
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(approve).toBeFocused()

    await page.keyboard.press("Enter")
    const confirm = dialog.getByRole("button", { name: "Погодити рахунок" })
    // Base UI ставить фокус у діалог у наступному кадрі: Tab раніше пішов би повз нього.
    await expect(dialog.locator(":focus")).toHaveCount(1)
    // Безпечна дія діалогу — у фокусі першою; до «Погодити рахунок» — Tab (у діалозі дві кнопки).
    for (let step = 0; step < 3; step++) {
      if (await confirm.evaluate((el) => el === document.activeElement)) break
      await page.keyboard.press("Tab")
    }
    await expect(confirm).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(currentStep(page)).toHaveText("Погоджено", {
      timeout: JOB_TIMEOUT_MS,
    })
    await expect(heading(page)).toBeFocused()

    await page.keyboard.press("Shift+Tab")
    await expect(
      page.getByRole("link", { name: "До списку рахунків" }),
    ).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#\/data\?tab=draft$/)
  })
})

test.describe("картка рахунку: сценарії моків", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  /** Сценарій лише для рахунків: вхід, профіль і журнал працюють як звичайно. */
  const withScenario = (page: Page, scenario: string) =>
    page.addInitScript(
      (value) => {
        localStorage.setItem("erp-ui:mock-scenarios", value)
      },
      JSON.stringify({ global: "success", resources: { invoices: scenario } }),
    )

  const STATES = [
    { scenario: "error", title: "Не вдалося завантажити дані", retry: true },
    { scenario: "offline", title: "Немає з'єднання", retry: true },
    { scenario: "forbidden", title: "Немає доступу", retry: false },
  ] as const

  for (const { scenario, title, retry } of STATES)
    test(`${scenario}: стан сторінки, заголовок «Рахунок» і «До списку»`, async ({
      page,
    }) => {
      await withScenario(page, scenario)
      await openWith(page, {}, FIRST_CARD)
      await expect(page.getByRole("heading", { name: title })).toBeVisible()
      await expect(heading(page)).toHaveText("Рахунок")
      await expect(
        page.getByRole("link", { name: "До списку рахунків" }),
      ).toBeVisible()
      await expect(
        page.getByRole("button", {
          name: /^(Спробувати ще|Перевірити ще раз)$/,
        }),
      ).toHaveCount(retry ? 1 : 0)
      await expectNoA11yViolations(page)
    })

  test("slow: скелетон картки з оголошенням, потім запис", async ({ page }) => {
    await withScenario(page, "slow")
    await openWith(page, {}, FIRST_CARD)
    await expect(
      page.getByRole("status", { name: "Завантаження даних" }),
    ).toBeVisible()
    await expect(heading(page)).toHaveText(`Рахунок № ${FIRST}`, {
      timeout: JOB_TIMEOUT_MS,
    })
  })
})

for (const width of [360, 390] as const)
  test.describe(`картка рахунку: телефон ${String(width)}`, () => {
    test.use({ viewport: { width, height: 844 } })

    test("вкладки «Подробиці» й «Стрічка», поточний етап «1 з 4», рядки — картки", async ({
      page,
    }) => {
      await openWith(page, {}, FIRST_CARD)
      await expect(currentStep(page)).toContainText("Чернетка")
      await expect(page.getByText("1 з 4")).toBeVisible()
      await expect(
        page
          .getByRole("feed", { name: `Рядки рахунку № ${FIRST}` })
          .getByRole("article")
          .first(),
      ).toBeVisible()
      await expectNoA11yViolations(page)
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      )
      expect(scrollWidth).toBeLessThanOrEqual(width)

      await page.getByRole("tab", { name: "Стрічка" }).click()
      await expect(
        page.getByRole("tabpanel", { name: "Стрічка" }),
      ).toContainText("У стрічці ще нічого немає")
      await expect(
        page.getByRole("textbox", { name: "Нотатка для команди" }),
      ).toHaveAttribute("contenteditable", "true")
    })
  })
