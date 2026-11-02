import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок PF03a (ADR-0057): сторінка «Документ» — граф переходів, панель дій і контракт
 * `POST /documents/:id/<дія>` на моках. Відмову сервера видно на кнопці, конфлікт — порівнянням.
 */
const documentPath = (id: string) => `/#/document?id=${id}`
const bar = (page: Page) =>
  page
    .getByTestId("document-card")
    .getByRole("group", { name: "Дії документа" })
/** Бейдж статусу — поруч із номером документа. */
const badge = (page: Page) =>
  page.getByTestId("document-card").locator("h3 + *")

/** Дати засіву — від сьогодні, номер — з року дати (ADR-0058): фіксований день дає ті самі номери. */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T10:00:00Z"))
})

async function confirmWithReason(page: Page, title: string, reason: string) {
  const dialog = page.getByRole("alertdialog", { name: `${title}?` })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Причина").fill(reason)
  await dialog.getByRole("button", { name: title, exact: true }).click()
}

test.describe("PF03a: життєвий цикл документа", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("провести чернетку: підтвердження, новий статус і дії проведеного", async ({
    page,
  }) => {
    await openWith(page, {}, documentPath("doc-1"))
    const heading = page
      .getByTestId("document-card")
      .getByRole("heading", { level: 3 })
    // Чернетка номера не має: його дає проведення (ADR-0058).
    await expect(heading).toHaveText("Без номера")
    await expect(bar(page).getByRole("button")).toHaveText([
      "Провести",
      "На перевірку",
    ])
    await bar(page).getByRole("button", { name: "Провести" }).click()
    const dialog = page.getByRole("alertdialog", { name: "Провести документ?" })
    await expect(dialog).toBeVisible()
    await expectNoA11yViolations(page)
    await dialog.getByRole("button", { name: "Провести документ" }).click()
    await expect(dialog).toBeHidden()
    await expect(badge(page)).toHaveText("Проведено")
    // Засів уже видав шість номерів цього року: проведення бере сьомий.
    await expect(heading).toHaveText("ДОК-2026-0007")
    await expect(
      bar(page).getByRole("button", { name: "Позначити оплаченим" }),
    ).toBeEnabled()
    // Кнопка «Провести» зникла разом зі статусом: фокус на панелі, а не на `body`.
    await expect(bar(page)).toBeFocused()
  })

  test("скасувати без причини не можна: помилка біля поля", async ({
    page,
  }) => {
    await openWith(page, {}, documentPath("doc-2"))
    await bar(page).getByRole("button", { name: "Скасувати" }).click()
    const dialog = page.getByRole("alertdialog", {
      name: "Скасувати документ?",
    })
    await dialog.getByRole("button", { name: "Скасувати документ" }).click()
    const reason = dialog.getByLabel("Причина")
    await expect(reason).toHaveAccessibleDescription("Вкажіть причину")
    await expect(reason).toBeFocused()
    await dialog.getByRole("button", { name: "Не виконувати" }).click()
    await expect(badge(page)).toHaveText("Проведено")
  })

  test("сервер відмовляє: причина на кнопці й текстом під панеллю", async ({
    page,
  }) => {
    await openWith(page, {}, documentPath("doc-2"))
    await page.getByRole("button", { name: "Колега провів оплату" }).click()
    // Той самий текст оголошує й прихований регіон для скрінрідера: шукаємо в картці.
    await expect(
      page.getByTestId("document-card").getByText(/^Оплату проведено/),
    ).toBeVisible()
    await bar(page).getByRole("button", { name: "Скасувати" }).click()
    await confirmWithReason(page, "Скасувати документ", "Помилка в сумі")
    const reason = "Є проведені пов'язані документи: спершу скасуйте їх"
    await expect(bar(page).getByRole("alert")).toHaveText(
      `«Скасувати» не виконано. ${reason}`,
    )
    const cancel = bar(page).getByRole("button", { name: "Скасувати" })
    await expect(cancel).toBeDisabled()
    await expect(cancel).toHaveAccessibleDescription(reason)
    await expect(badge(page)).toHaveText("Проведено")
    await expectNoA11yViolations(page)
  })

  test("конфлікт версій: порівняння й дія ще раз із новою версією", async ({
    page,
  }) => {
    await openWith(page, {}, documentPath("doc-2"))
    await chooseScenario(page, "Конфлікт збереження")
    await bar(page).getByRole("button", { name: "Позначити оплаченим" }).click()
    const dialog = page.getByRole("dialog", {
      name: "Документ змінив інший користувач",
    })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("row", { name: /Сплатити до/ })).toBeVisible()
    await expectNoA11yViolations(page)
    await dialog.getByRole("button", { name: "Позначити оплаченим" }).click()
    await expect(dialog).toBeHidden()
    await expect(badge(page)).toHaveText("Оплачено")
  })

  test("конфлікт після діалогу: фокус лишається в порівнянні, повтор називає наслідок", async ({
    page,
  }) => {
    await openWith(page, {}, documentPath("doc-2"))
    await chooseScenario(page, "Конфлікт збереження")
    await bar(page).getByRole("button", { name: "Сторнувати" }).click()
    const confirm = page.getByRole("alertdialog", {
      name: "Сторнувати документ?",
    })
    await confirmWithReason(page, "Сторнувати документ", "Повернення товару")
    const dialog = page.getByRole("dialog", {
      name: "Документ змінив інший користувач",
    })
    await expect(dialog).toBeVisible()
    // Підтвердження закрилось після того, як відкрилось порівняння: фокус не повертається під нього.
    await expect(confirm).toBeHidden()
    await expect(dialog.locator(":focus")).toHaveCount(1)
    await expectNoA11yViolations(page)
    await dialog.getByRole("button", { name: "Сторнувати документ" }).click()
    await expect(
      page.getByTestId("document-card").getByRole("heading", { level: 3 }),
    ).toHaveText("ДОК-2026-0007")
  })

  test("виправити скасований: перехід до нової чернетки з посиланням на перший", async ({
    page,
  }) => {
    await openWith(page, {}, documentPath("doc-4"))
    await bar(page).getByRole("button", { name: "Виправити" }).click()
    const card = page.getByTestId("document-card")
    // Виправлена копія — чернетка: номера ще немає, наступний вона візьме на проведенні.
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      "Без номера",
    )
    await expect(card.getByRole("heading", { level: 3 })).toBeFocused()
    await expect(badge(page)).toHaveText("Чернетка")
    await expect(
      card.getByRole("link", { name: "ДОК-2026-0003", exact: true }),
    ).toBeVisible()
  })

  test("сторнувати: документ-сторно з посиланням, перший лишається проведеним", async ({
    page,
  }) => {
    await openWith(page, {}, documentPath("doc-2"))
    await bar(page).getByRole("button", { name: "Сторнувати" }).click()
    await confirmWithReason(page, "Сторнувати документ", "Повернення товару")
    const card = page.getByTestId("document-card")
    // Сторно народжується проведеним і бере наступний номер серії.
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      "ДОК-2026-0007",
    )
    await card.getByRole("link", { name: "ДОК-2026-0001", exact: true }).click()
    await expect(badge(page)).toHaveText("Сторновано")
    await expect(card.locator('dt:text-is("Стан документа") + dd')).toHaveText(
      "Проведено",
    )
  })

  test("роль лише з переглядом: дії неактивні з причиною", async ({ page }) => {
    await openWith(page, {}, documentPath("doc-2"), { user: USERS.sales })
    const cancel = bar(page).getByRole("button", { name: "Скасувати" })
    await expect(cancel).toBeDisabled()
    await expect(cancel).toHaveAccessibleDescription("Немає права на цю дію")
  })
})

test("PF03a на телефоні: кнопки на всю ширину, причина видимим рядком", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await openWith(page, {}, documentPath("doc-2"))
  await expect(bar(page).getByRole("button").first()).toBeVisible()
  // Варіант «Сервер забороняє дії» у вузькому контейнері: причина ще й видимим рядком під кнопкою.
  const denied = page.getByRole("figure", {
    name: "Сервер забороняє дії, вузький контейнер",
  })
  await expect(
    denied.locator("p").filter({ hasText: "Документ уже сторновано" }),
  ).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectNoA11yViolations(page)
})
