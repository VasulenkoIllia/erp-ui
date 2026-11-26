#!/usr/bin/env node
/**
 * Бюджет JS першого екрана (ADR-0009, ADR-0092, SPEC §18.5). Перевищення валить CI.
 *
 * - **Вхід** (вхідний чанк зі статичними імпортами — його вантажить кожен маршрут) — під стелею
 *   `entryCeilingKb` з apps/demo/bundle-budget.json. Стелю піднімає лише ADR із причиною; `--update`
 *   її не змінює. Звіт розкладає вхід на бібліотеки, кіт і демо — це оцінка: gzip коду кожної групи
 *   в чанку, зведений до справжнього розміру чанка (склад пише плагін збірки демо).
 * - **Сторінка** — власна частина першого екрана маршруту: чанк сторінки з його статичними імпортами без
 *   того, що вже є у вході. Храповик: межа — факт + 0,1 КБ (`--update`, видно в диффі PR). Ріст входу
 *   межі сторінок не зачіпає: за нього відповідає стеля. Звіт показує й увесь перший екран маршруту.
 * - **Шар моків** (MSW, мок-сервер, фікстури, панель розробника) — свій храповик, як сторінки. У збірці
 *   проекту з бекендом його немає (ADR-0079, перевіряє consumer-smoke), але в демо він росте з модулями.
 * - **Лише для розробки** — модулі, яких у продакшн-збірці бути не має: повне дерево рядків кіта (`lib/i18n-uk`)
 *   вантажить тільки попередження розробки `createI18n` (ADR-0094). Такий чанк у збірці — помилка.
 *
 * Читає маніфест Vite і склад чанків, тож після збірки:
 *   pnpm --filter @erp-ui/demo build && node scripts/check-bundle.mjs [--update]
 * КБ — 1000 байт, gzip зі стандартним рівнем, як у звіті Vite.
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

/** Запас над фактом, коли `--update` оновлює межі сторінок і шару моків. */
export const HEADROOM_KB = 0.1
/** Динамічні входи шару моків: їх замикання — окремий рядок звіту зі своєю межею. */
export const MOCK_ENTRY =
  /(^|\/)src\/mocks\/|registry\/lib\/mock-|registry\/erp\/dev-panel/
/** Сторінки (ліниві маршрути) демо й модулів кіта (`registry/modules/<модуль>/pages`, ADR-0025). */
export const PAGE_ENTRY =
  /(^|\/)src\/pages\/[^/]+\.tsx$|(^|\/)registry\/modules\/[^/]+\/pages\/[^/]+\.tsx$/
/** Групи коду у звіті входу; склад чанків пише плагін `bundleSources` у apps/demo/vite.config.ts. */
export const SOURCE_GROUPS = ["libs", "kit", "demo"]
/** Модулі лише для розробки: окремим чанком у продакшн-збірці їх бути не має. */
export const DEV_ONLY_ENTRY = /(^|\/)registry\/lib\/i18n-uk\.ts$/
export const SOURCES_FILE = ".vite/bundle-sources.json"

/** Ключі маніфесту з модулями лише для розробки (`DEV_ONLY_ENTRY`). */
export function devOnlyChunks(manifest) {
  return Object.keys(manifest).filter((key) => DEV_ONLY_ENTRY.test(key))
}

/** Ключі маніфесту, досяжні зі `start` статичними імпортами (разом зі `start`). */
export function staticClosure(manifest, start) {
  const seen = new Set()
  const stack = [start]
  while (stack.length) {
    const key = stack.pop()
    if (seen.has(key) || !manifest[key]) continue
    seen.add(key)
    stack.push(...(manifest[key].imports ?? []))
  }
  return seen
}

/**
 * Розкладає маніфест на перший екран: `entry` — ключі вхідного чанка з імпортами,
 * `pages` — для кожної сторінки ключі, яких немає у вхідному, `mocks` — шар моків.
 */
