#!/usr/bin/env node
/**
 * Бюджет JS першого екрана (ADR-0009, SPEC §18.5) — храповик: для кожного маршруту демо межа
 * в apps/demo/bundle-budget.json; перевищення валить CI. Ціль — 250 КБ (`targetKb`); межі
 * знижуються, коли кіт худне, і зростають лише явно (`--update`, видно в диффі PR).
 *
 * Перший екран маршруту = вхідний чанк зі статичними імпортами + чанк сторінки з її статичними
 * імпортами. Шар моків (MSW, мок-сервер, фікстури, панель розробника) у бюджет не входить — у
 * проекті його немає; він показується окремим рядком. Читає маніфест Vite, тож після збірки:
 *   pnpm --filter @erp-ui/demo build && node scripts/check-bundle.mjs [--update]
 * КБ — 1000 байт, gzip зі стандартним рівнем, як у звіті Vite.
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

/** Запас над виміряним значенням, коли межі оновлюють. */
export const HEADROOM = 1.05
/** Динамічні входи шару моків: їх замикання — окремий рядок звіту, поза бюджетом. */
export const MOCK_ENTRY =
  /(^|\/)src\/mocks\/|registry\/lib\/mock-|registry\/erp\/dev-panel/
/** Сторінки (ліниві маршрути) демо. */
export const PAGE_ENTRY = /(^|\/)src\/pages\/[^/]+\.tsx$/
export const ENTRY_ROW = "вхід"

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
  const pages = Object.fromEntries(
    dynamic
      .filter((key) => PAGE_ENTRY.test(key))
      .map((key) => [
        path.basename(key),
        without(staticClosure(manifest, key)),
      ]),
  )
  // Без сторінок перевірка пройшла б зеленою, нічого не перевіривши.
  if (Object.keys(pages).length === 0)
    throw new Error(
      "check-bundle: у маніфесті немає сторінок (src/pages/*.tsx) — змінився шлях чи PAGE_ENTRY?",
    )
  return { entry: [...entry], pages, mocks: [...mocks] }
}

/**
 * Рядки звіту `{ name, kb, limitKb, over }` (спершу вхід, далі сторінки від найважчої);
 * `size(key)` — gzip-розмір JS чанка в байтах; маршрут без межі теж `over`. `stale` — межі
 * маршрутів, яких у збірці вже немає (перейменували чи прибрали сторінку).
 */
export function budgetReport(split, size, limitsKb) {
  const kb = (keys) => keys.reduce((sum, key) => sum + size(key), 0) / 1000
  const entryKb = kb(split.entry)
  const row = (name, value) => {
    const limitKb = limitsKb[name]
    return { name, kb: value, limitKb, over: !(value <= limitKb) }
  }
  const pages = Object.entries(split.pages)
    .map(([name, keys]) => row(name, entryKb + kb(keys)))
    .sort((a, b) => b.kb - a.kb)
  const rows = [row(ENTRY_ROW, entryKb), ...pages]
  const stale = Object.keys(limitsKb).filter(
    (name) => !rows.some((r) => r.name === name),
  )
  return { rows, stale, mocksKb: kb(split.mocks) }
}

/** Нові межі: виміряне + запас, округлено вгору до 0,1 КБ. */
export function updatedLimits(rows) {
  return Object.fromEntries(
    rows.map((r) => [r.name, Math.ceil(r.kb * HEADROOM * 10) / 10]),
  )
}

function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  )
  const dist = path.join(repoRoot, "apps/demo/dist")
  const budgetFile = path.join(repoRoot, "apps/demo/bundle-budget.json")
  const manifest = JSON.parse(
    readFileSync(path.join(dist, ".vite/manifest.json"), "utf8"),
  )
  const budget = JSON.parse(readFileSync(budgetFile, "utf8"))
  const size = (key) => {
    const file = manifest[key]?.file
    return file?.endsWith(".js")
      ? gzipSync(readFileSync(path.join(dist, file))).length
      : 0
  }
  const report = budgetReport(splitFirstScreen(manifest), size, budget.limitsKb)

  if (process.argv.includes("--update")) {
    budget.limitsKb = updatedLimits(report.rows)
    writeFileSync(budgetFile, `${JSON.stringify(budget, null, 2)}\n`)
    console.log(
      `check-bundle: межі оновлено в ${path.relative(repoRoot, budgetFile)}`,
    )
    return
  }

  const fmt = (n) => (n === undefined ? "—" : n.toFixed(1)).padStart(7)
  console.log(
    `JS першого екрана, КБ gzip: факт · межа (ціль ${budget.targetKb}; шар моків — поза бюджетом)`,
  )
  for (const r of report.rows)
    console.log(
      `${fmt(r.kb)} ·${fmt(r.limitKb)}  ${r.name}${r.over ? "  ← понад межу" : ""}`,
    )
  console.log(`${fmt(report.mocksKb)}           шар моків`)
  const over = report.rows.filter((r) => r.over)
  if (over.length > 0) {
    console.error(
      `\ncheck-bundle: ${over.length} понад межу. Зменшіть JS (ліниві чанки, ADR-0009) або, якщо зростання свідоме, оновіть межі: node scripts/check-bundle.mjs --update`,
    )
  }
  if (report.stale.length > 0) {
    console.error(
      `\ncheck-bundle: межі для маршрутів, яких немає у збірці: ${report.stale.join(", ")}. Оновіть межі: node scripts/check-bundle.mjs --update`,
    )
  }
  if (over.length > 0 || report.stale.length > 0) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
