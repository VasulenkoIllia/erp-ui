import { expect, test, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Легкий набір (ADR-0099): вхід і новий пароль для свого сервера проекту (erp/login-form, erp/auth-card) і вибір
 * без форми з числовим id (erp/form-select). Сервер входу — демо в сторінці (apps/demo/src/pages/LightAuthPage.tsx).
 */
const LOGIN = "/#/light/login"
const PASSWORD = "/#/light/password"
const FORMS = "/#/forms"
const DEMO_PASSWORD = "demo-password-12"

const heading = (page: Page) => page.getByRole("heading", { level: 1 })
const signInButton = (page: Page) =>
  page.getByRole("button", { name: /^Увійти/ })

async function signIn(page: Page, login: string, password: string) {
  await page.getByLabel("Логін", { exact: true }).fill(login)
  await page.getByLabel("Пароль", { exact: true }).fill(password)
  await signInButton(page).click()
}

test.describe("легкий набір: вхід для свого сервера", () => {
  for (const { width, theme } of [
    { width: 390, theme: "light" },
    { width: 1440, theme: "dark" },
  ] as const)
    test(`вхід логіном ${String(width)} ${theme}: порожньо, невірно, вдалося`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await openWith(page, { theme }, LOGIN, { user: null })
      await expect(heading(page)).toHaveText("Вхід")
      await expectNoHorizontalScroll(page)
      await expectNoA11yViolations(page)

      await signInButton(page).click()
      await expect(page.getByLabel("Логін", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      )
      await expectNoA11yViolations(page)

      await signIn(page, "manager", "невірний")
      await expect(page.getByRole("alert")).toHaveText(
        "Невірний логін або пароль",
      )
      await expectNoA11yViolations(page)

      await page.getByLabel("Пароль", { exact: true }).fill(DEMO_PASSWORD)
      await signInButton(page).click()
      await expect(page.getByRole("status")).toHaveText(
        "Ви увійшли як manager (демо).",
      )
    })

  test("забагато спроб: відлік за Retry-After і без нього; збій мережі", async ({
    page,
  }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await signIn(page, "limit", "будь-який")
    await expect(page.getByRole("alert")).toHaveText(
      "Забагато спроб. Спробуйте через 0:30",
    )
    // Кнопка лишається у фокусі, недоступна через aria-disabled, з відліком.
    await expect(signInButton(page)).toHaveAttribute("aria-disabled", "true")
    await expect(signInButton(page)).toContainText(/0:[0-3]\d/)

    await page.reload()
    await signIn(page, "budget", "будь-який")
    await expect(page.getByRole("alert")).toHaveText(
      "Забагато спроб. Спробуйте пізніше",
    )
    await expect(signInButton(page)).toHaveAttribute("aria-disabled", "false")

    await signIn(page, "offline", "будь-який")
    await expect(page.getByRole("alert")).toHaveText(
      "Немає з'єднання з сервером",
    )
  })

  test("email замість логіна: підпис, тип поля, вхід", async ({ page }) => {
    await openWith(page, {}, LOGIN, { user: null })
    await page.getByRole("combobox", { name: "Перше поле" }).click()
    await page.getByRole("option", { name: "Email" }).click()
    const email = page.getByLabel("Email", { exact: true })
    await expect(email).toHaveAttribute("type", "email")
    await email.fill("manager@demo.example")
    await page.getByLabel("Пароль", { exact: true }).fill(DEMO_PASSWORD)
    await signInButton(page).click()
    await expect(page.getByRole("status")).toHaveText(
      "Ви увійшли як manager@demo.example (демо).",
    )
  })

  test("новий пароль за посиланням: мінімум 12, застаріле посилання, збережено", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await openWith(page, {}, PASSWORD, { user: null })
    await expect(heading(page)).toHaveText("Новий пароль")
    const field = page.getByLabel("Новий пароль", { exact: true })
    const save = page.getByRole("button", { name: "Зберегти пароль" })

    await field.fill("коротко1")
    await save.click()
    await expect(page.getByText("Щонайменше 12 символів")).toBeVisible()
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await expectNoA11yViolations(page)

    await page.getByRole("combobox", { name: "Посилання" }).click()
    await page.getByRole("option", { name: "Застаріле" }).click()
    await field.fill("довга фраза з кількох слів")
    await save.click()
    await expect(page.getByRole("alert")).toHaveText(
      "Посилання застаріло або вже використане.",
    )

    await page.getByRole("combobox", { name: "Посилання" }).click()
    await page.getByRole("option", { name: "Дійсне" }).click()
    await field.fill("довга фраза з кількох слів")
    await save.click()
    await expect(page.getByRole("status")).toHaveText(
      "Пароль збережено (демо). Тепер можна увійти.",
    )
    await expectNoHorizontalScroll(page)
  })

  test("вибір без форми віддає число (FormSelect)", async ({ page }) => {
    await openWith(page, {}, FORMS)
    await page.getByRole("combobox", { name: "Постачальник" }).click()
    await page.getByRole("option", { name: "Опт Південь" }).click()
    await expect(page.getByTestId("supplier-id")).toHaveText(
      "Вибрано id 42 (число)",
    )
  })
})
