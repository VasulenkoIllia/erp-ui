import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

const PROFILE = "/#/settings/profile"
const SECURITY = "/#/settings/security"
const POLICY = "/#/settings/security-policy"
const USERS_PAGE = "/#/settings/users"
const LOGIN = "/#/login"

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

async function confirmWithPassword(page: Page) {
  const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
  await expect(reauth).toBeVisible()
  await reauth.getByLabel("Пароль", { exact: true }).fill("demo")
  await reauth.getByRole("button", { name: "Підтвердити", exact: true }).click()
  await expect(reauth).toBeHidden()
}

/**
 * Вхід із чистого завантаження сторінки входу: після «Вийти» ra-core пам'ятає сторінку попереднього
 * користувача й повернув би туди, а зміна лише хеша сторінку не перезавантажує.
 */
async function signIn(page: Page, email: string, password = "demo") {
  await page.goto("about:blank")
  await page.goto(LOGIN)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Пароль", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Увійти", exact: true }).click()
}

/** Зображення для фото профілю: намальоване в браузері PNG. */
async function pngFile(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 480
    canvas.height = 320
    const context = canvas.getContext("2d")
    // Кольори — з токенів теми (canvas розуміє oklch).
    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (context) {
      context.fillStyle = token("--primary")
      context.fillRect(0, 0, 480, 320)
      context.fillStyle = token("--warning")
      context.beginPath()
      context.arc(240, 160, 100, 0, Math.PI * 2)
      context.fill()
    }
    return canvas.toDataURL("image/png").split(",")[1] ?? ""
  })
  return {
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  }
}

test.describe("профіль (PF01, ADR-0012)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("поля, часовий пояс, збереження й перевірка", async ({ page }) => {
    await openWith(page, {}, PROFILE, { user: USERS.sales })
    await expect(
      page.getByRole("heading", { level: 1, name: "Профіль" }),
    ).toBeVisible()
    const name = page.getByLabel("Ім'я та прізвище")
    await expect(name).toHaveValue("Іван Петренко")
    await name.fill("")
    await page.getByRole("button", { name: "Зберегти", exact: true }).click()
    await expect(page.getByText("Заповніть це поле")).toBeVisible()

    await name.fill("Іван Петренко-Сидоренко")
    await page.getByLabel("Посада").fill("Менеджер з продажу")
    const zone = page.getByRole("combobox", { name: "Часовий пояс" })
    await zone.fill("Warsaw")
    await page.getByRole("option", { name: /Europe\/Warsaw/ }).click()
    await expect(zone).toHaveValue(/Europe\/Warsaw/)
    await page.getByLabel("Підпис для листів").fill("З повагою, Іван")
    await expectNoA11yViolations(page)
    await page.getByRole("button", { name: "Зберегти", exact: true }).click()
    await expect(toast(page, "Профіль збережено")).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: "Меню користувача: Іван Петренко-Сидоренко",
      }),
    ).toBeVisible()

    await page.reload()
    await expect(page.getByLabel("Посада")).toHaveValue("Менеджер з продажу")
    await expect(
      page.getByRole("combobox", { name: "Часовий пояс" }),
    ).toHaveValue(/Europe\/Warsaw/)
  })

  test("фото: лише зображення, обрізання, збереження й видалення", async ({
    page,
  }) => {
    await openWith(page, {}, PROFILE, { user: USERS.sales })
    const input = page.locator('input[type="file"]')
    await input.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("не фото"),
    })
    await expect(
      page.getByText("Оберіть зображення JPG, PNG або WebP"),
    ).toBeVisible()

    await input.setInputFiles(await pngFile(page))
    const crop = page.getByRole("dialog", { name: "Обріжте фото" })
    await expect(crop).toBeVisible()
    const area = crop.getByRole("application", {
      name: /Область фото/,
    })
    await area.focus()
    await page.keyboard.press("+")
    await page.keyboard.press("ArrowLeft")
    await expect(crop.getByRole("slider", { name: "Масштаб" })).not.toHaveValue(
      "1",
    )
    await expectNoA11yViolations(page)
    await crop.getByRole("button", { name: "Зберегти фото" }).click()
    await expect(toast(page, "Фото оновлено")).toBeVisible()
    await expect(crop).toBeHidden()
    await expect(
      page.getByRole("img", { name: "Фото: Іван Петренко" }).first(),
    ).toBeVisible()

    await page.getByRole("button", { name: "Видалити фото" }).click()
    await expect(toast(page, "Фото видалено")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Завантажити фото" }),
    ).toBeVisible()
  })
})

