#!/usr/bin/env node
/**
 * Копії коду між модулями (ADR-0086): модулі не імпортують один одного (ADR-0070), тож спільне для двох
 * модулів лежить у спільному шарі кіта, а не копіюється. Перевірка валить `pnpm lint`, щойно однаковий
 * шматок від `WINDOW` значущих рядків з'являється у двох різних модулях `registry/modules/<модуль>`.
 *
 * Значущий рядок — без відступів; порожні, коментарі, імпорти й рядки лише з дужок не рахуються: так
 * перевірка ловить скопійовану логіку й розмітку, а не однаковий набір імпортів. Копії всередині одного
 * модуля — його справа. Виняток — лише записаний нижче (`ALLOWED`) з причиною.
 *
 *   node scripts/check-module-copies.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** Скільки значущих рядків поспіль — уже копія. */
export const WINDOW = 10

/**
 * Дозволені копії: пара файлів (шляхи від кореня) і чому код не може жити в кіті. Порожньо: нова копія
 * спершу переїжджає в спільний шар.
 *
 * @type {readonly { readonly files: readonly [string, string]; readonly reason: string }[]}
 */
export const ALLOWED = []

const SOURCE = /\.(ts|tsx)$/
const BRACKETS_ONLY = /^[()[\]{}<>/;,]*$/

/** Значущі рядки файлу з номерами (від 1): без коментарів, імпортів і рядків лише з дужок. */
export function significantLines(text) {
  const lines = []
  let inImport = false
  let inComment = false
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim()
    if (inComment) {
      if (line.includes("*/")) inComment = false
      return
    }
    if (inImport) {
      if (/\bfrom\s+["']/.test(line) || /^["'].*["'];?$/.test(line))
        inImport = false
      return
    }
    if (line.startsWith("/*")) {
      inComment = !line.includes("*/")
      return
    }
    if (line.startsWith("import ")) {
      inImport = !/\bfrom\s+["']|^import\s+["']/.test(line)
      return
    }
    if (line === "" || line.startsWith("//") || BRACKETS_ONLY.test(line)) return
    lines.push({ text: line, line: index + 1 })
  })
  return lines
}

/**
 * Копії між модулями: для кожної пари файлів з різних модулів — номери рядків, що входять в однакові
 * шматки від `window` значущих рядків. `files` — `{ module, file, text }`.
 */
export function findModuleCopies(files, window = WINDOW) {
  /** @type {Map<string, { module: string; file: string; from: number; to: number }[]>} */
  const chunks = new Map()
  for (const { module, file, text } of files) {
    const lines = significantLines(text)
    for (let start = 0; start + window <= lines.length; start++) {
      const key = lines
        .slice(start, start + window)
        .map((item) => item.text)
        .join("\n")
      const seen = chunks.get(key) ?? []
      seen.push({
        module,
        file,
        from: lines[start].line,
        to: lines[start + window - 1].line,
      })
      chunks.set(key, seen)
    }
  }
  /** @type {Map<string, { files: [string, string]; lines: [Set<number>, Set<number>] }>} */
  const pairs = new Map()
  for (const places of chunks.values())
    for (const a of places)
      for (const b of places) {
        if (a.module === b.module || a.file >= b.file) continue
        const id = `${a.file}\n${b.file}`
        const pair = pairs.get(id) ?? {
          files: [a.file, b.file],
          lines: [new Set(), new Set()],
        }
        for (let n = a.from; n <= a.to; n++) pair.lines[0].add(n)
        for (let n = b.from; n <= b.to; n++) pair.lines[1].add(n)
        pairs.set(id, pair)
      }
  return [...pairs.values()].map(({ files: [a, b], lines: [inA, inB] }) => ({
    files: [a, b],
    ranges: [ranges(inA), ranges(inB)],
  }))
}

/** Номери рядків відрізками: `12-20, 31-40`. */
function ranges(lines) {
  const sorted = [...lines].sort((x, y) => x - y)
  const parts = []
  let from = sorted[0]
  let to = from
  for (const n of sorted.slice(1)) {
    if (n === to + 1) {
      to = n
      continue
    }
    parts.push(from === to ? `${from}` : `${from}-${to}`)
    from = n
    to = n
  }
  if (from !== undefined) parts.push(from === to ? `${from}` : `${from}-${to}`)
  return parts.join(", ")
}

/** Копії без дозволених: пара з `allowed` у будь-якому порядку файлів. */
export function unexpectedCopies(copies, allowed = ALLOWED) {
  const isAllowed = ({ files: [a, b] }) =>
    allowed.some(
      ({ files: [x, y] }) => (a === x && b === y) || (a === y && b === x),
    )
  return copies.filter((copy) => !isAllowed(copy))
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return SOURCE.test(name) ? [full] : []
  })
}

function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  )
  const modulesDir = path.join(repoRoot, "registry/modules")
  const files = readdirSync(modulesDir)
    .filter((module) => statSync(path.join(modulesDir, module)).isDirectory())
    .flatMap((module) =>
      sourceFiles(path.join(modulesDir, module)).map((full) => ({
        module,
        file: path.relative(repoRoot, full),
        text: readFileSync(full, "utf8"),
      })),
    )
  const copies = unexpectedCopies(findModuleCopies(files))
  if (copies.length === 0) {
    console.log(
      `check-module-copies: копій між модулями немає (${files.length} файлів, шматок від ${WINDOW} рядків)`,
    )
    return
  }
  console.error(
    `check-module-copies: однаковий код у різних модулях (від ${WINDOW} значущих рядків). Спільне — у кіт (ADR-0086):`,
  )
  for (const {
    files: [a, b],
    ranges: [inA, inB],
  } of copies)
    console.error(`  ${a}: ${inA}\n  ${b}: ${inB}\n`)
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
