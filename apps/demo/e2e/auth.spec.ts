import { expect, test, type Page } from "@playwright/test"
import { generateKeyPairSync } from "node:crypto"

import { expectNoA11yViolations, openWith, USERS } from "./helpers"

const DATA = "/#/data"
const LOGIN = "/#/login"

/** Рядок стану таблиці рахунків: «10 000 рахунків», коли список завантажився. */
const listLoaded = (page: Page) =>
  expect(page.locator('[data-slot="data-table-status"]')).toHaveText(
    /\d рахунк/,
  )
const heading = (page: Page) => page.getByRole("heading", { level: 1 })

/** Ввести код у клітинки (одне справжнє поле під ними). */
async function typeCode(page: Page, code: string) {
  await page.getByLabel("Код", { exact: true }).fill(code)
}

/** Останнє «надіслане» повідомлення моків (сповіщення демо). */
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

test.describe("вхід: пароль і другий крок (ADR-0010)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("гість → /login; пароль → код застосунку → повернення на сторінку даних", async ({
    page,
  }) => {
    await openWith(page, {}, DATA, { user: null })
    await expect(page).toHaveURL(/#\/login$/)
    await expect(heading(page)).toHaveText("Вхід")

    await page.getByLabel("Email").fill("olena@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("невірний")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(page.getByRole("alert")).toHaveText(
      "Невірний email або пароль",
    )

    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(heading(page)).toHaveText("Підтвердьте вхід")
    await expect(heading(page)).toBeFocused()
    await typeCode(page, "111111")
    await expect(page.getByText("Код не підходить")).toBeVisible()

    await page
      .getByRole("checkbox", { name: /Запам'ятати цей пристрій на 30 днів/ })
      .check()
    await typeCode(page, "123456")
    await expect(page).toHaveURL(/#\/data$/)
    await listLoaded(page)

    // Довірений пристрій: наступний вхід без коду.
    await page
      .getByRole("button", { name: "Меню користувача: Олена Коваль" })
      .click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()
    await expect(page).toHaveURL(/#\/login$/)
    await page.getByLabel("Email").fill("olena@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await listLoaded(page)
  })

  test("інший спосіб: SMS із відліком повтору, резервний код", async ({
    page,
  }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByLabel("Email").fill("olena@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await page.getByRole("button", { name: "SMS", exact: true }).click()
    await expect(
      page.getByText("Ми надіслали код у SMS на +380 •• ••• •• 45."),
    ).toBeVisible()
    await expect(toast(page, "SMS на +380671234545: код 123456")).toBeVisible()
    await expect(
      page.getByRole("button", { name: /Надіслати ще раз через 0:\d\d/ }),
    ).toBeDisabled()

    await page.getByRole("button", { name: "Резервний код" }).click()
    await page.getByLabel("Код", { exact: true }).fill("ab12cd34")
    await page.getByRole("button", { name: "Підтвердити" }).click()
    await expect(page).toHaveURL(/#\/data$/)
  })

  test("тимчасовий пароль: спершу новий, із підказкою надійності", async ({
    page,
  }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByLabel("Email").fill("marta@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("temp-password")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(heading(page)).toHaveText("Встановіть новий пароль")
    const field = page.getByLabel("Новий пароль", { exact: true })
    await field.fill("коротко")
    await expect(page.getByText(/Надійність пароля: закороткий/)).toBeVisible()
    await field.fill("кава з молоком о сьомій ранку")
    await expect(page.getByText("Надійність пароля: надійний")).toBeVisible()
    await page.getByRole("button", { name: "Показати пароль" }).click()
    await expect(field).toHaveAttribute("type", "text")
    await page.getByRole("button", { name: "Зберегти пароль" }).click()
    await expect(page).toHaveURL(/#\/data$/)
  })

  test("після 3 невдалих спроб — перевірка «не бот», потім вхід", async ({
    page,
  }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByLabel("Email").fill("ivan@zoriana.example")
    for (let i = 0; i < 3; i++) {
      await page.getByLabel("Пароль", { exact: true }).fill(`x${String(i)}`)
      await page.getByRole("button", { name: "Увійти", exact: true }).click()
      await expect(page.getByRole("alert")).toHaveText(
        "Невірний email або пароль",
      )
    }
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(page.getByText("Перевірку пройдено")).toBeVisible()
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(page).toHaveURL(/#\/data$/)
  })
})

test.describe("вхід без пароля й SSO", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("код на email або посилання з листа", async ({ page }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByRole("tab", { name: "Код на email" }).click()
    await page.getByLabel("Email").fill("olena@zoriana.example")
    await page.getByRole("button", { name: "Надіслати код" }).click()
    await expect(
      page.getByText("Ми надіслали код і посилання на o•••@zoriana.example."),
    ).toBeVisible()
    const letter = toast(page, "Лист на olena@zoriana.example")
    await expect(letter).toContainText("код 123456")
    await letter
      .getByRole("button", { name: "Відкрити посилання з листа" })
      .click()
    await expect(page).toHaveURL(/#\/data$/)
    await listLoaded(page)
  })

  test("код у SMS", async ({ page }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByRole("tab", { name: "Код у SMS" }).click()
    await page.getByLabel("Телефон").fill("+380 50 111 22 33")
    await page.getByRole("button", { name: "Надіслати код" }).click()
    await typeCode(page, "123456")
    await expect(page).toHaveURL(/#\/data$/)
    await expect(
      page.getByRole("button", { name: "Меню користувача: Іван Петренко" }),
    ).toBeVisible()
  })

  test("Google: сторінка провайдера → повернення; скасування — помилка", async ({
    page,
  }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByRole("button", { name: "Увійти через Google" }).click()
    await expect(heading(page)).toHaveText("Google — демо-провайдер")
    await page.getByRole("button", { name: "Скасувати вхід" }).click()
    await expect(
      page.getByText("Не вдалося увійти через провайдера"),
    ).toBeVisible()

    await page.goto(LOGIN)
    await page.getByRole("button", { name: "Увійти з Apple" }).click()
    await page
      .getByRole("button", { name: /Продовжити як Іван Петренко/ })
      .click()
    await expect(page).toHaveURL(/#\/data$/)
    await listLoaded(page)
  })

  test("ключ доступу (віртуальний автентифікатор)", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("WebAuthn.enable")
    const { authenticatorId } = await cdp.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
        },
      },
    )
    // Ключ користувача для віртуального автентифікатора (P-256, PKCS#8).
    const privateKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
      .privateKey.export({ format: "der", type: "pkcs8" })
      .toString("base64")
    await cdp.send("WebAuthn.addCredential", {
      authenticatorId,
      credential: {
        credentialId: btoa("olena-passkey"),
        isResidentCredential: true,
        rpId: "localhost",
        privateKey,
        userHandle: btoa("u-olena"),
        signCount: 0,
      },
    })
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByRole("button", { name: "Увійти ключем доступу" }).click()
    await expect(page).toHaveURL(/#\/data$/)
    await expect(
      page.getByRole("button", { name: "Меню користувача: Олена Коваль" }),
    ).toBeVisible()
  })
})

test.describe("відновлення, запрошення, реєстрація", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("забули пароль → лист → новий пароль → код → вхід", async ({ page }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByRole("link", { name: "Забули пароль?" }).click()
    await expect(heading(page)).toHaveText("Відновлення пароля")
    await page.getByLabel("Email").fill("olena@zoriana.example")
    await page.getByRole("button", { name: "Надіслати посилання" }).click()
    await expect(heading(page)).toHaveText("Перевірте пошту")
    await toast(page, "Лист на olena@zoriana.example")
      .getByRole("button", { name: "Відкрити посилання з листа" })
      .click()
    await expect(heading(page)).toHaveText("Новий пароль")
    // Токен із листа екран прочитав — в адресі його вже немає (A2a).
    await expect(page).toHaveURL(/#\/login\/reset$/)
    await page
      .getByLabel("Новий пароль", { exact: true })
      .fill("новий-надійний-пароль-2026")
    await page.getByRole("button", { name: "Зберегти пароль" }).click()
    await expect(heading(page)).toHaveText("Підтвердьте вхід")
    await typeCode(page, "123456")
    await expect(page).toHaveURL(/#\/data$/)
  })

  test("недійсне посилання відновлення — пропонує нове", async ({ page }) => {
    await openWith(page, {}, "/#/login/reset?token=nope", { user: null })
    await page
      .getByLabel("Новий пароль", { exact: true })
      .fill("новий-надійний-пароль-2026")
    await page.getByRole("button", { name: "Зберегти пароль" }).click()
    await expect(
      page.getByText("Посилання для відновлення застаріло"),
    ).toBeVisible()
    await expect(heading(page)).toHaveText("Посилання застаріло")
    await expect(
      page.getByRole("link", { name: "Запросити нове посилання" }),
    ).toBeVisible()
  })

  test("запрошення колеги: ім'я, пароль, вхід", async ({ page }) => {
    await openWith(page, {}, "/#/login/invite?token=demo-invite", {
      user: null,
    })
    await expect(heading(page)).toHaveText(
      "Приєднатися до ТОВ «Зоряна логістика»",
    )
    await expect(page.getByText(/Олена Коваль запрошує вас/)).toBeVisible()
    await page.getByRole("button", { name: "Приєднатися" }).click()
    await expect(page.getByText("Заповніть це поле").first()).toBeVisible()
    await page.getByLabel("Ваше ім'я").fill("Петро Новенький")
    await page
      .getByLabel("Новий пароль", { exact: true })
      .fill("мій-перший-пароль-тут")
    await page.getByRole("button", { name: "Приєднатися" }).click()
    await expect(page).toHaveURL(/#\/data$/)
    await expect(
      page.getByRole("button", { name: "Меню користувача: Петро Новенький" }),
    ).toBeVisible()
    // Пішли з екрана запрошення — токена й у вкладці немає.
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("erp-ui:email-link-token:invite"),
      ),
    ).toBeNull()
  })

  test("токен із листа — поза адресою й історією, оновлення сторінки запрошення не губить", async ({
    page,
  }) => {
    const title = "Приєднатися до ТОВ «Зоряна логістика»"
    await openWith(page, {}, "/#/login/invite?token=demo-invite", {
      user: null,
    })
    await expect(heading(page)).toHaveText(title)
    await expect(page).toHaveURL(/#\/login\/invite$/)

    await page.reload()
    await expect(heading(page)).toHaveText(title)

    // Запис історії з токеном замінено: «Назад» і «Вперед» його не повертають.
    await page.goBack()
    await page.goForward()
    await expect(page).toHaveURL(/#\/login\/invite$/)
    await expect(heading(page)).toHaveText(title)
  })

  test("реєстрація: компанія, код з листа, власник бачить дані", async ({
    page,
  }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByRole("link", { name: "Зареєструватися" }).click()
    await expect(heading(page)).toHaveText("Реєстрація")
    await page.getByLabel("Ваше ім'я").fill("Тарас Шевченко")
    await page.getByLabel("Email").fill("olena@zoriana.example")
    await page
      .getByLabel("Пароль", { exact: true })
      .fill("садок вишневий коло хати")
    await page.getByLabel("Назва компанії").fill("ФОП Шевченко Т. Г.")
    await page.getByRole("button", { name: "Створити акаунт" }).click()
    await expect(
      page.getByText("Акаунт із таким email уже є — увійдіть"),
    ).toBeVisible()
    await page.getByLabel("Email").fill("taras@example.com")
    await page.getByRole("button", { name: "Створити акаунт" }).click()
    await expect(heading(page)).toHaveText("Підтвердьте email")
    await typeCode(page, "123456")
    await expect(page).toHaveURL(/#\/data$/)
  })
})

test.describe("сесія й безпека акаунта", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("попередження перед кінцем сесії: «Продовжити роботу»", async ({
    page,
  }) => {
    await page.clock.install()
    await openWith(page, {}, "/#/primitives")
    await page.clock.fastForward("29:05")
    const dialog = page.getByRole("alertdialog", {
      name: "Сесія скоро закінчиться",
    })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/Через 0:\d\d ми вийдемо з акаунта/)
    await dialog.getByRole("button", { name: "Продовжити роботу" }).click()
    await expect(dialog).toBeHidden()
  })

  test("сесія закінчилась — вихід на сторінку входу", async ({ page }) => {
    await page.clock.install()
    await openWith(page, {}, "/#/primitives")
    await page.clock.fastForward("31:00")
    await expect(page).toHaveURL(/#\/login/)
  })

  test("вихід в одній вкладці виходить і в іншій", async ({
    page,
    context,
  }) => {
    await openWith(page, {}, "/#/primitives")
    const second = await context.newPage()
    await second.goto("/#/primitives")
    await expect(
      second.getByRole("button", { name: "Меню користувача: Олена Коваль" }),
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Меню користувача: Олена Коваль" })
      .click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()
    await expect(second).toHaveURL(/#\/login/)
  })

  test("зміна email: повторне підтвердження кодом, код на нову адресу", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/settings/security")
    await expect(heading(page)).toHaveText("Безпека акаунта")
    await page.getByLabel("Новий email").fill("olena.new@zoriana.example")
    await page.getByRole("button", { name: "Надіслати код" }).click()
    const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
    await expect(reauth).toBeVisible()
    await reauth.getByRole("button", { name: "Підтвердити кодом" }).click()
    await reauth.getByLabel("Код із застосунку").fill("123456")
    await reauth
      .getByRole("button", { name: "Підтвердити", exact: true })
      .click()
    await expect(
      page.getByText(/Введіть код, надісланий на o•••@zoriana.example/),
    ).toBeVisible()
    await page.getByLabel(/Введіть код, надісланий/).fill("123456")
    await expect(page.getByText(/Email змінено/)).toBeVisible()
  })

  test("видалення акаунта: слово-підтвердження, пароль, вихід", async ({
    page,
  }) => {
    await openWith(page, {}, "/#/settings/security", { user: USERS.sales })
    await page.getByRole("button", { name: "Видалити акаунт" }).click()
    const confirm = page.getByRole("dialog", {
      name: "Видалити акаунт назавжди?",
    })
    const submit = confirm.getByRole("button", { name: "Видалити акаунт" })
    await expect(submit).toBeDisabled()
    await confirm
      .getByLabel("Щоб підтвердити, введіть ВИДАЛИТИ")
      .fill("ВИДАЛИТИ")
    await submit.click()
    const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
    await reauth.getByLabel("Пароль", { exact: true }).fill("demo")
    await reauth
      .getByRole("button", { name: "Підтвердити", exact: true })
      .click()
    await expect(page).toHaveURL(/#\/login/)
  })
})

test.describe("вхід: axe і ширини", () => {
  for (const path of [
    LOGIN,
    "/#/login/forgot",
    "/#/signup",
    "/#/login/invite?token=demo-invite",
  ])
    for (const theme of ["light", "dark"] as const)
      test(`${path} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await openWith(page, { theme }, path, { user: null })
        await expect(heading(page)).toBeVisible()
        await expectNoA11yViolations(page)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(390)
      })

  test("крок коду й безпека акаунта", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByLabel("Email").fill("olena@zoriana.example")
    await page.getByLabel("Пароль", { exact: true }).fill("demo")
    await page.getByRole("button", { name: "Увійти", exact: true }).click()
    await expect(heading(page)).toHaveText("Підтвердьте вхід")
    await expectNoA11yViolations(page)
    await openWith(page, {}, "/#/settings/security")
    await expectNoA11yViolations(page)
  })
})
