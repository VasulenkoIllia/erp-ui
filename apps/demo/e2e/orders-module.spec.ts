import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль B3, частина «Замовлення» (ADR-0067): чотири статуси, позначка «Прострочено» в підтвердженого
 * з минулим строком, нове замовлення через форму, «Підтвердити» з номером серії, «Позначити
 * виконаним», «Скасувати» з причиною й «Виправити», права ролі, друк і масові дії зі звітом про
 * невдалі (ADR-0066). Засів демо — від сьогодні: годинник сторінки йде від 08.11.2026, тож наступний
 * номер компанії — ЗМ-2026-0007.
 */
const LIST = "/#/m/B3/orders"
const NEW = `${LIST}/new`
/** Засів компанії бухгалтера: підтверджене свіже, підтверджене прострочене, виконане. */
const CONFIRMED = `${LIST}/so-zoriana-02`
const OVERDUE = `${LIST}/so-zoriana-03`
const DRAFT = `${LIST}/so-zoriana-01`
/** Масова задача: запуск, черга й опитування раз на секунду. */
const JOB_TIMEOUT_MS = 10_000

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
const clientLink = (page: Page) =>
  page.locator("main a[href*='/m/B1/organizations/']").first()
const rowsWith = (page: Page, text: string) =>
  page
    .getByRole("grid", { name: "Замовлення" })
    .getByRole("row")
    .filter({ hasText: text })
const selectionStatus = (page: Page) =>
  page.locator('[data-slot="data-table-selection"]')
const jobToast = (page: Page, title: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: title })

/** Base UI переносить фокус у діалог наступним кадром: до того введення піде повз поле. */
async function openConfirm(page: Page, name: string) {
  const dialog = page.getByRole("alertdialog", { name })
  await expect(dialog).toBeVisible()
  await expect(async () => {
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true)
  }).toPass()
  return dialog
}

// Годинник іде від 08.11.2026, а не стоїть: масова задача моку рахує, скільки записів обробити, за часом.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-08T10:00:00Z") })
})

