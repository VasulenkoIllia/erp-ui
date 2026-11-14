#!/usr/bin/env node
/**
 * Покажчик ADR (`docs/adr/README.md`) зі статусів самих файлів рішень.
 *
 * Стовпець «Статус» будується з файлів: перше слово рядка «- Статус:», «доповнено» — пізніші ADR, чий
 * рядок статусу називає це рішення, «змінено» — рядки «- Змінено: ADR-NNNN» у шапці файла (ADR-0080).
 * Опис рішення лишається ручним; новий ADR отримує опис із назви файла.
 *
 *   node scripts/adr-index.mjs           переписує покажчик
 *   node scripts/adr-index.mjs --check   лише перевіряє (частина `pnpm check:docs`)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ADR_FILE = /^(\d{4})-[a-z0-9-]+\.md$/
const NUMBERED_FILE = /^\d{4}/
const BASE_STATUS = /^(запропоновано|прийнято|замінено (\d{4}))/
/** Поле шапки ADR: «- Дата:», «- Хто ухвалив:» … */
const FIELD_LINE = /^- [^:\n]{1,40}:/
const CHANGED_LINE = /^- Змінено: ADR-(\d{4})/
/**
 * Дужки, слова «змінює» і «доповнює» та посилання на ADR у рядку статусу.
 * `\p{L}` замість `\b`: межа слова в JS не бачить кирилиці.
 */
const STATUS_TOKEN =
  /[()]|(?<!\p{L})(?:змінюють|змінює|доповнюють|доповнює)(?!\p{L})|ADR-(\d{4})/giu
