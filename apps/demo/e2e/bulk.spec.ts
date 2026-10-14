import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

/**
 * Крок 0.6c2 (ADR-0018): вибір «сторінка / усе», масове погодження фоновою задачею з прогресом,
 * частковою невдачею й повтором, редагування в комірці з відкатом і конфліктом версій.
 * Фікстури детерміновані: у вкладці «Чернетки» 1 229 рахунків, 126 із них понад ліміт суми,
 * 52 (кожен 24-й за номером) «зайняті» при першій спробі.
 */
const DRAFTS = "/#/data?tab=draft"
/** Перший рядок чернеток (дата за спаданням). */
const FIRST = "2026-2231"
const FIRST_CLIENT = "ТОВ «Смарт Логістик»"
/** Повна задача: ~1 200 записів по 400 на секунду плюс опитування раз на секунду. */
const JOB_TIMEOUT_MS = 15_000

const grid = (page: Page) =>
  page.getByRole("grid", { name: "Рахунки клієнтам" })
const rows = (page: Page) => grid(page).locator('[role="row"][data-index]')
const count = (page: Page) => page.locator('[data-slot="data-table-status"]')
const selectionStatus = (page: Page) =>
  page.locator('[data-slot="data-table-selection"]')
const jobToast = (page: Page) =>
  page.locator("[data-sonner-toast]").filter({ hasText: "Погодження рахунків" })
const rowCheckbox = (page: Page, number: string) =>
  page.getByRole("checkbox", { name: `Вибрати рахунок ${number}` })
/**
 * Ім'я кнопки значення в комірці: «ТОВ «Альфа», змінити». Chromium ставить пробіл перед комою:
 * прихований текст позиціонований абсолютно. `value` — частина регулярного виразу.
 */
const valueButton = (value: string) => new RegExp(`^${value}\\s?, змінити$`)
const focusInGrid = (page: Page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest('[role="grid"]')))

async function chooseScenario(page: Page, name: string) {
  await page.getByRole("button", { name: /^Моки:/ }).click()
  const panel = page.getByRole("dialog", { name: "Панель розробника" })
  await panel.getByRole("combobox", { name: "Усі ресурси" }).click()
  await page.getByRole("option", { name }).click()
  await panel.getByRole("button", { name: "Закрити" }).click()
  await expect(panel).toBeHidden()
}

async function openDrafts(page: Page, user?: string) {
  await openWith(page, {}, DRAFTS, user ? { user } : undefined)
  await expect(count(page)).toHaveText("1 229 рахунків")
}

