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
 * «Скасувати» з причиною й «Виправити», права ролі, друк і сценарії моків. Засів демо — від
 * сьогодні: годинник сторінки стоїть на 08.11.2026, тож наступний номер компанії — КП-2026-0008.
 */
const LIST = "/#/m/B3/quotes"
const NEW = `${LIST}/new`
/** Засів компанії бухгалтера: надіслана свіжа, прийнята зі знижкою. */
const SENT = `${LIST}/qt-zoriana-03`
const ACCEPTED = `${LIST}/qt-zoriana-05`

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const actionBar = (page: Page) =>
  page.getByRole("group", { name: "Дії документа" })
/** Клієнт у шапці картки — посилання на картку організації B1. */
const clientLink = (page: Page) =>
  page.locator("main a[href*='/m/B1/organizations/']").first()

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

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-08T10:00:00Z"))
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

  test("права ролі: менеджер не скасовує, керівник не створює — кнопки неактивні з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, SENT, { user: USERS.sales })
    await expect(
      actionBar(page).getByRole("button", { name: "Скасувати" }),
    ).toBeDisabled()
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

  test("сценарії моків: порожньо й немає доступу", async ({ page }) => {
    await openWith(page, {}, LIST)
    await chooseScenario(page, "Порожньо")
    await expect(page.getByText("Пропозицій ще немає")).toBeVisible()
    await chooseScenario(page, "Немає доступу")
    await expect(page.getByText("Немає доступу до списку")).toBeVisible()
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
})
