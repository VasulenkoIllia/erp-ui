#!/usr/bin/env node
/**
 * Перевірка документів (`pnpm check:docs`, частина `pnpm lint`, ADR-0089):
 *   - покажчик ADR актуальний, рядки «Змінено» збігаються з ним в обидва боки (`scripts/adr-index.mjs`, ADR-0080);
 *   - скіл: ядро `SKILL.md` і кожна довідка `references/<тема>.md` у межах розміру, таблиця ядра називає кожну
 *     довідку, названі довідки існують, а реєстр ставить у проект кожен файл скіла за його шляхом;
 *   - назви в лапках `…` у скілі й блоці `CLAUDE.project.md` є в коді кіта (без коментарів): компоненти,
 *     хуки, фабрики й інші назви з великою літерою всередині — у `registry/`, елементи (`erp/…`, `lib/…`) —
 *     у реєстрі. Перевіряється перша назва відрізка: `useFormat()` і `<DataTable columns={…} />` теж.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { checkAdrDir } from "./adr-index.mjs"

export const SKILL_DIR = "registry/claude/skills/erp-ui"
const PROJECT_BLOCK = "registry/claude/CLAUDE.project.md"
const REGISTRY_CONFIG = "registry/registry.config.mjs"
/** Ядро читається на кожній задачі з інтерфейсом у кожному проекті: межа в байтах UTF-8. */
export const SKILL_CORE_MAX_BYTES = 8 * 1024
/** Довідку агент відкриває за темою задачі. */
export const SKILL_REFERENCE_MAX_BYTES = 12 * 1024
const REFERENCE_FILE = /^[a-z0-9-]+\.md$/
const REFERENCE_LINK = /(?<![\w/.-])references\/[\w.-]+\.md/g
const CODE_SPAN = /`([^`\n]+)`/g
const ITEM_SPAN = /^(ui|erp|templates|lib|hooks|tools|modules)\/[a-z0-9][\w-]*$/
const LEADING_NAME = /^<?([A-Za-z_$][\w$]*)(?![\w$])/
/**
 * Назва, яку варто звіряти з кодом: з великої літери (не все великими: `PATCH`, `README` — не назви коду),
 * `use…`, `create…` чи інша з великою літерою всередині.
 */
const CHECKED_NAME =
  /^(?:[A-Z](?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]*|[a-z]+[A-Z][\w$]*)$/
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs"])
const SKIP_DIRS = new Set(["node_modules", "dist"])
/**
 * Назви з лапок, яких у коді кіта немає навмисно (напр. API чужої бібліотеки, яку скіл забороняє брати).
 * Нове сюди — лише з причиною в коментарі.
 */
const KNOWN_NAMES = new Set([
  "useRoutes", // react-router: маршрути модуля проект підключає своїм роутером
])

const bytes = (text) => Buffer.byteLength(text, "utf8")

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full)
    } else if (entry.isFile()) yield full
  }
}

/** Файли скіла: ядро й довідки; будь-що інше в `references/` — помилка, а не пропуск. */
function skillFiles(root) {
  const dir = path.join(root, SKILL_DIR)
  const referencesDir = path.join(dir, "references")
  const references = []
  const strays = []
  if (existsSync(referencesDir))
    for (const entry of readdirSync(referencesDir, {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isFile() && REFERENCE_FILE.test(entry.name))
        references.push(`references/${entry.name}`)
      else strays.push(`references/${entry.name}`)
    }
  return { dir, references, strays }
}

/** Межі розміру й зв'язки ядра з довідками. */
export function skillProblems(root) {
  const problems = []
  const { dir, references, strays } = skillFiles(root)
  for (const stray of strays)
    problems.push(
      `${SKILL_DIR}/${stray}: у references/ лише файли «<тема>.md» (малі літери, цифри, дефіс)`,
    )
  const core = readFileSync(path.join(dir, "SKILL.md"), "utf8")
  if (bytes(core) > SKILL_CORE_MAX_BYTES)
    problems.push(
      `${SKILL_DIR}/SKILL.md: ${String(bytes(core))} Б, межа ядра ${String(SKILL_CORE_MAX_BYTES)} Б — нове правило теми йде в довідку`,
    )
  const tableRows = core.split("\n").filter((line) => line.startsWith("|"))
  const named = new Set(tableRows.join("\n").match(REFERENCE_LINK) ?? [])
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

/** Кожен файл скіла ставиться в проект за своїм шляхом: він є в елементах `claude` і `base` реєстру. */
export function shippedProblems(root) {
  const { references } = skillFiles(root)
  const registry = JSON.parse(
    readFileSync(path.join(root, "registry.json"), "utf8"),
  )
  const problems = []
  for (const itemName of ["claude", "base"]) {
    const item = registry.items.find((candidate) => candidate.name === itemName)
    const targets = new Map(item?.files.map((f) => [f.path, f.target]) ?? [])
    for (const file of ["SKILL.md", ...references]) {
      const source = `${SKILL_DIR}/${file}`
      const target = `~/.claude/skills/erp-ui/${file}`
      if (!targets.has(source))
        problems.push(
          `registry.json: елемент «${itemName}» не ставить ${source} — додайте довідку в SKILL_REFERENCES (${REGISTRY_CONFIG}) і запустіть pnpm registry`,
        )
      else if (targets.get(source) !== target)
        problems.push(
          `registry.json: елемент «${itemName}» ставить ${source} у ${String(targets.get(source))}, а має в ${target}`,
        )
    }
  }
  return problems
}

/**
 * Код без коментарів: назва, що лишилась лише в коментарі, вже не є назвою кіта. Рядки в лапках лишаються як є,
 * тож скісна із зірочкою чи дві скісні в рядку (тип MIME, адреса) не стають коментарем.
 */
export function withoutComments(text) {
  const parts = []
  let start = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === "/" && (next === "/" || next === "*")) {
      parts.push(text.slice(start, i), " ")
      const close = next === "/" ? "\n" : "*/"
      const end = text.indexOf(close, i + 2)
      i = end === -1 ? text.length : next === "/" ? end : end + 2
      start = i
    } else if (ch === '"' || ch === "'" || ch === "`") {
      i++
      while (i < text.length && text[i] !== ch) {
        if (ch !== "`" && text[i] === "\n") break
        i += text[i] === "\\" ? 2 : 1
      }
      i++
    } else i++
  }
  parts.push(text.slice(start))
  return parts.join("")
}