test.describe("масові дії: десктоп", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("усі за фільтром без одного: погодження з частковою невдачею, подробиці, повтор", async ({
    page,
  }) => {
    await openDrafts(page)
    await page
      .getByRole("checkbox", { name: "Вибрати всі за фільтром" })
      .click()
    await expect(selectionStatus(page)).toHaveText(
      "Вибрано 1 229 рахунків (усі за фільтром)",
    )
    await rowCheckbox(page, FIRST).click()
    await expect(selectionStatus(page)).toHaveText(
      "Вибрано 1 228 рахунків (усі за фільтром)",
    )
    await expect(rows(page).first()).not.toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(rows(page).nth(1)).toHaveAttribute("aria-selected", "true")
    await expectNoA11yViolations(page)

    await page.getByRole("button", { name: "Погодити", exact: true }).click()
    const confirm = page.getByRole("alertdialog", {
      name: "Погодити 1 228 рахунків?",
    })
    await confirm
      .getByRole("button", { name: "Погодити 1 228 рахунків" })
      .click()
    await expect(confirm).toBeHidden()
    // Вибір знято, панель зникла — фокус на зупинці Tab таблиці.
    expect(await focusInGrid(page)).toBe(true)
    await expect(
      jobToast(page).getByRole("progressbar", { name: "Погодження рахунків" }),
    ).toBeVisible()

    await expect(jobToast(page)).toContainText(
      /Погоджено 1\s050 з 1\s228, не погоджено: 178/,
      { timeout: JOB_TIMEOUT_MS },
    )
    await expect(
      page.getByRole("tab", { name: /^Погоджені 1\s050/ }),
    ).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Чернетки 179/ })).toBeVisible()

    await jobToast(page).getByRole("button", { name: "Подробиці" }).click()
    const details = page.getByRole("dialog", { name: "Не вдалося: 178" })
    await expect(
      details.getByText("Сума понад 350 000,00 ₴: погоджує директор"),
    ).toBeVisible()
    await expect(
      details.getByText(/Рахунок саме редагує інший користувач/),
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .querySelector('[role="dialog"]')
            ?.contains(document.activeElement),
        ),
      )
      .toBe(true)
    await expectNoA11yViolations(page)

    // Повтор із діалогу: діалог зникає, фокус — на сповіщенні з новою задачею.
    await details.getByRole("button", { name: "Повторити (52)" }).click()
    await expect(details).toBeHidden()
    await expect(
      page.getByRole("group", { name: "Погодження рахунків" }),
    ).toBeFocused()
    await expect(jobToast(page)).toContainText("Погоджено рахунків: 52", {
      timeout: JOB_TIMEOUT_MS,
    })
    await expect(
      page.getByRole("tab", { name: /^Погоджені 1\s102/ }),
    ).toBeVisible()

    // Невдачі, яких повтор не бере, лишаються в подробицях.
    await jobToast(page).getByRole("button", { name: "Подробиці" }).click()
    const rest = page.getByRole("dialog", { name: "Не вдалося: 126" })
    await expect(rest).toBeVisible()
    await rest.getByRole("button", { name: "Закрити" }).first().click()
    await expect(rest).toBeHidden()
  })

  test("задача живе поза сторінкою: підсумок на іншій сторінці", async ({
    page,
  }) => {
    await openDrafts(page)
    for (const number of [FIRST, "2026-2588", "2026-4637"])
      await rowCheckbox(page, number).click()
    await expect(selectionStatus(page)).toHaveText("Вибрано 3 рахунки")
    await page.getByRole("button", { name: "Погодити", exact: true }).click()
    await page.getByRole("button", { name: "Погодити 3 рахунки" }).click()
    await page.getByRole("link", { name: "Форми" }).first().click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Форми")
    await expect(jobToast(page)).toContainText("Погоджено рахунків: 3", {
      timeout: JOB_TIMEOUT_MS,
    })
  })

  test("сторінки: вибір переживає перехід, «Вибрати всі N» і «Зняти вибір»", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/data")
    await expect(count(page)).toHaveText("10 000 рахунків")
    await page.getByRole("button", { name: "Сторінки", exact: true }).click()
    await expect(page.getByText(/^1-20 з /)).toBeVisible()

    await rows(page).first().getByRole("checkbox").click()
    await page.getByRole("button", { name: "Наступна сторінка" }).click()
    await expect(page.getByText(/^21-40 з /)).toBeVisible()
    await rows(page).first().getByRole("checkbox").click()
    await expect(selectionStatus(page)).toHaveText("Вибрано 2 рахунки")

    await page
      .getByRole("checkbox", { name: "Вибрати рядки на сторінці" })
      .click()
    await expect(selectionStatus(page)).toHaveText("Вибрано 21 рахунок")
    await page.getByRole("button", { name: "Вибрати всі 10 000" }).click()
    await expect(selectionStatus(page)).toHaveText(
      "Вибрано 10 000 рахунків (усі за фільтром)",
    )
    // Кнопка зникла — фокус на першій дії панелі.
    await expect(
      page.getByRole("button", { name: "Погодити", exact: true }),
    ).toBeFocused()

    await page.getByRole("button", { name: "Зняти вибір" }).click()
    await expect(selectionStatus(page)).toHaveText("")
    expect(await focusInGrid(page)).toBe(true)
  })

  test("комірка: Enter, помилка під полем, Escape, збереження з фокусом на комірці", async ({
    page,
  }) => {
    await openDrafts(page)
    const cell = rows(page).first().locator('[aria-colindex="3"]')
    await cell.getByRole("button", { name: valueButton(FIRST_CLIENT) }).click()
    const input = page.getByRole("textbox", { name: "Клієнт" })
    await expect(input).toBeFocused()
    await input.fill("")
    await input.press("Enter")
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(
      page
        .locator("[data-slot=tooltip-content]")
        .getByText("Заповніть це поле"),
    ).toBeVisible()
    await input.press("Escape")
    await expect(
      cell.getByRole("button", { name: valueButton(FIRST_CLIENT) }),
    ).toBeFocused()

    await page.keyboard.press("F2")
    await input.fill("ТОВ «Нова назва»")
    await input.press("Enter")
    await expect(
      cell.getByRole("button", { name: valueButton("ТОВ «Нова назва»") }),
    ).toBeFocused()
    // Перечитати список із сервера (моки в пам'яті: перезавантаження сторінки їх скидає).
    await page.getByRole("button", { name: "Оновити" }).click()
    await expect(count(page)).toHaveText("1 229 рахунків")
    await expect(rows(page).first()).toContainText("ТОВ «Нова назва»")
  })

  test("відкат: сервер відмовив — значення повертається, сповіщення з повтором", async ({
    page,
  }) => {
    await openDrafts(page)
    // Відмова лише для збереження: список читається далі (сценарій ресурсу зламав би й список).
    await page.evaluate(() => {
      const original = window.fetch.bind(window)
      Object.assign(window, { originalFetch: original })
      window.fetch = (input, init) =>
        init?.method === "PATCH"
          ? Promise.resolve(
              new Response(
                JSON.stringify({ code: "internal", message: "boom" }),
                {
                  status: 500,
                  headers: { "content-type": "application/json" },
                },
              ),
            )
          : original(input, init)
    })
    const cell = rows(page).first().locator('[aria-colindex="3"]')
    await cell.getByRole("button").click()
    await page.getByRole("textbox", { name: "Клієнт" }).fill("ТОВ «Відкат»")
    await page.keyboard.press("Enter")

    const failed = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: `Не вдалося зберегти «Клієнт, ${FIRST}»` })
    await expect(failed).toContainText("Повернули попереднє значення.")
    await expect(
      cell.getByRole("button", { name: valueButton(FIRST_CLIENT) }),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    await page.evaluate(() => {
      window.fetch = (
        window as unknown as { originalFetch: typeof fetch }
      ).originalFetch
    })
    await failed.getByRole("button", { name: "Повторити" }).click()
    await expect(
      cell.getByRole("button", { name: valueButton("ТОВ «Відкат»") }),
    ).toBeVisible()
  })

  test("конфлікт у комірці: порівняння, «Зберегти мої зміни», фокус на комірці", async ({
    page,
  }) => {
    await openDrafts(page)
    await chooseScenario(page, "Конфлікт збереження")
    const cell = rows(page).first().locator('[aria-colindex="6"]')
    // Суми форматує Intl: між розрядами нерозривний пробіл.
    await cell
      .getByRole("button", { name: valueButton("75\\s049,00\\s₴") })
      .click()
    await page.getByRole("textbox", { name: "Сума" }).fill("80000")
    await page.keyboard.press("Enter")

    const conflict = page.getByRole("dialog", {
      name: "Запис змінив інший користувач",
    })
    await expect(conflict.getByRole("row", { name: /Сума/ })).toContainText(
      "80 000,00",
    )
    await conflict.getByRole("button", { name: "Зберегти мої зміни" }).click()
    await expect(page.getByText("Рахунок збережено")).toBeVisible()
    // Комірка не перемонтувалась: фокус повернувся на неї.
    await expect(
      cell.getByRole("button", { name: valueButton("80\\s000,00\\s₴") }),
    ).toBeFocused()
  })

  test("без права: «Погодити» неактивна з причиною, комірки лише для читання", async ({
    page,
  }) => {
    await openDrafts(page, USERS.sales)
    await expect(
      rows(page).first().locator('[aria-colindex="3"]').getByRole("button"),
    ).toHaveCount(0)
    await rowCheckbox(page, FIRST).click()
    const approve = page.getByRole("button", { name: "Погодити", exact: true })
    await expect(approve).toHaveAttribute("aria-disabled", "true")
    await page.getByRole("button", { name: "Зняти вибір" }).focus()
    await page.keyboard.press("Shift+Tab")
    await expect(approve).toBeFocused()
    await expect(
      page.getByText("Погоджувати рахунки може роль «Бухгалтер»", {
        exact: true,
      }),
    ).toBeVisible()
  })
})

