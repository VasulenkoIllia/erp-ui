import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Модуль B3, частина «Пропозиції» (ADR-0065): список зі статусом розширення й позначкою «Термін
 * минув», нова пропозиція через форму, «Надіслати» з номером серії, надіслану змінити не можна,
 * «Скасувати» з причиною й «Виправити», права ролі, друк і сценарії моків. Масові «Надіслати»,
 * «Скасувати» й «Видалити» зі звітом про невдалі, «Видалити чернетку» з картки (ADR-0066). Засів демо —
 * від сьогодні: годинник сторінки йде від 08.11.2026, тож наступний номер компанії — КП-2026-0008.
 */
const LIST = "/#/m/B3/quotes"
const NEW = `${LIST}/new`
/** Засів компанії бухгалтера: надіслана свіжа, прийнята зі знижкою. */
const SENT = `${LIST}/qt-zoriana-03`
const ACCEPTED = `${LIST}/qt-zoriana-05`
const DRAFT = `${LIST}/qt-zoriana-01`
/** Масова задача: запуск, черга й опитування раз на секунду. */
const JOB_TIMEOUT_MS = 10_000

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
/** Клієнт у шапці картки — посилання на картку організації B1. */
const clientLink = (page: Page) =>
  page.locator("main a[href*='/m/B1/organizations/']").first()

/** Рядки таблиці списку зі статусом чи текстом. */
const rowsWith = (page: Page, text: string) =>
  page
    .getByRole("grid", { name: "Пропозиції" })
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

