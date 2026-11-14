#!/usr/bin/env node
/**
 * Покажчик ADR (`docs/adr/README.md`) зі статусів самих файлів рішень.
 *
 * Стовпець «Статус» будується з файлів: перше слово рядка «- Статус:», «доповнено» — пізніші ADR, чий
 * рядок статусу називає це рішення, «змінено» — рядки «- Змінено: ADR-NNNN» у файлі (ADR-0080).
 * Опис рішення лишається ручним; новий ADR отримує опис із назви файла.
 *
 *   node scripts/adr-index.mjs           переписує покажчик
 *   node scripts/adr-index.mjs --check   лише перевіряє (частина `pnpm check:docs`)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ADR_FILE = /^(\d{4})-[\w-]+\.md$/
const BASE_STATUS = /^(запропоновано|прийнято|замінено \d{4})/
const FIELD_LINE = /^- [^\s:]+:/
const CHANGED_LINE = /^- Змінено: ADR-(\d{4})/
const INDEX_ROW = /^\| \[(\d{4})\]\(/
const TABLE_HEADER = "| № | Рішення | Статус |\n|---|---|---|"
const CELL_SPLIT = /(?<!\\)\|/

/** Рядок «- Статус:» разом із продовженням на наступних рядках. */
function statusText(lines) {
  const start = lines.findIndex((line) => line.startsWith("- Статус:"))
  if (start === -1) return null
  const parts = [lines[start].slice("- Статус:".length)]
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || FIELD_LINE.test(line) || line.startsWith("#")) break
    parts.push(line)
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * Посилання статусу на ранні ADR: у реченні після «змінює» — зміна, інакше доповнення.
 * Речення ділять `;` і дужки, бо в статусах трапляються «п. 9» і «§3.3».
 */
export function statusRefs(number, text) {
  const extendsRefs = new Set()
  const changes = new Set()
  for (const clause of text.split(/[;()]/)) {
    let mode = "extends"
    for (const token of clause.matchAll(/змінює|доповнює|ADR-(\d{4})/giu)) {
      const word = token[0].toLowerCase()
      if (word === "змінює") mode = "changes"
      else if (word === "доповнює") mode = "extends"
      else if (token[1] < number)
        (mode === "changes" ? changes : extendsRefs).add(token[1])
    }
  }
  for (const ref of changes) extendsRefs.delete(ref)
  return { extends: extendsRefs, changes }
}

/** Читає ADR з теки: номер, файл, назва, статус і рядки «Змінено». */
export function readAdrs(dir) {
  const problems = []
  const adrs = new Map()
  for (const file of readdirSync(dir).sort()) {
    const match = ADR_FILE.exec(file)
    if (!match) continue
    const number = match[1]
    const lines = readFileSync(path.join(dir, file), "utf8").split("\n")
    const title = new RegExp(`^# ${number}\\. (.+)$`).exec(lines[0] ?? "")?.[1]
    const status = statusText(lines)
    if (!title)
      problems.push(`${file}: перший рядок має бути «# ${number}. Назва»`)
    if (status === null) problems.push(`${file}: немає рядка «- Статус:»`)
    const base = BASE_STATUS.exec(status ?? "")?.[1]
    if (status !== null && !base)
      problems.push(
        `${file}: статус має починатися з «запропоновано», «прийнято» чи «замінено NNNN»`,
      )
    const changedBy = lines
      .map((line) => CHANGED_LINE.exec(line)?.[1])
      .filter(Boolean)
    adrs.set(number, {
      number,
      file,
      title: title ?? file,
      base: base ?? "прийнято",
      refs: statusRefs(number, status ?? ""),
      changedBy: new Set(changedBy),
    })
  }
  return { adrs, problems }
}

const sortedList = (set) => [...set].sort().join(", ")

