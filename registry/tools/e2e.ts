/**
 * Помічники e2e (Playwright + axe) для проекту на кіті erp-ui (крок 1.9, ADR-0029). Файл ставить
 * `shadcn add` (елемент `tools/e2e`) у `e2e/erp-ui.ts`: у проекті його не правте, свої помічники
 * (користувачі моків, ширини, теми) — поруч, у своєму файлі.
 *
 *   await openAs(page, "/crm/contacts", { user: "u-oksana", appearance: { theme: "dark" } })
 *   await expectNoA11yViolations(page)
 */
import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"

/** Вигляд у localStorage (`lib/appearance`): тема, палітра, мова — до першого кадру. */
export const APPEARANCE_STORAGE_KEY = "erp-ui:appearance"
/** Сесія мок-сервера (`lib/mock-server`): вхід без форми. */
export const MOCK_SESSION_STORAGE_KEY = "erp-ui:mock-session"

export interface AppearanceSeed {
  palette?: string
  theme?: "light" | "dark" | "system"
  density?: "comfortable" | "compact"
  sidebar?: "light" | "dark"
  language?: "uk" | "en"
}

/** Правила axe: WCAG 2.2 AA (SPEC §10). */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

/**
 * Відкрити сторінку під користувачем моків (`user` — id із `createPlatformHandlers({ users })`;
 * `null` — гість) з виглядом. Сховище засівається один раз на виклик: після reload тест бачить те,
 * що змінив сам (вигляд, вхід, вихід), а не початкові значення.
 */
export async function openAs(
  page: Page,
  path: string,
  {
    user,
    appearance = {},
  }: { user: string | null; appearance?: AppearanceSeed },
): Promise<void> {
  await page.addInitScript(
    ([token, appearanceKey, appearanceValue, sessionKey, session]) => {
      // Лише сторінка застосунку: у вбудованих фреймах (Turnstile тощо) сховище чуже чи недоступне.
      if (window !== window.top) return
      const seeded = JSON.parse(
        sessionStorage.getItem("e2e-seeded") ?? "[]",
      ) as string[]
      if (seeded.includes(token)) return
      sessionStorage.setItem("e2e-seeded", JSON.stringify([...seeded, token]))
      localStorage.setItem(appearanceKey, appearanceValue)
      if (session) localStorage.setItem(sessionKey, session)
      else localStorage.removeItem(sessionKey)
    },
    [
      crypto.randomUUID(),
      APPEARANCE_STORAGE_KEY,
      JSON.stringify(appearance),
      MOCK_SESSION_STORAGE_KEY,
      user ? JSON.stringify({ userId: user, stage: "authenticated" }) : "",
    ] as const,
  )
  await page.goto(path)
  await page.evaluate(() => document.fonts.ready)
  // Ключ вигляду перейменують — темна тема мовчки стала б світлою: перевіряємо, що вона ввімкнулась.
  if (appearance.theme === "dark" || appearance.theme === "light")
    await expect(page.locator("html")).toHaveClass(
      appearance.theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/,
    )
}

/** Довше анімація появи не триває (токени руху — до 250 мс); призупинена не тримає тест. */
const ANIMATIONS_WAIT_MS = 2_000

/** axe за WCAG 2.2 AA; скінченні анімації спершу завершуються (напівпрозорі кадри дають хибний контраст). */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  await page.evaluate(
    (waitMs) =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
            .map((a) => a.finished.catch(() => undefined)),
        ),
        new Promise((resolve) => setTimeout(resolve, waitMs)),
      ]),
    ANIMATIONS_WAIT_MS,
  )
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([])
}

/** Сторінка не прокручується вбік (телефон, SPEC §9). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
}

/**
 * Комірка рядка грида за назвою колонки: номер — із заголовка (`aria-colindex`), а не з порядку
 * колонок у коді. Колонку розширення (ADR-0020) чи переставлену тест знайде так само.
 */
export async function cellOf(
  grid: Locator,
  row: Locator,
  column: string,
): Promise<Locator> {
  const header = grid.getByRole("columnheader", { name: column, exact: true })
  const index = await header.getAttribute("aria-colindex")
  if (!index) throw new Error(`Колонки «${column}» у гриді немає`)
  return row.locator(`[role="gridcell"][aria-colindex="${index}"]`)
}

/**
 * Base UI переносить фокус у щойно відкрите меню в наступному кадрі: клавіша, натиснута раніше,
 * піде на кнопку, а фокус, поставлений раніше, меню забере собі.
 */
export async function waitForMenuFocus(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.closest("[role=menu]") != null,
      ),
    )
    .toBe(true)
}

/**
 * Пункт підменю (мова, палітра…) клавіатурою; меню вже відкрите. `click()` Playwright «стрибає» на
 * пункт без руху вказівника, і на завантаженій машині (CI) підменю, що ще з'являється, закривається;
 * клавіатура від таймінгу не залежить.
 */
export async function chooseInSubmenu(
  page: Page,
  submenu: RegExp,
  item: string,
): Promise<void> {
  await waitForMenuFocus(page)
  await page.getByRole("menuitem", { name: submenu }).focus()
  await page.keyboard.press("ArrowRight")
  await page.getByRole("menuitemradio", { name: item }).focus()
  await page.keyboard.press("Enter")
}