test.describe("модуль B3: пропозиції", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("список: вкладки зі статусом розширення, надіслана з минулим строком — «Термін минув»", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await expect(heading(page)).toHaveText("Пропозиції")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText("10")
    await page.getByRole("tab", { name: /^Переговори/ }).click()
    await expect(page.getByRole("row")).toHaveCount(2)
    await page.getByRole("tab", { name: /^Надіслано/ }).click()
    await expect(
      page.getByRole("row").filter({ hasText: "Термін минув" }),
    ).toHaveCount(1)
    await expectNoA11yViolations(page)
  })

  test("нова пропозиція: чернетка без номера, «Надіслати» дає номер серії, змінити вже не можна", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await page.getByRole("link", { name: "Створити пропозицію" }).click()
    await expect(heading(page)).toHaveText("Нова пропозиція")
    await page.getByRole("combobox", { name: "Клієнт" }).click()
    await page.getByRole("option").first().click()
    await page.getByRole("button", { name: "Додати рядок" }).click()
    const line = page.getByRole("group", { name: "Рядок 1", exact: true })
    await line.getByLabel("Назва").fill("Сервісне обслуговування")
    await line.getByLabel("Ціна").fill("2500")
    await page.getByRole("button", { name: "Зберегти" }).click()

    await expect(page).toHaveURL(/#\/m\/B3\/quotes\/(?!new)[^/]+$/)
    await expect(heading(page)).toHaveText("Пропозиція без номера")
    await actionBar(page).getByRole("button", { name: "Надіслати" }).click()
    const confirm = await openConfirm(page, "Надіслати пропозицію?")
    await confirm.getByRole("button", { name: "Надіслати пропозицію" }).click()
    await expect(heading(page)).toHaveText("Пропозиція КП-2026-0008")
    await expect(
      page.getByRole("link", { name: "Змінити", exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Змінити", exact: true }),
    ).toBeDisabled()
    await expectNoA11yViolations(page)
  })

  test("надіслану не змінюють: форма лише для читання з причиною мовою модуля", async ({
    page,
  }) => {
    await openWith(page, {}, `${SENT}/edit`)
    await expect(
      page.getByText(
        "Надіслану пропозицію не змінюють: скасуйте її й зробіть виправлену копію",
      ),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Зберегти" })).toHaveCount(0)
  })

  test("«Скасувати» без причини не проходить; «Виправити» веде на нову чернетку того самого клієнта", async ({
    page,
  }) => {
    await openWith(page, {}, ACCEPTED)
    await expect(heading(page)).toHaveText(/^Пропозиція КП-2026-/)
    const client = await clientLink(page).textContent()
    await actionBar(page).getByRole("button", { name: "Скасувати" }).click()
    const confirm = await openConfirm(page, "Скасувати документ?")
    await confirm.getByRole("button", { name: "Скасувати документ" }).click()
    await expect(confirm.getByText("Вкажіть причину")).toBeVisible()
    await confirm.getByLabel("Причина", { exact: true }).fill("Нові ціни")
    await confirm.getByRole("button", { name: "Скасувати документ" }).click()
    await expect(confirm).toBeHidden()

    await actionBar(page).getByRole("button", { name: "Виправити" }).click()
    await expect(heading(page)).toHaveText("Пропозиція без номера")
    await expect(page).not.toHaveURL(/qt-zoriana-05/)
    await expect(clientLink(page)).toHaveText(client ?? "")
  })

  // Користувач — на весь тест: другий `openWith` міняє лише хеш, сторінка не перезавантажується.
  test("права ролі: менеджер не скасовує — кнопка неактивна", async ({
    page,
  }) => {
    await openWith(page, {}, SENT, { user: USERS.sales })
    await expect(
      actionBar(page).getByRole("button", { name: "Скасувати" }),
    ).toBeDisabled()
  })

  test("права ролі: керівник не створює — кнопка неактивна", async ({
    page,
  }) => {
    await openWith(page, {}, LIST, { user: USERS.lead })
    await expect(
      page.getByRole("button", { name: "Створити пропозицію" }),
    ).toBeDisabled()
  })

  test("друк: аркуш мовою документа з номером і строком, заголовок вкладки", async ({
    page,
  }) => {
    await openWith(page, {}, `${ACCEPTED}/print`)
    await expect(page).toHaveTitle(/Друк: Пропозиція КП-2026-/)
    await expect(
      page.getByRole("heading", { name: /^Комерційна пропозиція № КП-2026-/ }),
    ).toBeVisible()
    await expect(page.getByText(/^Пропозиція дійсна до /)).toBeVisible()
    await expect(page.getByRole("button", { name: "Друкувати" })).toBeEnabled()
  })

  test("масове «Надіслати»: чернетки отримують номер, надіслану показано у звіті з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await expect(page.getByRole("tab", { name: /^Чернетка/ })).toContainText(
      /(^|\D)3(\D|$)/,
    )
    const drafts = rowsWith(page, "Чернетка")
    await drafts.nth(0).getByRole("checkbox").check()
    await drafts.nth(1).getByRole("checkbox").check()
    await rowsWith(page, "Надіслано").first().getByRole("checkbox").check()
    await expect(selectionStatus(page)).toHaveText("Вибрано: 3")
    await page.getByRole("button", { name: "Надіслати", exact: true }).click()
    const confirm = await openConfirm(page, "Надіслати 3 пропозиції?")
    await expectNoA11yViolations(page)
    await confirm
      .getByRole("button", { name: "Надіслати 3 пропозиції" })
      .click()
    await expect(confirm).toBeHidden()

    const toast = jobToast(page, "Надсилання пропозицій")
    await expect(toast).toContainText("Надіслано 2 з 3, не надіслано: 1", {
      timeout: JOB_TIMEOUT_MS,
    })
    await expect(page.getByRole("tab", { name: /^Чернетка/ })).toContainText(
      /(^|\D)1(\D|$)/,
    )
    await toast.getByRole("button", { name: "Подробиці" }).click()
    const details = page.getByRole("dialog", { name: "Не вдалося: 1" })
    await expect(
      details.getByText("Надіслати можна лише чернетку: 1"),
    ).toBeVisible()
    await expect(details).toContainText(/КП-2026-\d{4}/)
    await expectNoA11yViolations(page)
  })

  test("масове «Скасувати»: без причини не починається, причина одна на всі, чернетка — у звіті", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await rowsWith(page, "Надіслано").first().getByRole("checkbox").check()
    await rowsWith(page, "Прийнято").first().getByRole("checkbox").check()
    await rowsWith(page, "Чернетка").first().getByRole("checkbox").check()
    await page.getByRole("button", { name: "Скасувати", exact: true }).click()
    const confirm = await openConfirm(page, "Скасувати 3 пропозиції?")
    const reason = confirm.getByLabel("Причина", { exact: true })
    await confirm
      .getByRole("button", { name: "Скасувати 3 пропозиції" })
      .click()
    await expect(confirm.getByText("Вкажіть причину")).toBeVisible()
    await expect(reason).toBeFocused()
    await expect(selectionStatus(page)).toHaveText("Вибрано: 3")

    await reason.fill("Клієнт закрив тендер")
    await confirm
      .getByRole("button", { name: "Скасувати 3 пропозиції" })
      .click()
    await expect(confirm).toBeHidden()
    const toast = jobToast(page, "Скасування пропозицій")
    await expect(toast).toContainText("Скасовано 2 з 3, не скасовано: 1", {
      timeout: JOB_TIMEOUT_MS,
    })
    await toast.getByRole("button", { name: "Подробиці" }).click()
    await expect(
      page
        .getByRole("dialog", { name: "Не вдалося: 1" })
        .getByText(/^Скасовують лише надіслану пропозицію/),
    ).toBeVisible()
  })

  test("масове «Видалити»: чернетку видалено, надіслану ні, причина у звіті", async ({
    page,
  }) => {
    await openWith(page, {}, LIST)
    await rowsWith(page, "Чернетка").first().getByRole("checkbox").check()
    await rowsWith(page, "Надіслано").first().getByRole("checkbox").check()
    await page.getByRole("button", { name: "Видалити", exact: true }).click()
    const confirm = await openConfirm(page, "Видалити 2 пропозиції?")
    await confirm.getByRole("button", { name: "Видалити 2 пропозиції" }).click()
    await expect(confirm).toBeHidden()
    const toast = jobToast(page, "Видалення чернеток")
    await expect(toast).toContainText("Видалено 1 з 2, не видалено: 1", {
      timeout: JOB_TIMEOUT_MS,
    })
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText(
      /(^|\D)9(\D|$)/,
    )
    await toast.getByRole("button", { name: "Подробиці" }).click()
    await expect(
      page
        .getByRole("dialog", { name: "Не вдалося: 1" })
        .getByText("Надіслану пропозицію не видаляють: скасуйте її: 1"),
    ).toBeVisible()
  })

  test("«Видалити чернетку» з картки — список без неї; у надісланої кнопка неактивна з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, DRAFT)
    await expect(heading(page)).toHaveText("Пропозиція без номера")
    await page.getByRole("button", { name: "Видалити чернетку" }).click()
    const confirm = await openConfirm(page, "Видалити чернетку?")
    await expectNoA11yViolations(page)
    await confirm.getByRole("button", { name: "Видалити чернетку" }).click()
    await expect(heading(page)).toHaveText("Пропозиції")
    await expect(page.getByRole("tab", { name: /^Усі/ })).toContainText(
      /(^|\D)9(\D|$)/,
    )

    await openWith(page, {}, SENT)
    const remove = page.getByRole("button", { name: "Видалити чернетку" })
    await expect(remove).toBeDisabled()
    await expect(remove).toHaveAccessibleDescription(
      "Надіслану пропозицію не видаляють: скасуйте її",
    )
  })

  test("права ролі: менеджер надсилає масово, а «Скасувати» неактивна з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, LIST, { user: USERS.sales })
    await rowsWith(page, "Надіслано").first().getByRole("checkbox").check()
    const cancel = page.getByRole("button", { name: "Скасувати", exact: true })
    await expect(cancel).toBeDisabled()
    await expect(cancel).toHaveAccessibleDescription(
      "Немає права скасовувати пропозиції",
    )
    await expect(
      page.getByRole("button", { name: "Надіслати", exact: true }),
    ).toBeEnabled()
  })

  test("сценарії моків: порожньо й немає доступу", async ({ page }) => {
    await openWith(page, {}, LIST)
    await chooseScenario(page, "Порожньо")
    await expect(page.getByText("Пропозицій ще немає")).toBeVisible()
    await chooseScenario(page, "Немає доступу")
    await expect(
      page
        .getByRole("main")
        .getByRole("heading", { name: "Немає доступу", exact: true }),
    ).toBeVisible()
  })
})

test("B3 на телефоні: список, картка й форма без горизонтальної прокрутки", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  for (const path of [LIST, `${LIST}/qt-zoriana-02`, NEW]) {
    await openWith(page, {}, path)
    await expectNoHorizontalScroll(page)
  }
  await expectNoA11yViolations(page)
  // Панель вибраного з трьома масовими діями вміщається в ширину телефона.
  await openWith(page, {}, LIST)
  await page
    .getByRole("checkbox", { name: /^Вибрати пропозицію КП-/ })
    .first()
    .check()
  await expect(
    page.getByRole("button", { name: "Видалити", exact: true }),
  ).toBeVisible()
  await expectNoHorizontalScroll(page)
})