export function splitFirstScreen(manifest) {
  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)
  if (!entryKey) throw new Error("check-bundle: у маніфесті немає входу")
  const entry = staticClosure(manifest, entryKey)
  const dynamic = Object.keys(manifest).filter(
    (key) => manifest[key].isDynamicEntry,
  )
  const without = (keys) => [...keys].filter((key) => !entry.has(key))
  const mocks = new Set(
    dynamic
      .filter((key) => MOCK_ENTRY.test(key))
      .flatMap((key) => without(staticClosure(manifest, key))),
  )
  const pages = {}
  for (const key of dynamic.filter((key) => PAGE_ENTRY.test(key))) {
    const name = path.basename(key)
    // Межа — за назвою файла: дві сторінки з однаковою назвою ділили б одну межу, і друга затерла б першу.
    if (name in pages)
      throw new Error(
        `check-bundle: дві сторінки з назвою ${name} — перейменуйте одну, межі ведуться за назвою файла`,
      )
    pages[name] = without(staticClosure(manifest, key))
  }
  // Без сторінок перевірка пройшла б зеленою, нічого не перевіривши.
  if (Object.keys(pages).length === 0)
    throw new Error(
      "check-bundle: у маніфесті немає сторінок (src/pages/*.tsx) — змінився шлях чи PAGE_ENTRY?",
    )
  return { entry: [...entry], pages, mocks: [...mocks] }
}

/**
 * Звіт `{ entry, pages, mocks, stale }`. `size(key)` — gzip-розмір JS чанка в байтах; `parts(key)` —
 * байти чанка за групами `SOURCE_GROUPS` (сума — `size(key)`). Сторінка без межі теж `over`.
 * `stale` — межі сторінок, яких у збірці вже немає (перейменували чи прибрали сторінку).
 */
export function budgetReport(split, size, budget, parts) {
  const kb = (keys) => keys.reduce((sum, key) => sum + size(key), 0) / 1000
  const limitsKb = budget.pageLimitsKb ?? {}
  const entryKb = kb(split.entry)
  const entryParts = Object.fromEntries(
    SOURCE_GROUPS.map((group) => [
      group,
      split.entry.reduce((sum, key) => sum + (parts(key)[group] ?? 0), 0) /
        1000,
    ]),
  )
  const pages = Object.entries(split.pages)
    .map(([name, keys]) => {
      const own = kb(keys)
      const limitKb = limitsKb[name]
      return {
        name,
        kb: own,
        totalKb: entryKb + own,
        limitKb,
        over: !(own <= limitKb),
      }
    })
    .sort((a, b) => b.kb - a.kb)
  const mocksKb = kb(split.mocks)
  const stale = Object.keys(limitsKb).filter(
    (name) => !pages.some((page) => page.name === name),
  )
  return {
    entry: {
      kb: entryKb,
      ceilingKb: budget.entryCeilingKb,
      over: !(entryKb <= budget.entryCeilingKb),
      parts: entryParts,
    },
    pages,
    mocks: {
      kb: mocksKb,
      limitKb: budget.mocksLimitKb,
      over: !(mocksKb <= budget.mocksLimitKb),
    },
    stale,
  }
}

/** Межа храповика: факт, округлений до 0,1 КБ, як у звіті, плюс `HEADROOM_KB`. */
export function ratchetLimit(kb) {
  return Math.round((Math.round(kb * 10) / 10 + HEADROOM_KB) * 10) / 10
}

/** Новий бюджет після `--update`: межі сторінок і шару моків — за фактом; стеля входу та сама. */
export function updatedBudget(report, budget) {
  return {
    ...budget,
    mocksLimitKb: ratchetLimit(report.mocks.kb),
    pageLimitsKb: Object.fromEntries(
      report.pages.map((page) => [page.name, ratchetLimit(page.kb)]),
    ),
  }
}

/**
 * Частки чанка за групами: gzip коду кожної групи (з плагіна збірки), зведений до справжнього
 * gzip-розміру чанка. Чанк без коду в складі (CSS) — нуль.
 */
export function scaleParts(groupBytes, chunkBytes) {
  const total = SOURCE_GROUPS.reduce(
    (sum, g) => sum + (groupBytes?.[g] ?? 0),
    0,
  )
  return Object.fromEntries(
    SOURCE_GROUPS.map((g) => [
      g,
      total ? ((groupBytes[g] ?? 0) * chunkBytes) / total : 0,
    ]),
  )
}

function printReport(report) {
  const fmt = (n) => (n === undefined ? "—" : n.toFixed(1)).padStart(7)
  const { entry, mocks } = report
  const parts = `бібліотеки ${entry.parts.libs.toFixed(1)} · кіт ${entry.parts.kit.toFixed(1)} · демо ${entry.parts.demo.toFixed(1)}`
  console.log("JS першого екрана, КБ gzip (ADR-0092)")
  console.log(
    `${fmt(entry.kb)} · стеля${fmt(entry.ceilingKb)}  вхід (${parts}; оцінка)${entry.over ? "  ← понад стелю" : ""}`,
  )
  console.log("\nСторінки: власна частина · межа · увесь перший екран маршруту")
  for (const page of report.pages)
    console.log(
      `${fmt(page.kb)} ·${fmt(page.limitKb)} ·${fmt(page.totalKb)}  ${page.name}${page.over ? "  ← понад межу" : ""}`,
    )
  console.log(
    `\n${fmt(mocks.kb)} ·${fmt(mocks.limitKb)}  шар моків (поза збіркою проекту)${mocks.over ? "  ← понад межу" : ""}`,
  )
}

