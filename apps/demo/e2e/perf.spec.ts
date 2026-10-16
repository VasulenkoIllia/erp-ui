import { expect, test, type Browser, type Page } from "@playwright/test"

import { SESSION_KEY, USERS } from "./helpers"

/**
 * Бюджети швидкості (ADR-0009, SPEC §18.5) на телефоні середнього класу: CPU у 4 рази повільніше
 * за еталонний Mac, мережа 4G, холодний кеш, ширина 390 px. Перший екран (LCP) ≤ 2,5 с, відгук на
 * дії (INP) ≤ 200 мс. Медіана з кількох прогонів: один повільний кадр раннера CI не валить перевірку.
 * Окремий проект Playwright (`pnpm perf`), один потік: паралельні тести спотворили б заміри.
 */
const CPU_SLOWDOWN = 4
/**
 * Калібрування (вікторина 14.10.2026): ×4 — це телефон середнього класу відносно Mac, на якому
 * задано бюджети (Apple M4 Pro, еталонне навантаження — 16,7 мс). Раннер CI сам повільніший, і ×4
 * на ньому — уже слабкий телефон. Тому множник = 4 × еталон / замір на цій машині, не менше 1:
 * раннер зі сповільненням відповідає тому самому телефону.
 */
const REFERENCE_BENCHMARK_MS = 16.7
const BENCHMARK_RUNS = 7
/** 4G: 9 Мбіт/с униз, 1,5 Мбіт/с угору, затримка 40 мс (вікторина 14.10.2026). */
const NETWORK = {
  latency: 40,
  downloadThroughput: (9 * 1e6) / 8,
  uploadThroughput: (1.5 * 1e6) / 8,
}
const LCP_BUDGET_MS = 2500
const INP_BUDGET_MS = 200
/** П'ять прогонів (вікторина наприкінці 1.2): один повільний клік раннера CI не зсуває медіану. */
const RUNS = 5
/** Скільки взаємодій щонайменше має побачити браузер за прогін (див. interactWithList). */
const MIN_INTERACTIONS = 5

const DATA = "/#/data"

declare global {
  interface Window {
    __perf: { lcp: number; inp: number; slowest: string }
  }
}

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

/** Нова вкладка з холодним кешем, сповільненням і спостерігачами LCP та Event Timing. */
async function openThrottled(
  browser: Browser,
  cpuRate: number,
  viewport = PHONE,
): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
  })
  const page = await context.newPage()
  await page.addInitScript(
    ([sessionKey, session]) => {
      localStorage.setItem(sessionKey, session)
      const perf = { lcp: 0, inp: 0, slowest: "" }
      window.__perf = perf
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.lcp = entry.startTime
      }).observe({ type: "largest-contentful-paint", buffered: true })
      // INP при < 50 взаємодіях — найдовша з них (web.dev/inp).
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEventTiming[])
          if (entry.interactionId && entry.duration > perf.inp) {
            perf.inp = entry.duration
            // Для звіту: яка дія найповільніша (подія й елемент).
            const target = entry.target instanceof Element ? entry.target : null
            perf.slowest = `${entry.name} ${target?.tagName.toLowerCase() ?? "?"}${
              target?.getAttribute("aria-label")
                ? ` «${target.getAttribute("aria-label")}»`
                : ""
            } ${(target?.textContent ?? "").trim().slice(0, 30)}`
          }
      }).observe({
        type: "event",
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit)
    },
    [
      SESSION_KEY,
      JSON.stringify({ userId: USERS.accountant, stage: "authenticated" }),
    ] as const,
  )
  const cdp = await context.newCDPSession(page)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate })
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    ...NETWORK,
  })
  return page
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

/** Фіксоване навантаження JS (масиви, рядки, сортування) — мірило швидкості машини, мс. */
function benchmark(): number {
  const start = performance.now()
  let checksum = 0
  for (let round = 0; round < 40; round++) {
    const items: { id: number; label: string; amount: number }[] = []
    for (let i = 0; i < 5000; i++)
      items.push({ id: i, label: `row-${i}-${round}`, amount: (i * 37) % 1000 })
    items.sort((a, b) => a.amount - b.amount || a.id - b.id)
    checksum += items.map((item) => item.label).join(",").length
  }
  // Результат використано — рушій не викине цикл.
  if (checksum < 0) throw new Error("benchmark")
  return performance.now() - start
}

/** Множник сповільнення CPU для цієї машини (див. REFERENCE_BENCHMARK_MS). */
async function calibratedSlowdown(
  browser: Browser,
): Promise<{ rate: number; benchmarkMs: number }> {
  const page = await browser.newPage()
  const runs: number[] = []
  for (let run = 0; run < BENCHMARK_RUNS; run++)
    runs.push(await page.evaluate(benchmark))
  await page.close()
  // Перший прогін — розігрів рушія, у медіану не йде.
  const benchmarkMs = median(runs.slice(1))
  const rate = Math.max(
    1,
    (CPU_SLOWDOWN * REFERENCE_BENCHMARK_MS) / benchmarkMs,
  )
  return {
    rate: Math.round(rate * 10) / 10,
    benchmarkMs: Math.round(benchmarkMs * 10) / 10,
  }
}

