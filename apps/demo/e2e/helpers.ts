import { expect, type Page } from "@playwright/test"

import {
  chooseInSubmenu,
  openAs,
  type AppearanceSeed,
} from "../../../registry/tools/e2e"

// Спільне з проектами — помічники кіта (елемент tools/e2e, у проекті — e2e/erp-ui.ts).
export {
  APPEARANCE_STORAGE_KEY as STORAGE_KEY,
  MOCK_SESSION_STORAGE_KEY as SESSION_KEY,
  cellOf,
  chooseInSubmenu,
  expectNoA11yViolations,
  waitForMenuFocus,
  type AppearanceSeed,
} from "../../../registry/tools/e2e"

/** Користувачі мок-сервера демо (apps/demo/src/mocks/users.ts). */
export const USERS = {
  accountant: "u-olena",
  sales: "u-ivan",
  /** Керівник відділу: `users:read` і `roles:read` без `users:update` і `audit:read`. */
  lead: "u-taras",
  /** Адміністратор платформи поза компаніями: змінює політику безпеки (ADR-0036). */
  platform: "u-andriy",
} as const

/**
 * Відкриває демо з наперед заданим виглядом (через localStorage до завантаження сторінки).
 * За замовчуванням — під обліковим записом бухгалтера; `user: null` — гість.
 */
export async function openWith(
  page: Page,
  seed: AppearanceSeed,
  path = "/",
  { user = USERS.accountant }: { user?: string | null } = {},
): Promise<void> {
  await openAs(page, path, { user, appearance: seed })
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
}

/** Пароль ще раз перед чутливою дією (`useReauth`): демо-пароль за замовчуванням. */
export async function confirmWithPassword(
  page: Page,
  password = "demo",
): Promise<void> {
  const reauth = page.getByRole("dialog", { name: "Підтвердьте, що це ви" })
  await expect(reauth).toBeVisible()
  await reauth.getByLabel("Пароль", { exact: true }).fill(password)
  await reauth.getByRole("button", { name: "Підтвердити", exact: true }).click()
  await expect(reauth).toBeHidden()
}

/** Мова з меню користувача. */
export async function chooseLanguage(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /Меню користувача/ }).click()
  await chooseInSubmenu(page, /Мова/, name)
}

/** Сценарій моків для всіх ресурсів через панель розробника. */
export async function chooseScenario(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /^Моки:/ }).click()
  const panel = page.getByRole("dialog", { name: "Панель розробника" })
  await panel.getByRole("combobox", { name: "Усі ресурси" }).click()
  await page.getByRole("option", { name }).click()
  await panel.getByRole("button", { name: "Закрити" }).click()
  await expect(panel).toBeHidden()
}