test.describe("токени API (ADR-0012)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("створення: права, повторне підтвердження, токен один раз; відкликання", async ({
    page,
  }) => {
    await openWith(page, {}, SECURITY)
    const section = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: "Токени API" }) })
    await expect(section.getByText("Токенів ще немає.")).toBeVisible()
    await section.getByRole("button", { name: "Створити токен" }).click()

    const dialog = page.getByRole("dialog", { name: "Новий токен API" })
    await dialog.getByRole("button", { name: "Створити токен" }).click()
    await expect(dialog.getByText("Заповніть це поле")).toBeVisible()
    await expect(dialog.getByText("Оберіть хоча б одне право")).toBeVisible()
    await dialog.getByLabel("Назва").fill("Інтеграція з 1С")
    await dialog
      .getByRole("group", { name: "Рахунки" })
      .getByRole("checkbox", { name: "Перегляд" })
      .check()
    await dialog
      .getByRole("group", { name: "Рахунки" })
      .getByRole("checkbox", { name: "Створення" })
      .check()
    await expectNoA11yViolations(page)
    await dialog.getByRole("button", { name: "Створити токен" }).click()
    await confirmWithPassword(page)

    const created = page.getByRole("dialog", { name: "Збережіть токен" })
    const secret = created.locator("code")
    await expect(secret).toHaveText(/^erp_\w{20,}$/)
    const token = (await secret.textContent()) ?? ""
    await created.getByRole("button", { name: "Готово" }).click()
    await expect(created).toBeHidden()
    // У списку — лише назва й початок токена.
    await expect(section.getByText("Інтеграція з 1С")).toBeVisible()
    await expect(section.getByText(`${token.slice(0, 8)}…`)).toBeVisible()
    await expect(section.getByText(token)).toHaveCount(0)

    await section
      .getByRole("button", { name: "Відкликати токен «Інтеграція з 1С»" })
      .click()
    await page
      .getByRole("dialog", { name: "Відкликати «Інтеграція з 1С»?" })
      .getByRole("button", { name: "Відкликати" })
      .click()
    await expect(toast(page, "Токен відкликано")).toBeVisible()
    await expect(section.getByText("Токенів ще немає.")).toBeVisible()
  })
})