test.describe("модуль B3: замовлення", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("список: чотири статуси, підтверджене з минулим строком — «Прострочено»", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await expect(heading(page)).toHaveText("Замовлення")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText("8")
    await page.getByRole("tab", { name: /^Підтверджено/ }).click()
    await expect(page.getByRole("row")).toHaveCount(4)
    await expect(
      page.getByRole("row").filter({ hasText: "Прострочено" }),
    ).toHaveCount(1)
    await page.getByRole("tab", { name: /^Виконано/ }).click()
    await expect(
      page.getByRole("row").filter({ hasText: "Прострочено" }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)
  })

  test("нове замовлення: чернетка без номера, «Підтвердити» дає номер серії, далі «Позначити виконаним»", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await page.getByRole("link", { name: "Створити замовлення" }).click()
    await expect(heading(page)).toHaveText("Нове замовлення")
    await expect(page.getByLabel("Виконати до")).toBeVisible()
    await page.getByRole("combobox", { name: "Клієнт" }).click()
    await page.getByRole("option").first().click()
    await page.getByRole("button", { name: "Додати рядок" }).click()
    const line = page.getByRole("group", { name: "Рядок 1", exact: true })
    await line.getByLabel("Назва").fill("Монтаж обладнання")
    await line.getByLabel("Ціна").fill("4200")
    await page.getByRole("button", { name: "Зберегти" }).click()

    await expect(page).toHaveURL(/#\/m\/B3\/orders\/(?!new)[^/]+$/)
    await expect(heading(page)).toHaveText("Замовлення без номера")
    await actionBar(page).getByRole("button", { name: "Підтвердити" }).click()
    const confirm = await openConfirm(page, "Підтвердити замовлення?")
    await confirm
      .getByRole("button", { name: "Підтвердити замовлення" })
      .click()
    await expect(heading(page)).toHaveText("Замовлення ЗМ-2026-0007")
    await expect(
      page.getByRole("button", { name: "Змінити", exact: true }),
    ).toBeDisabled()

    await actionBar(page)
      .getByRole("button", { name: "Позначити виконаним" })
      .click()
    await expect(
      page
        .getByRole("list", { name: "Етапи замовлення" })
        .locator("[aria-current]"),
    ).toHaveText("Виконано")
    await expect(
      actionBar(page).getByRole("button", { name: "Позначити виконаним" }),
    ).toHaveCount(0)
    await expectNoA11yViolations(page)
  })

  test("підтверджене не змінюють: форма лише для читання з причиною мовою модуля", async ({
    page,
  }) => {
    await openWith(page, {}, `${CONFIRMED}/edit`)
    await expect(
      page.getByText(
        "Підтверджене замовлення не змінюють: скасуйте його й зробіть виправлену копію",
      ),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Зберегти" })).toHaveCount(0)
  })

  test("«Скасувати» без причини не проходить; «Виправити» веде на нову чернетку того самого клієнта", async ({
    page,
  }) => {
    await openWith(page, {}, CONFIRMED)
    await expect(heading(page)).toHaveText(/^Замовлення ЗМ-2026-/)
    const client = await clientLink(page).textContent()
    await actionBar(page).getByRole("button", { name: "Скасувати" }).click()
    const confirm = await openConfirm(page, "Скасувати документ?")
    await confirm.getByRole("button", { name: "Скасувати документ" }).click()
    await expect(confirm.getByText("Вкажіть причину")).toBeVisible()
    await confirm
      .getByLabel("Причина", { exact: true })
      .fill("Клієнт відмовився")
    await confirm.getByRole("button", { name: "Скасувати документ" }).click()
    await expect(confirm).toBeHidden()

    await actionBar(page).getByRole("button", { name: "Виправити" }).click()
    await expect(heading(page)).toHaveText("Замовлення без номера")
    await expect(page).not.toHaveURL(/so-zoriana-02/)
    await expect(clientLink(page)).toHaveText(client ?? "")
  })

  test("права ролі: менеджер позначає виконаним, а «Скасувати» неактивна", async ({
    page,
  }) => {
    await openWith(page, {}, CONFIRMED, { user: USERS.sales })
    await expect(
      actionBar(page).getByRole("button", { name: "Скасувати" }),
    ).toBeDisabled()
    await expect(
      actionBar(page).getByRole("button", { name: "Позначити виконаним" }),
    ).toBeEnabled()
  })

  test("права ролі: керівник лише переглядає — «Створити замовлення» неактивна", async ({
    page,
  }) => {
    await openWith(page, {}, LIST, { user: USERS.lead })
    await expect(
      page.getByRole("button", { name: "Створити замовлення" }),
    ).toBeDisabled()
  })

  test("друк: аркуш мовою документа з номером і строком виконання", async ({
    page,
  }) => {
    await openWith(page, {}, `${OVERDUE}/print`)
    await expect(page).toHaveTitle(/Друк: Замовлення ЗМ-2026-/)
    await expect(
      page.getByRole("heading", { name: /^Замовлення покупця № ЗМ-2026-/ }),
    ).toBeVisible()
    await expect(page.getByText(/^Виконати до /)).toBeVisible()
    await expect(page.getByRole("button", { name: "Друкувати" })).toBeEnabled()
  })

  test("масове «Підтвердити»: чернетки отримують номер, підтверджене — у звіті з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    const drafts = rowsWith(page, "Чернетка")
    await drafts.nth(0).getByRole("checkbox").check()
    await drafts.nth(1).getByRole("checkbox").check()
    await rowsWith(page, "Підтверджено").first().getByRole("checkbox").check()
    await expect(selectionStatus(page)).toHaveText("Вибрано: 3")
    await page.getByRole("button", { name: "Підтвердити", exact: true }).click()
    const confirm = await openConfirm(page, "Підтвердити 3 замовлення?")
    await expectNoA11yViolations(page)
    await confirm
      .getByRole("button", { name: "Підтвердити 3 замовлення" })
      .click()
    await expect(confirm).toBeHidden()

    const toast = jobToast(page, "Підтвердження замовлень")
    await expect(toast).toContainText(
      "Підтверджено 2 з 3, не підтверджено: 1",
      { timeout: JOB_TIMEOUT_MS },
    )
    await expect(
      page.getByRole("tab", { name: /^Підтверджено/ }),
    ).toContainText(/(^|\D)5(\D|$)/)
    await toast.getByRole("button", { name: "Подробиці" }).click()
    const details = page.getByRole("dialog", { name: "Не вдалося: 1" })
    await expect(
      details.getByText("Підтвердити можна лише чернетку: 1"),
    ).toBeVisible()
    await expect(details).toContainText(/ЗМ-2026-\d{4}/)
  })

  test("масове «Позначити виконаним»: підтверджене виконано, чернетка — у звіті", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await rowsWith(page, "Підтверджено").first().getByRole("checkbox").check()
    await rowsWith(page, "Чернетка").first().getByRole("checkbox").check()
    await page
      .getByRole("button", { name: "Позначити виконаним", exact: true })
      .click()
    const confirm = await openConfirm(
      page,
      "Позначити 2 замовлення виконаними?",
    )
    await confirm
      .getByRole("button", { name: "Позначити 2 замовлення виконаними" })
      .click()
    await expect(confirm).toBeHidden()
    const toast = jobToast(page, "Позначення замовлень виконаними")
    await expect(toast).toContainText("Позначено 1 з 2, не позначено: 1", {
      timeout: JOB_TIMEOUT_MS,
    })
    await toast.getByRole("button", { name: "Подробиці" }).click()
    await expect(
      page
        .getByRole("dialog", { name: "Не вдалося: 1" })
        .getByText("Виконаним позначають лише підтверджене замовлення: 1"),
    ).toBeVisible()
  })

  test("масове «Скасувати»: причина одна на всі, чернетка — у звіті", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await rowsWith(page, "Підтверджено").first().getByRole("checkbox").check()
    await rowsWith(page, "Виконано").first().getByRole("checkbox").check()
    await rowsWith(page, "Чернетка").first().getByRole("checkbox").check()
    await page.getByRole("button", { name: "Скасувати", exact: true }).click()
    const confirm = await openConfirm(page, "Скасувати 3 замовлення?")
    await confirm.getByLabel("Причина", { exact: true }).fill("Склад закрито")
    await confirm
      .getByRole("button", { name: "Скасувати 3 замовлення" })
      .click()
    await expect(confirm).toBeHidden()
    const toast = jobToast(page, "Скасування замовлень")
    await expect(toast).toContainText("Скасовано 2 з 3, не скасовано: 1", {
      timeout: JOB_TIMEOUT_MS,
    })
    await toast.getByRole("button", { name: "Подробиці" }).click()
    await expect(
      page
        .getByRole("dialog", { name: "Не вдалося: 1" })
        .getByText(/^Скасовують лише підтверджене чи виконане замовлення/),
    ).toBeVisible()
  })

  test("«Видалити чернетку» з картки — список без неї; у підтвердженого кнопка неактивна з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, DRAFT)
    await expect(heading(page)).toHaveText("Замовлення без номера")
    await page.getByRole("button", { name: "Видалити чернетку" }).click()
    const confirm = await openConfirm(page, "Видалити чернетку?")
    await confirm.getByRole("button", { name: "Видалити чернетку" }).click()
    await expect(heading(page)).toHaveText("Замовлення")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText(
      /(^|\D)7(\D|$)/,
    )

    await openWith(page, {}, CONFIRMED)
    const remove = page.getByRole("button", { name: "Видалити чернетку" })
    await expect(remove).toBeDisabled()
    await expect(remove).toHaveAccessibleDescription(
      "Підтверджене замовлення не видаляють: скасуйте його",
    )
  })

  test("сценарії моків: порожньо й немає доступу", async ({ page }) => {
    await openWith(page, {}, LIST)
    await chooseScenario(page, "Порожньо")
    await expect(page.getByText("Замовлень ще немає")).toBeVisible()
    await chooseScenario(page, "Немає доступу")
    await expect(
      page
        .getByRole("main")
        .getByRole("heading", { name: "Немає доступу", exact: true }),
    ).toBeVisible()
  })
})

test("замовлення на телефоні: список, картка, форма й панель вибраного без горизонтальної прокрутки", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  for (const path of [LIST, `${LIST}/so-zoriana-07`, NEW]) {
    await openWith(page, {}, path)
    await expectNoHorizontalScroll(page)
  }
  await expectNoA11yViolations(page)
  // Панель вибраного з чотирма масовими діями вміщається в ширину телефона.
  await openWith(page, {}, LIST)
  await page
    .getByRole("checkbox", { name: /^Вибрати замовлення ЗМ-/ })
    .first()
    .check()
  await expect(
    page.getByRole("button", { name: "Видалити", exact: true }),
  ).toBeVisible()
  await expectNoHorizontalScroll(page)
})