/** Обчислений статус кожного ADR і порушення правила ADR-0080. */
export function computeStatuses(adrs) {
  const problems = []
  const extendedBy = new Map([...adrs.keys()].map((n) => [n, new Set()]))
  for (const adr of adrs.values()) {
    for (const ref of [...adr.refs.extends, ...adr.refs.changes]) {
      if (!adrs.has(ref)) {
        problems.push(`${adr.file}: статус називає ADR-${ref}, якого немає`)
        continue
      }
      extendedBy.get(ref).add(adr.number)
    }
    for (const ref of adr.refs.changes) {
      if (adrs.has(ref) && !adrs.get(ref).changedBy.has(adr.number))
        problems.push(
          `${adr.file}: статус змінює ADR-${ref}, а в ${adrs.get(ref).file} немає рядка «- Змінено: ADR-${adr.number} п. N — <що діє тепер>» (ADR-0080)`,
        )
    }
    for (const by of adr.changedBy) {
      if (!adrs.has(by))
        problems.push(
          `${adr.file}: рядок «Змінено» називає ADR-${by}, якого немає`,
        )
      else if (by <= adr.number)
        problems.push(
          `${adr.file}: рядок «Змінено» називає ADR-${by}, а змінити рішення може лише пізніший ADR`,
        )
    }
  }
  const statuses = new Map()
  for (const adr of adrs.values()) {
    const extended = [...extendedBy.get(adr.number)].filter(
      (n) => !adr.changedBy.has(n),
    )
    let status = adr.base
    if (extended.length) status += `; доповнено ${sortedList(extended)}`
    if (adr.changedBy.size) status += `; змінено ${sortedList(adr.changedBy)}`
    statuses.set(adr.number, status)
  }
  return { statuses, problems }
}

/** Ручні описи з наявного покажчика: номер → текст клітинки «Рішення». */
export function readDescriptions(indexText) {
  const descriptions = new Map()
  for (const line of indexText.split("\n")) {
    const number = INDEX_ROW.exec(line)?.[1]
    if (!number) continue
    const cells = line.split(CELL_SPLIT).map((cell) => cell.trim())
    descriptions.set(number, cells[2] ?? "")
  }
  return descriptions
}

/** Числа «змінено NNNN» у клітинці статусу покажчика. */
function indexChanged(indexText) {
  const changed = new Map()
  for (const line of indexText.split("\n")) {
    const number = INDEX_ROW.exec(line)?.[1]
    if (!number) continue
    const cell = line.split(CELL_SPLIT).at(-2) ?? ""
    const part = /змінено ([\d, ]+)/.exec(cell)?.[1] ?? ""
    changed.set(number, new Set(part.match(/\d{4}/g) ?? []))
  }
  return changed
}

/** Рядки «змінено» в покажчику й у файлах мають збігатися в обидва боки (ADR-0080). */
export function checkChangedMarks(adrs, indexText) {
  const problems = []
  for (const [number, inIndex] of indexChanged(indexText)) {
    const adr = adrs.get(number)
    if (!adr) continue
    for (const by of inIndex)
      if (!adr.changedBy.has(by))
        problems.push(
          `покажчик: у ADR-${number} «змінено ${by}», а в ${adr.file} немає рядка «- Змінено: ADR-${by}»`,
        )
    for (const by of adr.changedBy)
      if (!inIndex.has(by))
        problems.push(
          `покажчик: у ${adr.file} є рядок «- Змінено: ADR-${by}», а в статусі ADR-${number} немає «змінено ${by}»`,
        )
  }
  return problems
}

/** Новий текст покажчика: вступ і шаблон з наявного файла, таблиця — з ADR. */
export function buildIndex(indexText, adrs, statuses) {
  const descriptions = readDescriptions(indexText)
  const tableStart = indexText.indexOf(TABLE_HEADER)
  const templateStart = indexText.indexOf("\n## Шаблон")
  if (tableStart === -1 || templateStart === -1)
    throw new Error(
      "docs/adr/README.md: немає заголовка таблиці чи розділу «## Шаблон»",
    )
  const rows = [...adrs.values()].map((adr) => {
    const description = descriptions.get(adr.number) || adr.title
    return `| [${adr.number}](${adr.file}) | ${description} | ${statuses.get(adr.number)} |`
  })
  return `${indexText.slice(0, tableStart)}${TABLE_HEADER}\n${rows.join("\n")}\n${indexText.slice(templateStart)}`
}

/** Повна перевірка теки ADR; повертає порушення й очікуваний текст покажчика. */
export function checkAdrDir(dir) {
  const indexPath = path.join(dir, "README.md")
  const indexText = readFileSync(indexPath, "utf8")
  const { adrs, problems } = readAdrs(dir)
  const computed = computeStatuses(adrs)
  problems.push(...computed.problems, ...checkChangedMarks(adrs, indexText))
  const expected = buildIndex(indexText, adrs, computed.statuses)
  if (expected !== indexText)
    problems.push(
      "docs/adr/README.md застарів: запустіть pnpm adr-index і закомітьте покажчик",
    )
  return { problems, expected, indexPath }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const dir = path.join(root, "docs/adr")
  let result = checkAdrDir(dir)
  if (!process.argv.includes("--check")) {
    writeFileSync(result.indexPath, result.expected)
    result = checkAdrDir(dir)
  }
  for (const problem of result.problems) console.error(problem)
  if (result.problems.length) process.exit(1)
  console.log("Покажчик ADR актуальний")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