test.describe("політики безпеки (ADR-0012)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("без права — сторінка заборонена", async ({ page }) => {
    await openWith(page, {}, POLICY, { user: USERS.sales })
    await expect(page.getByText("Немає доступу")).toBeVisible()
  })

  test("обов'язковий другий крок і список адрес → налаштування під час входу", async ({
    page,
  }) => {
    await openWith(page, {}, POLICY)
    await expect(page.getByText("Ваша адреса: 192.0.2.24.")).toBeVisible()
    await page.getByRole("combobox", { name: "Обов'язкова для" }).click()
    await page.getByRole("option", { name: "Вибраних ролей" }).click()
    const save = page.getByRole("button", { name: "Зберегти політику" })
    await save.click()
    await expect(page.getByText("Оберіть хоча б одну роль")).toBeVisible()
    await page
      .getByRole("group", { name: "Ролі" })
      .getByRole("checkbox", { name: "Менеджер з продажу" })
      .check()

    const ips = page.getByLabel("Адреси й мережі")
    await ips.fill("198.51.100.0/24\n10.0.0.300")
    await save.click()
    await expect(
      page.getByText("Рядок 2 («10.0.0.300») — не адреса й не мережа"),
    ).toBeVisible()
    await ips.fill("198.51.100.0/24")
    await save.click()
    await confirmWithPassword(page)
    await expect(
      page.getByText(
        "Список відріже вашу адресу 192.0.2.24 — додайте її, щоб не втратити доступ",
      ),
    ).toBeVisible()
    await page.getByRole("button", { name: "Додати мою адресу" }).click()
    await expect(ips).toHaveValue("198.51.100.0/24\n192.0.2.24")
    await expectNoA11yViolations(page)
    await save.click()
    await expect(toast(page, "Політику збережено")).toBeVisible()

    // Менеджер без другого кроку: після пароля — налаштування, потім вхід.
    await page
      .getByRole("button", { name: "Меню користувача: Олена Коваль" })
      .click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()
    await signIn(page, "ivan@zoriana.example")
    await expect(
      page.getByRole("heading", { name: "Налаштуйте двоетапну перевірку" }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    await page.getByRole("button", { name: /Код на email/ }).click()
    const backup = page.getByRole("dialog", { name: "Збережіть резервні коди" })
    await backup.getByRole("button", { name: "Я зберіг коди" }).click()
    await expect(page).toHaveURL(/#\/data$/)
    await expect(
      page.getByRole("button", { name: "Меню користувача: Іван Петренко" }),
    ).toBeVisible()
  })

  test("протермінований пароль: новий під час входу", async ({ page }) => {
    await openWith(page, {}, POLICY)
    await page.getByRole("combobox", { name: "Термін дії" }).click()
    await page.getByRole("option", { name: "90 днів" }).click()
    await page.getByRole("button", { name: "Зберегти політику" }).click()
    await confirmWithPassword(page)
    await expect(toast(page, "Політику збережено")).toBeVisible()

    await page
      .getByRole("button", { name: "Меню користувача: Олена Коваль" })
      .click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()
    await signIn(page, "ivan@zoriana.example")
    await expect(
      page.getByText(
        "Термін дії пароля минув — придумайте новий, щоб продовжити.",
      ),
    ).toBeVisible()
    await page
      .getByLabel("Новий пароль", { exact: true })
      .fill("new-password-2026")
    await page.getByRole("button", { name: "Зберегти пароль" }).click()
    await expect(page).toHaveURL(/#\/data$/)
  })
})

test.describe("втрачений другий крок (ADR-0012)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("запит на кроці коду → адміністратор скидає → вхід лише паролем", async ({
    page,
  }) => {
    // Іван вмикає коди на email — тепер вхід із другим кроком.
    await openWith(page, {}, SECURITY, { user: USERS.sales })
    await page.getByRole("button", { name: "Увімкнути коди на email" }).click()
    await confirmWithPassword(page)
    await page
      .getByRole("dialog", { name: "Збережіть резервні коди" })
      .getByRole("button", { name: "Я зберіг коди" })
      .click()
    await page
      .getByRole("button", { name: "Меню користувача: Іван Петренко" })
      .click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()

    await signIn(page, "ivan@zoriana.example")
    await page
      .getByRole("button", { name: "Немає доступу до жодного способу?" })
      .click()
    await page
      .getByLabel("Що сталося (необов'язково)")
      .fill("Телефон і пошта недоступні у відрядженні")
    await expectNoA11yViolations(page)
    await page.getByRole("button", { name: "Попросити адміністратора" }).click()
    await expect(page.getByText(/Запит надіслано адміністратору/)).toBeVisible()
    await expect(
      toast(
        page,
        "Лист на ivan@zoriana.example: запит на відновлення доступу отримано",
      ),
    ).toBeVisible()

    // Адміністраторка бачить запит і скидає другий крок після перевірки особи.
    // Через about:blank — щоб сторінка завантажилась заново й увійшла (зміна лише хеша не перезавантажує).
    await page.goto("about:blank")
    await openWith(page, {}, USERS_PAGE)
    const requests = page.getByRole("list", {
      name: "Запити на відновлення доступу",
    })
    await expect(
      requests.getByText("Телефон і пошта недоступні у відрядженні"),
    ).toBeVisible()
    await requests
      .getByRole("button", {
        name: "Скинути двоетапну перевірку: Іван Петренко",
      })
      .click()
    const dialog = page.getByRole("dialog", {
      name: "Іван Петренко: скинути двоетапну перевірку?",
    })
    await dialog.getByRole("button", { name: "Скинути" }).click()
    await expect(dialog.getByText("Заповніть це поле")).toBeVisible()
    await dialog
      .getByLabel("Як ви перевірили особу")
      .fill("Дзвінок на робочий номер")
    await expectNoA11yViolations(page)
    await dialog.getByRole("button", { name: "Скинути" }).click()
    await confirmWithPassword(page)
    await expect(
      toast(
        page,
        "Двоетапну перевірку скинуто; лист надіслано на ivan@zoriana.example",
      ),
    ).toBeVisible()
    await expect(page.getByText("Запитів немає.")).toBeVisible()

    await page
      .getByRole("button", { name: "Меню користувача: Олена Коваль" })
      .click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()
    await signIn(page, "ivan@zoriana.example")
    await expect(page).toHaveURL(/#\/data$/)
  })
})
