#!/usr/bin/env node
/**
 * Перевірка документів (`pnpm check:docs`, частина `pnpm lint`, ADR-0089):
 *   - покажчик ADR актуальний, рядки «Змінено» збігаються з ним в обидва боки (`scripts/adr-index.mjs`, ADR-0080);
 *   - скіл: ядро `SKILL.md` і кожна довідка `references/*.md` у межах розміру, ядро називає кожну довідку,
 *     названі довідки існують, а реєстр ставить у проект кожен файл скіла;
 *   - назви в лапках `…` у скілі є в коді кіта: компоненти, хуки й фабрики — у `registry/`, елементи
 *     (`erp/…`, `lib/…`) — у реєстрі.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { checkAdrDir } from "./adr-index.mjs"

export const SKILL_DIR = "registry/claude/skills/erp-ui"
/** Ядро читається на кожній задачі з інтерфейсом у кожному проекті: межа в байтах UTF-8. */
export const SKILL_CORE_MAX_BYTES = 8 * 1024
/** Довідку агент відкриває за темою задачі. */
export const SKILL_REFERENCE_MAX_BYTES = 12 * 1024
const REFERENCE_LINK = /references\/[\w.-]+\.md/g
const CODE_SPAN = /`([^`\n]+)`/g
const ITEM_SPAN = /^(ui|erp|templates|lib|hooks|tools|modules)\/[\w.-]+$/
const COMPONENT_SPAN = /^<?([A-Z][A-Za-z0-9]+)(?:\s*\/>|>)?$/
const FUNCTION_SPAN = /^((?:use|create)[A-Z][A-Za-z0-9]*)(?:\(\))?$/
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs"])
const SKIP_DIRS = new Set(["node_modules", "dist"])
/**
 * Назви з лапок, яких у коді кіта немає навмисно (напр. API чужої бібліотеки, яку скіл забороняє брати).
 * Нове сюди — лише з причиною в коментарі.
 */
const KNOWN_NAMES = new Set()

const bytes = (text) => Buffer.byteLength(text, "utf8")

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full)
    } else yield full
  }
}

/** Файли скіла: ядро й довідки. */
export function skillFiles(root) {
  const dir = path.join(root, SKILL_DIR)
  const referencesDir = path.join(dir, "references")
  const references = existsSync(referencesDir)
    ? readdirSync(referencesDir)
        .filter((name) => name.endsWith(".md"))
        .sort()
        .map((name) => `references/${name}`)
    : []
  return { dir, references }
}

/** Межі розміру й зв'язки ядра з довідками. */
export function skillProblems(root) {
  const problems = []
  const { dir, references } = skillFiles(root)
  const core = readFileSync(path.join(dir, "SKILL.md"), "utf8")
  if (bytes(core) > SKILL_CORE_MAX_BYTES)
    problems.push(
      `${SKILL_DIR}/SKILL.md: ${String(bytes(core))} Б, межа ядра ${String(SKILL_CORE_MAX_BYTES)} Б — нове правило теми йде в довідку`,
    )
  const named = new Set(core.match(REFERENCE_LINK) ?? [])
  for (const reference of references) {
    const text = readFileSync(path.join(dir, reference), "utf8")
    if (bytes(text) > SKILL_REFERENCE_MAX_BYTES)
      problems.push(
        `${SKILL_DIR}/${reference}: ${String(bytes(text))} Б, межа довідки ${String(SKILL_REFERENCE_MAX_BYTES)} Б — поділіть тему`,
      )
    if (!named.has(reference))
      problems.push(
        `${SKILL_DIR}/SKILL.md: таблиця «Що робиш, що прочитати» не називає ${reference}`,
      )
  }
  for (const file of ["SKILL.md", ...references]) {
    const text = readFileSync(path.join(dir, file), "utf8")
    for (const link of new Set(text.match(REFERENCE_LINK) ?? []))
      if (!references.includes(link))
        problems.push(`${SKILL_DIR}/${file}: довідки ${link} немає`)
  }
  return problems
}

/** Кожен файл скіла ставиться в проект: він є в елементах `claude` і `base` реєстру. */
export function shippedProblems(root) {
  const { references } = skillFiles(root)
  const registry = JSON.parse(
    readFileSync(path.join(root, "registry.json"), "utf8"),
  )
  const problems = []
  for (const itemName of ["claude", "base"]) {
    const item = registry.items.find((candidate) => candidate.name === itemName)
    const shipped = new Set(item?.files.map((file) => file.path) ?? [])
    for (const file of ["SKILL.md", ...references])
      if (!shipped.has(`${SKILL_DIR}/${file}`))
        problems.push(
          `registry.json: елемент «${itemName}» не ставить ${SKILL_DIR}/${file} — додайте довідку в SKILL_REFERENCES (registry/registry.config.mjs) і запустіть pnpm registry`,
        )
  }
  return problems
}

/** Слова коду кіта й назви елементів реєстру. */
export function kitNames(root) {
  const words = new Set()
  for (const file of walk(path.join(root, "registry"))) {
    if (!CODE_EXTENSIONS.has(path.extname(file))) continue
    for (const word of readFileSync(file, "utf8").match(/[A-Za-z_$][\w$]*/g) ??
      [])
      words.add(word)
  }
  const registry = JSON.parse(
    readFileSync(path.join(root, "registry.json"), "utf8"),
  )
  const items = new Set(registry.items.map((item) => item.name))
  return { words, items }
}

/** Чи є елемент реєстру чи файл кіта під такою назвою (`lib/format`, `hooks/use-wizard`). */
function itemExists(root, items, span) {
  if (items.has(span)) return true
  const base = path.join(root, "registry", span)
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`].some((candidate) =>
    existsSync(candidate),
  )
}

/** Назви з лапок у тексті, яких немає в коді кіта. */
export function unknownNames(text, root, { words, items }) {
  const unknown = new Set()
  for (const [, span] of text.matchAll(CODE_SPAN)) {
    const trimmed = span.trim()
    if (ITEM_SPAN.test(trimmed)) {
      if (!itemExists(root, items, trimmed)) unknown.add(trimmed)
      continue
    }
    const name =
      COMPONENT_SPAN.exec(trimmed)?.[1] ?? FUNCTION_SPAN.exec(trimmed)?.[1]
    if (name && !KNOWN_NAMES.has(name) && !words.has(name)) unknown.add(name)
  }
  return [...unknown]
}

export function identifierProblems(root) {
  const names = kitNames(root)
  const { dir, references } = skillFiles(root)
  const problems = []
  for (const file of ["SKILL.md", ...references]) {
    const text = readFileSync(path.join(dir, file), "utf8")
    for (const name of unknownNames(text, root, names))
      problems.push(
        `${SKILL_DIR}/${file}: «${name}» немає в коді кіта — виправте назву чи додайте її в KNOWN_NAMES з причиною`,
      )
  }
  return problems
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const problems = [
    ...checkAdrDir(path.join(root, "docs/adr")).problems,
    ...skillProblems(root),
    ...shippedProblems(root),
    ...identifierProblems(root),
  ]
  for (const problem of problems) console.error(problem)
  if (problems.length) {
    console.error(`\ncheck:docs: ${String(problems.length)} розбіжностей`)
    process.exit(1)
  }
  console.log("check:docs: покажчик ADR, позначки «Змінено» й скіл актуальні")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