function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  )
  const dist = path.join(repoRoot, "apps/demo/dist")
  const budgetFile = path.join(repoRoot, "apps/demo/bundle-budget.json")
  const readJson = (file, hint) => {
    try {
      return JSON.parse(readFileSync(file, "utf8"))
    } catch (error) {
      throw new Error(
        `check-bundle: не прочитати ${path.relative(repoRoot, file)} — ${hint}`,
        {
          cause: error,
        },
      )
    }
  }
  const build = "зберіть демо: pnpm --filter @erp-ui/demo build"
  const manifest = readJson(path.join(dist, ".vite/manifest.json"), build)
  const sources = readJson(path.join(dist, SOURCES_FILE), build)
  const budget = readJson(budgetFile, "файл меж")
  for (const name of ["entryCeilingKb", "mocksLimitKb"])
    if (typeof budget[name] !== "number")
      throw new Error(
        `check-bundle: у ${path.relative(repoRoot, budgetFile)} немає числа ${name} (ADR-0092)`,
      )
  const size = (key) => {
    const file = manifest[key]?.file
    return file?.endsWith(".js")
      ? gzipSync(readFileSync(path.join(dist, file))).length
      : 0
  }
  const parts = (key) => {
    const bytes = size(key)
    const groups = sources[manifest[key]?.file]
    // Без складу звіт показав би нулі замість бібліотек, кіта й демо — краще впасти.
    if (bytes > 0 && !SOURCE_GROUPS.some((group) => groups?.[group] > 0))
      throw new Error(
        `check-bundle: немає складу чанка ${manifest[key]?.file} у ${SOURCES_FILE} — плагін bundleSources у apps/demo/vite.config.ts його не записав`,
      )
    return scaleParts(groups, bytes)
  }
  const report = budgetReport(splitFirstScreen(manifest), size, budget, parts)
  // Нуль — не легкий вхід, а збірка, якої скрипт не розуміє (інше розширення чанків, інший маніфест).
  if (!(report.entry.kb > 0))
    throw new Error(
      "check-bundle: у вході 0 КБ JS — змінився формат збірки (розширення чанків, маніфест)?",
    )

  if (process.argv.includes("--update")) {
    writeFileSync(
      budgetFile,
      `${JSON.stringify(updatedBudget(report, budget), null, 2)}\n`,
    )
    console.log(
      `check-bundle: межі сторінок і шару моків оновлено в ${path.relative(repoRoot, budgetFile)}; стеля входу та сама`,
    )
    if (report.entry.over) {
      console.error(
        `check-bundle: вхід ${report.entry.kb.toFixed(1)} КБ понад стелю ${report.entry.ceilingKb} — --update її не піднімає (ADR-0092)`,
      )
      process.exit(1)
    }
    return
  }

  printReport(report)
  const pagesOver = report.pages.filter((page) => page.over)
  const devOnly = devOnlyChunks(manifest)
  if (devOnly.length > 0)
    console.error(
      `\ncheck-bundle: у збірці код лише для розробки — ${devOnly.join(", ")}. Гілка import.meta.env.DEV має випадати зі збірки (ADR-0094).`,
    )
  if (report.entry.over)
    console.error(
      `\ncheck-bundle: вхід понад стелю. Зніміть вагу з першого екрана (ліниві чанки, ADR-0009) або підніміть стелю окремим ADR із причиною (ADR-0092); --update стелю не змінює.`,
    )
  if (pagesOver.length > 0 || report.mocks.over)
    console.error(
      `\ncheck-bundle: понад межу — ${[...pagesOver.map((page) => page.name), ...(report.mocks.over ? ["шар моків"] : [])].join(", ")}. Зменшіть JS (ліниві чанки, ADR-0009) або, якщо зростання свідоме, оновіть межі: node scripts/check-bundle.mjs --update`,
    )
  if (report.stale.length > 0)
    console.error(
      `\ncheck-bundle: межі для сторінок, яких немає у збірці: ${report.stale.join(", ")}. Оновіть межі: node scripts/check-bundle.mjs --update`,
    )
  if (
    report.entry.over ||
    pagesOver.length > 0 ||
    report.mocks.over ||
    report.stale.length > 0 ||
    devOnly.length > 0
  )
    process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
