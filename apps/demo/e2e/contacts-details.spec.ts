import { expect, test, type Page } from "@playwright/test"

import {
  cellOf,
  chooseScenario,
  expectNoA11yViolations,
  openWith,
  timelineChanges,
  USERS,
} from "./helpers"

/**
 * Крок 1.4b2b (ADR-0028): адреси й банківські рахунки в картці організації B1 — «Додати…» в
 * заголовку вкладки, меню дій у рядку, форми в діалозі (`PATCH` організації з колекцією й
 * `version`), основний рахунок і `iban` організації з нього, конфлікт 409, без права — лише читання.
 */
/** Дві адреси (юридична й фактична), один рахунок. */
const TWO_ADDRESSES = "/#/m/B1/organizations/org-002"
/** ФОП з двома рахунками: основний — перший. */
const TWO_ACCOUNTS = "/#/m/B1/organizations/org-003"
const FIRST_IBAN = "UA11 3005 2800 0026 0000 0000 5253 5"
const SECOND_IBAN = "UA59 3808 0500 0026 0010 0000 8138 5"
/** Дійсний IBAN, якого немає у фікстурах. */
const NEW_IBAN = "UA673052990026007000123456789"

const dialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true })
const grid = (page: Page, name: RegExp) => page.getByRole("grid", { name })
const rowMenu = (page: Page, name: string) =>
  page.getByRole("button", { name: `Дії: ${name}`, exact: true })
const toast = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text })

async function chooseRowAction(page: Page, row: string, action: string) {
  await rowMenu(page, row).click()
  await page.getByRole("menuitem", { name: action, exact: true }).click()
}