const INDEX_ROW = /^\| \[(\d{4})\]\(/
const TABLE_HEADER = "| № | Рішення | Статус |\n|---|---|---|"
const CELL_SPLIT = /(?<!\\)\|/

const readText = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n")

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
 * Посилання статусу на ADR. Після «змінює» посилання — зміни, після «доповнює» чи без слова — доповнення;
 * дужки зберігають слово, що діяло до них («змінює ADR-0004 (п. 8) і ADR-0020» — обидва зміни).
 * `forward` — «змінює» пізніше чи це саме рішення: так не буває, це помилка в номері.
 */
export function statusRefs(number, text) {
  const extendsRefs = new Set()
  const changes = new Set()
  const forward = new Set()
  const outer = []
  let mode = "extends"
  for (const token of text.matchAll(STATUS_TOKEN)) {
    const word = token[0].toLowerCase()
    if (word === "(") outer.push(mode)
    else if (word === ")") mode = outer.pop() ?? "extends"
    else if (word.startsWith("змін")) mode = "changes"
    else if (word.startsWith("доповн")) mode = "extends"
    else if (token[1] < number)
      (mode === "changes" ? changes : extendsRefs).add(token[1])
    else if (mode === "changes") forward.add(token[1])
  }
  for (const ref of changes) extendsRefs.delete(ref)
  return { extends: extendsRefs, changes, forward }
}

/** Один файл ADR: назва, статус і рядки «Змінено» з шапки (до першого розділу `##`). */
function readAdr(dir, file, number, problems) {
  const lines = readText(path.join(dir, file)).split("\n")
  const bodyStart = lines.findIndex((line) => line.startsWith("## "))
  const header = bodyStart === -1 ? lines : lines.slice(0, bodyStart)
  const title = new RegExp(`^# ${number}\\. (.+)$`).exec(lines[0] ?? "")?.[1]
  const status = statusText(header)
  if (!title)
    problems.push(`${file}: перший рядок має бути «# ${number}. Назва»`)
  if (status === null) problems.push(`${file}: немає рядка «- Статус:»`)
  const base = BASE_STATUS.exec(status ?? "")
  if (status !== null && !base)
    problems.push(
      `${file}: статус має починатися з «запропоновано», «прийнято» чи «замінено NNNN»`,
    )
  const changedBy = header
    .map((line) => CHANGED_LINE.exec(line)?.[1])
    .filter(Boolean)
  return {
    number,
    file,
    title: title ?? file,
    base: base?.[1] ?? "прийнято",
    replacedBy: base?.[2],
    refs: statusRefs(number, status ?? ""),
    changedBy: new Set(changedBy),
  }
}

/** Читає ADR з теки; файл із номером не за шаблоном чи повтор номера — помилка, а не пропуск. */
function readAdrs(dir) {
  const problems = []
  const adrs = new Map()
  for (const file of readdirSync(dir).sort()) {
    const match = ADR_FILE.exec(file)
    if (!match) {
      if (NUMBERED_FILE.test(file))
        problems.push(
          `${file}: назва файла ADR — «NNNN-назва-латиницею.md» (малі літери, цифри, дефіс)`,
        )
      continue
    }
    const number = match[1]
    if (adrs.has(number)) {
      problems.push(
        `${file}: номер ${number} уже має ${adrs.get(number).file} — дайте новому ADR наступний вільний номер`,
      )
      continue
    }
    adrs.set(number, readAdr(dir, file, number, problems))
  }
  return { adrs, problems }
}

const sortedList = (set) => [...set].sort().join(", ")

/** Порушення правила ADR-0080 і посилання на ADR, яких немає. */
function relationProblems(adrs) {
  const problems = []
  for (const adr of adrs.values()) {
    for (const ref of [...adr.refs.extends, ...adr.refs.changes])
      if (!adrs.has(ref))
        problems.push(`${adr.file}: статус називає ADR-${ref}, якого немає`)
    for (const ref of adr.refs.forward)
      problems.push(
        `${adr.file}: статус змінює ADR-${ref}, а змінити можна лише раннє рішення — перевірте номер`,
      )
    for (const ref of adr.refs.changes)
      if (adrs.has(ref) && !adrs.get(ref).changedBy.has(adr.number))
        problems.push(
          `${adr.file}: статус змінює ADR-${ref}, а в ${adrs.get(ref).file} немає рядка «- Змінено: ADR-${adr.number} п. N — <що діє тепер>» (ADR-0080)`,
        )
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
    if (
      adr.replacedBy &&
      (!adrs.has(adr.replacedBy) || adr.replacedBy <= adr.number)
    )
      problems.push(
        `${adr.file}: «замінено ${adr.replacedBy}» — замінити може лише наявний пізніший ADR`,
      )
  }
  return problems
}

/** Обчислений статус кожного ADR і порушення правила ADR-0080. */
function computeStatuses(adrs) {
  const extendedBy = new Map([...adrs.keys()].map((n) => [n, new Set()]))
  for (const adr of adrs.values())
    for (const ref of [...adr.refs.extends, ...adr.refs.changes])
      extendedBy.get(ref)?.add(adr.number)
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
  return { statuses, problems: relationProblems(adrs) }
}

/** Рядки таблиці покажчика: номер → клітинки. */
function indexRows(indexText) {
  const rows = new Map()
  for (const line of indexText.split("\n")) {
    const number = INDEX_ROW.exec(line)?.[1]
    if (number)
      rows.set(
        number,
        line.split(CELL_SPLIT).map((c) => c.trim()),
      )
  }
  return rows
}

/** Рядки «змінено» в покажчику й у файлах мають збігатися в обидва боки (ADR-0080). */
function checkChangedMarks(adrs, indexText) {
  const problems = []
  for (const [number, cells] of indexRows(indexText)) {
    const adr = adrs.get(number)
    if (!adr) continue
    const part = /змінено ([\d, ]+)/.exec(cells.at(-2) ?? "")?.[1] ?? ""
    const inIndex = new Set(part.match(/\d{4}/g) ?? [])
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

/** Новий текст покажчика: замінюється лише таблиця, текст до й після неї лишається. */
function buildIndex(indexText, adrs, statuses) {
  const rows = indexRows(indexText)
  const tableStart = indexText.indexOf(TABLE_HEADER)
  if (tableStart === -1)
    throw new Error(
      `покажчик ADR: немає заголовка таблиці «${TABLE_HEADER.split("\n")[0]}»`,
    )
  const bodyStart = tableStart + TABLE_HEADER.length + 1
  const rest = indexText.slice(bodyStart).split("\n")
  const tableEnd = rest.findIndex((line) => !line.startsWith("|"))
  const after = tableEnd === -1 ? "" : rest.slice(tableEnd).join("\n")
  const table = [...adrs.values()].map((adr) => {
    const description =
      rows.get(adr.number)?.[2] || adr.title.replaceAll("|", "\\|")
    return `| [${adr.number}](${adr.file}) | ${description} | ${statuses.get(adr.number)} |`
  })
  return `${indexText.slice(0, bodyStart)}${table.join("\n")}\n${after}`
}

/** Повна перевірка теки ADR; повертає порушення й очікуваний текст покажчика. */
export function checkAdrDir(dir) {
  const indexPath = path.join(dir, "README.md")
  const indexText = readText(indexPath)
  const { adrs, problems } = readAdrs(dir)
  const computed = computeStatuses(adrs)
  problems.push(...computed.problems, ...checkChangedMarks(adrs, indexText))
  const expected = buildIndex(indexText, adrs, computed.statuses)
  if (expected !== indexText)
    problems.push(
      `${path.relative(process.cwd(), indexPath)} застарів: запустіть pnpm adr-index і закомітьте покажчик`,
    )
  return { problems, expected, indexPath, isStale: expected !== indexText }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const dir = path.join(root, "docs/adr")
  let result = checkAdrDir(dir)
  if (!process.argv.includes("--check") && result.isStale) {
    writeFileSync(result.indexPath, result.expected)
    console.log(`Записано ${path.relative(process.cwd(), result.indexPath)}`)
    result = checkAdrDir(dir)
  }
  for (const problem of result.problems) console.error(problem)
  if (result.problems.length) process.exit(1)
  console.log("Покажчик ADR актуальний")
}

if (import.meta.main) main()