/** Дії, які людина робить зі списком: пошук, вкладка, фільтр, сортування, палітра команд. */
async function interactWithList(page: Page) {
  const search = page.getByRole("searchbox", {
    name: "Пошук за номером чи клієнтом",
  })
  await search.click()
  await search.pressSequentially("Агро", { delay: 120 })
  await page.getByRole("tab", { name: /^Прострочені/ }).click()
  // Панель фільтрів на телефоні — шторка: відкрити, вибрати клієнта, застосувати.
  await page.getByRole("button", { name: /^Фільтри/ }).click()
  const filters = page.getByRole("dialog", { name: "Фільтри" })
  await filters.getByRole("checkbox", { name: "ПП «Агросвіт»" }).click()
  await filters.getByRole("button", { name: "Застосувати" }).click()
  await expect(filters).toBeHidden()
  // На 390 px таблиця — картки: сортування з рядка стану, а не із заголовка колонки.
  await page.getByRole("combobox", { name: "Сортування" }).click()
  await page.getByRole("option", { name: "Сума, за спаданням" }).click()
  await page.keyboard.press("Control+k")
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
}

/**
 * Грід на десктопі (перевірка 0.6d): прапорці рядків, «вибрати всі за фільтром» і редактори клієнта
 * й суми в комірці. Кожна комірка має свій `useUpdate`, а рядок гріда не мемоізований — чи не
 * виходить клік по прапорцю за бюджет INP.
 */
async function interactWithGrid(page: Page) {
  const grid = page.getByRole("grid", { name: "Рахунки клієнтам" })
  const rows = grid.locator('[role="row"][data-index]')
  for (let i = 0; i < 3; i++) await rows.nth(i).getByRole("checkbox").click()
  const all = page.getByRole("checkbox", { name: "Вибрати всі за фільтром" })
  await all.click()
  await all.click()
  // Клієнт і сума: кнопка значення відкриває поле, Escape повертає кнопку.
  for (const column of ["3", "7"]) {
    await rows
      .first()
      .locator(`[aria-colindex="${column}"]`)
      .getByRole("button")
      .click()
    await expect(grid.getByRole("textbox")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(grid.getByRole("textbox")).toBeHidden()
  }
}

/** Медіана LCP і INP за RUNS прогонів: відкрити сторінку й виконати дії. */
async function measure(
  browser: Browser,
  rate: number,
  viewport: typeof PHONE,
  ready: (page: Page) => Promise<void>,
  interact: (page: Page) => Promise<void>,
) {
  const lcp: number[] = []
  const inp: number[] = []
  const slowest: string[] = []
  for (let run = 0; run < RUNS; run++) {
    const page = await openThrottled(browser, rate, viewport)
    // Збій заміру не лишає живий контекст із уповільненням: він спотворив би наступні.
    try {
      await page.goto(DATA)
      await ready(page)
      // LCP фіксується до першої взаємодії — даємо сторінці домалюватись.
      await page.waitForTimeout(500)
      lcp.push(await page.evaluate(() => window.__perf.lcp))
      await interact(page)
      await page.waitForTimeout(500)
      inp.push(await page.evaluate(() => window.__perf.inp))
      slowest.push(await page.evaluate(() => window.__perf.slowest))
      // Порожній замір (спостерігачі нічого не отримали) не має пройти як «0 мс».
      const interactions = await page.evaluate(
        () =>
          (performance as Performance & { interactionCount?: number })
            .interactionCount ?? 0,
      )
      expect(lcp.at(-1), "LCP записано").toBeGreaterThan(0)
      expect(inp.at(-1), "INP записано").toBeGreaterThan(0)
      expect(interactions, "взаємодії враховано").toBeGreaterThanOrEqual(
        MIN_INTERACTIONS,
      )
    } finally {
      await page.context().close()
    }
  }
  return { lcp: median(lcp), inp: median(inp), runs: { lcp, inp, slowest } }
}

test.describe("швидкість @perf", () => {
  test("стрес-сторінка: перший екран і відгук на дії", async ({ browser }) => {
    test.setTimeout(300_000)
    const cpu = await calibratedSlowdown(browser)
    const measured = await measure(
      browser,
      cpu.rate,
      PHONE,
      async (page) => {
        // Стрес-сторінка (SPEC §18.1): 10 000 рахунків, на 390 px — картки.
        await expect(
          page.getByRole("feed").getByRole("article").first(),
        ).toBeVisible({ timeout: 30_000 })
      },
      interactWithList,
    )
    const result = { ...measured, cpu }
    console.log(`perf ${DATA}: ${JSON.stringify(result)}`)
    test.info().annotations.push({
      type: "perf",
      description: JSON.stringify(result),
    })
    expect(result.lcp, "LCP, мс").toBeLessThanOrEqual(LCP_BUDGET_MS)
    expect(result.inp, "INP, мс").toBeLessThanOrEqual(INP_BUDGET_MS)
  })

  test("стрес-сторінка на десктопі: прапорці й редагування в комірці", async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const cpu = await calibratedSlowdown(browser)
    const result = {
      ...(await measure(
        browser,
        cpu.rate,
        DESKTOP,
        async (page) => {
          await expect(
            page
              .getByRole("grid", { name: "Рахунки клієнтам" })
              .locator('[role="row"][data-index]')
              .first(),
          ).toBeVisible({ timeout: 30_000 })
        },
        interactWithGrid,
      )),
      cpu,
    }
    console.log(`perf ${DATA} 1440: ${JSON.stringify(result)}`)
    test.info().annotations.push({
      type: "perf",
      description: JSON.stringify(result),
    })
    expect(result.inp, "INP, мс").toBeLessThanOrEqual(INP_BUDGET_MS)
  })
})