test.describe("масові дії: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("картки: прапорець перед номером, панель вибраного без прокрутки вбік", async ({
    page,
  }) => {
    await openDrafts(page)
    const feed = page.getByRole("feed", { name: "Рахунки клієнтам" })
    const first = feed.getByRole("article").first()
    await first
      .getByRole("checkbox", { name: `Вибрати рахунок ${FIRST}` })
      .click()
    await expect(first).toHaveAttribute("data-selected")
    await expect(selectionStatus(page)).toHaveText("Вибрано 1 рахунок")
    await expect(
      page.getByRole("button", { name: "Погодити", exact: true }),
    ).toBeVisible()
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(width).toBeLessThanOrEqual(390)
    await expectNoA11yViolations(page)

    // Шапки в картках немає: «вибрати все» — у рядку стану, підпис клікабельний. Частковий вибір
    // прапорець знімає (як у гріді), тож спершу знімаємо картку.
    await first
      .getByRole("checkbox", { name: `Вибрати рахунок ${FIRST}` })
      .click()
    await page.getByText("Вибрати всі за фільтром", { exact: true }).click()
    await expect(
      page.getByRole("checkbox", { name: "Вибрати всі за фільтром" }),
    ).toBeChecked()
    await expect(selectionStatus(page)).toHaveText(
      /^Вибрано 1\s229 рахунків \(усі за фільтром\)$/,
    )
    await page.getByRole("button", { name: "Зняти вибір" }).click()
    await expect(first).toBeFocused()
  })
})