test.describe("B1: адреси й рахунки в картці", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("адреса: нова з перевіркою індексу, зміна, видалення з підтвердженням; фокус повертається", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ADDRESSES}?tab=addresses`)
    const add = page.getByRole("button", { name: "Додати адресу" })
    await add.click()
    const form = dialog(page, "Нова адреса")
    // Юридична й фактична вже є — нова поштова; місто — організації.
    await expect(form.getByRole("combobox", { name: "Тип" })).toContainText(
      "Поштова",
    )
    await expect(form.getByRole("textbox", { name: "Місто" })).toHaveValue(
      "Львів",
    )
    await form
      .getByRole("textbox", { name: "Вулиця, будинок, офіс" })
      .fill("а/с 15")
    const postalCode = form.getByRole("textbox", { name: "Індекс" })
    await postalCode.fill("790")
    await form.getByRole("button", { name: "Додати" }).click()
    await expect(postalCode).toHaveAccessibleDescription(
      "Індекс в Україні має 5 цифр",
    )
    await expectNoA11yViolations(page)
    await postalCode.fill("79013")
    await form.getByRole("button", { name: "Додати" }).click()
    await expect(form).toBeHidden()
    await expect(toast(page, "Адресу додано: а/с 15")).toBeVisible()
    await expect(add).toBeFocused()

    const addresses = grid(page, /^Адреси:/)
    const added = addresses.getByRole("row", { name: /а\/с 15/ })
    await expect(await cellOf(addresses, added, "Тип")).toHaveText("Поштова")
    await expect(await cellOf(addresses, added, "Індекс")).toHaveText("79013")

    await chooseRowAction(page, "Поштова, а/с 15", "Змінити")
    const edit = dialog(page, "Змінити адресу")
    await edit
      .getByRole("textbox", { name: "Вулиця, будинок, офіс" })
      .fill("а/с 16")
    await edit.getByRole("button", { name: "Зберегти" }).click()
    await expect(edit).toBeHidden()
    await expect(rowMenu(page, "Поштова, а/с 16")).toBeFocused()

    await chooseRowAction(page, "Поштова, а/с 16", "Видалити")
    const confirm = page.getByRole("alertdialog", { name: "Видалити адресу?" })
    await expect(confirm).toContainText("Поштова: а/с 16, 79013, Львів")
    await confirm.getByRole("button", { name: "Видалити адресу" }).click()
    await expect(toast(page, "Адресу видалено: а/с 16")).toBeVisible()
    await expect(addresses.getByRole("row", { name: /а\/с 16/ })).toHaveCount(0)
    await expect(add).toBeFocused()
  })

  test("рахунок: IBAN з помилкою й той самий рахунок — біля поля; «Зробити основним» — IBAN у реквізитах, списку й історії", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ACCOUNTS}?tab=bankAccounts`)
    await page.getByRole("button", { name: "Додати рахунок" }).click()
    const form = dialog(page, "Новий рахунок")
    const iban = form.getByRole("textbox", { name: "IBAN" })
    await expect(iban).toBeFocused()
    await iban.fill("UA113005280000260000000052530")
    await form.getByRole("button", { name: "Додати" }).click()
    await expect(iban).toHaveAccessibleDescription(/перевірте цифри/)
    await iban.fill(FIRST_IBAN.replaceAll(" ", ""))
    await expect(iban).toHaveAccessibleDescription(
      "Цей рахунок уже є в організації",
    )
    await iban.fill(NEW_IBAN)
    await form.getByRole("textbox", { name: "Банк" }).fill("АТ «Укрсиббанк»")
    await form.getByRole("button", { name: "Додати" }).click()
    await expect(form).toBeHidden()
    const accounts = grid(page, /^Банківські рахунки:/)
    await expect(accounts.getByRole("row")).toHaveCount(4)
    // Новий — не основний: основний лишається першим.
    const added = accounts.getByRole("row", { name: /Укрсиббанк/ })
    await expect(added.getByText("Основний", { exact: true })).toHaveCount(0)

    await chooseRowAction(page, SECOND_IBAN, "Зробити основним")
    await expect(toast(page, `Основний рахунок: ${SECOND_IBAN}`)).toBeVisible()
    await expect(rowMenu(page, SECOND_IBAN)).toBeFocused()
    const second = accounts.getByRole("row", { name: /Райффайзен/ })
    await expect(second.getByText("Основний", { exact: true })).toBeVisible()
    // Стрічка перечитується з новою версією запису.
    await expect(timelineChanges(page)).toHaveCount(2)

    await page.getByRole("tab", { name: "Реквізити" }).click()
    await expect(
      page
        .getByRole("tabpanel", { name: "Реквізити" })
        .getByText(SECOND_IBAN, { exact: true }),
    ).toBeVisible()
    // Список перечитано: рядок організації несе новий основний IBAN (колонки IBAN у списку немає).
    await page.getByRole("link", { name: "До організацій" }).click()
    type ListBody = { data?: { id: string; iban: string }[] }
    const listRow = page
      .waitForResponse(
        async (response) =>
          /\/api\/v1\/organizations\?/.test(response.url()) &&
          ((await response.json()) as ListBody).data?.some(
            (row) => row.id === "org-003",
          ) === true,
      )
      .then(async (response) =>
        ((await response.json()) as ListBody).data?.find(
          (row) => row.id === "org-003",
        ),
      )
    await page
      .getByRole("searchbox", { name: "Пошук за назвою чи кодом" })
      .fill("Коваленко")
    expect((await listRow)?.iban).toBe(SECOND_IBAN.replaceAll(" ", ""))
  })

  test("видалити основний рахунок: підтвердження називає новий основний, фокус — на «Додати рахунок»", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ACCOUNTS}?tab=bankAccounts`)
    await chooseRowAction(page, FIRST_IBAN, "Видалити")
    const confirm = page.getByRole("alertdialog", {
      name: "Видалити рахунок?",
    })
    await expect(confirm).toContainText(
      `Основним стане рахунок ${SECOND_IBAN}.`,
    )
    await expectNoA11yViolations(page)
    await confirm.getByRole("button", { name: "Видалити рахунок" }).click()
    await expect(toast(page, `Рахунок видалено: ${FIRST_IBAN}`)).toBeVisible()
    const accounts = grid(page, /^Банківські рахунки:/)
    await expect(accounts.getByRole("row")).toHaveCount(2)
    await expect(
      accounts.getByRole("row", { name: /Райффайзен/ }).getByText("Основний"),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Додати рахунок" }),
    ).toBeFocused()
  })

  test("фокус: видалення адреси на щойно відкритій картці — на «Додати адресу»; «Скасувати» у видаленні рахунку — на меню рядка", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ADDRESSES}?tab=addresses`)
    await chooseRowAction(page, "Фактична, просп. Яворницького, 13", "Видалити")
    await page
      .getByRole("alertdialog", { name: "Видалити адресу?" })
      .getByRole("button", { name: "Видалити адресу" })
      .click()
    await expect(
      toast(page, "Адресу видалено: просп. Яворницького, 13"),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Додати адресу" }),
    ).toBeFocused()

    await page.goto(`${TWO_ACCOUNTS}?tab=bankAccounts`)
    await chooseRowAction(page, SECOND_IBAN, "Видалити")
    const confirm = page.getByRole("alertdialog", {
      name: "Видалити рахунок?",
    })
    await confirm.getByRole("button", { name: "Скасувати" }).click()
    await expect(confirm).toBeHidden()
    await expect(rowMenu(page, SECOND_IBAN)).toBeFocused()
    await chooseRowAction(page, SECOND_IBAN, "Видалити")
    await page.keyboard.press("Escape")
    await expect(confirm).toBeHidden()
    await expect(rowMenu(page, SECOND_IBAN)).toBeFocused()
  })

  test("помилка сервера: підтвердження видалення лишається відкритим, повтор після відновлення", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ACCOUNTS}?tab=bankAccounts`)
    await chooseScenario(page, "Помилка сервера")
    await chooseRowAction(page, SECOND_IBAN, "Видалити")
    const confirm = page.getByRole("alertdialog", {
      name: "Видалити рахунок?",
    })
    await confirm.getByRole("button", { name: "Видалити рахунок" }).click()
    await expect(
      page.locator("[data-sonner-toast][data-type=error]"),
    ).toBeVisible()
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText(SECOND_IBAN)
    await confirm.getByRole("button", { name: "Скасувати" }).click()
    await expect(
      grid(page, /^Банківські рахунки:/).getByRole("row"),
    ).toHaveCount(3)
  })

  test("повільно: «Зробити основним» — тост очікування, дії рядків неактивні до відповіді", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ACCOUNTS}?tab=bankAccounts`)
    await chooseScenario(page, "Повільно (3 с)")
    await chooseRowAction(page, SECOND_IBAN, "Зробити основним")
    await expect(
      toast(page, `Робимо основним рахунок ${SECOND_IBAN}…`),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Додати рахунок" }),
    ).toHaveAttribute("aria-disabled", "true")
    await rowMenu(page, FIRST_IBAN).click()
    // Меню попереднього рядка під навантаженням ще може закриватися: шукаємо в меню цього рядка.
    await expect(
      page
        .getByRole("menu", { name: `Дії: ${FIRST_IBAN}` })
        .getByRole("menuitem", { name: "Видалити", exact: true }),
    ).toHaveAttribute("aria-disabled", "true")
    await page.keyboard.press("Escape")
    await expect(toast(page, `Основний рахунок: ${SECOND_IBAN}`)).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByRole("button", { name: "Додати рахунок" }),
    ).not.toHaveAttribute("aria-disabled", "true")
  })

  test("конфлікт: зміна адреси — порівняння й «Зберегти мої зміни»; «Зробити основним» — повідомлення й оновлена картка", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ADDRESSES}?tab=addresses`)
    await chooseScenario(page, "Конфлікт збереження")
    await chooseRowAction(page, "Юридична, просп. Свободи, 8", "Змінити")
    const form = dialog(page, "Змінити адресу")
    await form.getByRole("textbox", { name: "Індекс" }).fill("79008")
    await form.getByRole("button", { name: "Зберегти" }).click()
    const conflict = dialog(page, "Запис змінив інший користувач")
    const row = conflict.getByRole("row", { name: /Індекс/ })
    await expect(row).toContainText("79008")
    await expect(row).toContainText("79000")
    await conflict.getByRole("button", { name: "Зберегти мої зміни" }).click()
    await expect(form).toBeHidden()
    const addresses = grid(page, /^Адреси:/)
    const legal = addresses.getByRole("row", { name: /просп\. Свободи/ })
    await expect(await cellOf(addresses, legal, "Індекс")).toHaveText("79008")

    await page.goto(`${TWO_ACCOUNTS}?tab=bankAccounts`)
    await chooseRowAction(page, SECOND_IBAN, "Зробити основним")
    await expect(
      toast(page, /Організацію щойно змінив інший користувач/),
    ).toBeVisible()
    const accounts = grid(page, /^Банківські рахунки:/)
    await expect(
      accounts.getByRole("row", { name: /ОТП/ }).getByText("Основний"),
    ).toBeVisible()
    // Картку перечитано з новою версією: повтор проходить.
    await chooseRowAction(page, SECOND_IBAN, "Зробити основним")
    await expect(toast(page, `Основний рахунок: ${SECOND_IBAN}`)).toBeVisible()
  })

  test("без права: «Додати…» неактивні з причиною, таблиці лише для читання", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ACCOUNTS}?tab=bankAccounts`, {
      user: USERS.lead,
    })
    const add = page.getByRole("button", { name: "Додати рахунок" })
    await expect(add).toHaveAttribute("aria-disabled", "true")
    await expect(add).toHaveAccessibleDescription(
      "Немає права змінювати організації",
    )
    await expect(grid(page, /^Банківські рахунки:/)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Дії: / })).toHaveCount(0)
    await page.getByRole("tab", { name: "Адреси" }).click()
    await expect(
      page.getByRole("button", { name: "Додати адресу" }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByRole("button", { name: /^Дії: / })).toHaveCount(0)
    await expectNoA11yViolations(page)
  })
})

test.describe("B1: адреси й рахунки на телефоні", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("меню рядка в картці, форма рахунку в одну колонку з полями від 16px, без горизонтальної прокрутки", async ({
    page,
  }) => {
    await openWith(page, {}, `${TWO_ACCOUNTS}?tab=bankAccounts`)
    await chooseRowAction(page, SECOND_IBAN, "Змінити")
    const form = dialog(page, "Змінити рахунок")
    await expect(form.getByRole("textbox", { name: "IBAN" })).toHaveValue(
      SECOND_IBAN,
    )
    const layout = await form.evaluate((element) => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      widths: [...element.querySelectorAll("[data-field-name]")].map((field) =>
        Math.round(field.getBoundingClientRect().width),
      ),
      fontSize: getComputedStyle(element.querySelector("input")!).fontSize,
    }))
    expect(layout.overflow).toBeLessThanOrEqual(0)
    expect(new Set(layout.widths).size).toBe(1)
    expect(layout.fontSize).toBe("16px")
    await expectNoA11yViolations(page)
  })
})