/** Слова коду кіта (без коментарів і опису реєстру) й назви елементів реєстру. */
function kitNames(root) {
  const words = new Set()
  const config = path.join(root, REGISTRY_CONFIG)
  for (const file of walk(path.join(root, "registry"))) {
    if (!CODE_EXTENSIONS.has(path.extname(file)) || file === config) continue
    const code = withoutComments(readFileSync(file, "utf8"))
    for (const word of code.match(/[A-Za-z_$][\w$]*/g) ?? []) words.add(word)
  }
  const registry = JSON.parse(
    readFileSync(path.join(root, "registry.json"), "utf8"),
  )
  const items = new Set(registry.items.map((item) => item.name))
  return { words, items }
}

/** Чи є елемент реєстру чи файл кіта під такою назвою (`lib/format`, `hooks/use-wizard`, тека модуля). */
function itemExists(root, items, span) {
  if (items.has(span)) return true
  const base = path.join(root, "registry", span)
  if ([".ts", ".tsx", ".mjs"].some((ext) => existsSync(`${base}${ext}`)))
    return true
  return existsSync(base) && statSync(base).isDirectory()
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
    const name = LEADING_NAME.exec(trimmed)?.[1]
    if (
      name &&
      CHECKED_NAME.test(name) &&
      !KNOWN_NAMES.has(name) &&
      !words.has(name)
    )
      unknown.add(name)
  }
  return [...unknown]
}

function identifierProblems(root) {
  const names = kitNames(root)
  const { references } = skillFiles(root)
  const files = [
    `${SKILL_DIR}/SKILL.md`,
    ...references.map((file) => `${SKILL_DIR}/${file}`),
    PROJECT_BLOCK,
  ]
  const problems = []
  for (const file of files) {
    const text = readFileSync(path.join(root, file), "utf8")
    for (const name of unknownNames(text, root, names))
      problems.push(
        `${file}: «${name}» немає в коді кіта — виправте назву чи додайте її в KNOWN_NAMES з причиною`,
      )
  }
  return problems
}

/** Кожна перевірка окремо: виняток однієї стає рядком звіту, решта все одно проходять. */
function runCheck(name, check) {
  try {
    return check()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return [`${name}: перевірка впала — ${reason}`]
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const problems = [
    ...runCheck(
      "покажчик ADR",
      () => checkAdrDir(path.join(root, "docs/adr")).problems,
    ),
    ...runCheck("скіл", () => skillProblems(root)),
    ...runCheck("файли скіла в реєстрі", () => shippedProblems(root)),
    ...runCheck("назви в скілі", () => identifierProblems(root)),
  ]
  for (const problem of problems) console.error(problem)
  if (problems.length) {
    console.error(`\ncheck:docs: розбіжностей — ${String(problems.length)}`)
    process.exit(1)
  }
  console.log("check:docs: покажчик ADR, позначки «Змінено» й скіл актуальні")
}

if (import.meta.main) main()
