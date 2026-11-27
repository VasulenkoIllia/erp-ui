import { expect, type Page } from "@playwright/test"

/**
 * Дошка з колонкою на 500 карток для `pnpm perf` (UI07b, ADR-0103): демо відкрите з `?cards=500`, колонка
 * «Нові» показує всі картки одразу. Заміри й межі — `perf.spec.ts`; кадр під час дій ловить і перенесення
 * після закриття меню чи кидка, яке INP не бачить.
 */
export const BOARD_STRESS = "/#/board?cards=500"
const BOARD_STRESS_CARDS = 500

const stressCards = (page: Page, column: string) =>
  page.locator(`[data-kanban-cards="${column}"] > li`)

export async function boardReady(page: Page) {
  await expect(stressCards(page, "new")).toHaveCount(BOARD_STRESS_CARDS, {
    timeout: 30_000,
  })
}

/**
 * Вибір картки, стрілки між колонками, «Перемістити в…» з клавіатури, перетягування й перенесення вибраної
 * панеллю: кожна дія перемальовує колонку на 500 карток (картка йде з неї одразу, до відповіді сервера).
 */
export async function interactWithBoard(page: Page) {
  const fresh = stressCards(page, "new")
  const before = await fresh.count()
  await fresh.nth(0).getByRole("checkbox").click()

  const menu = fresh.nth(1).locator("[data-kanban-card-menu]")
  await menu.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowLeft")
  await expect(menu).toBeFocused()
  await page.keyboard.press("Enter")
  await page.getByRole("menuitemradio", { name: "Кваліфікація" }).press("Enter")
  await expect(fresh).toHaveCount(before - 1)

  await fresh
    .nth(2)
    .dragTo(page.locator('[data-kanban-cell="qualified"]').first())
  await expect(fresh).toHaveCount(before - 2)

  await page.getByRole("button", { name: "Перемістити в…" }).click()
  await page.getByRole("menuitem", { name: "Пропозиція" }).click()
  await expect(fresh).toHaveCount(before - 3)
  await expect(
    page.locator("[aria-busy='true'][data-slot='kanban-card']"),
  ).toHaveCount(0)
}
