#!/usr/bin/env node
/**
 * «Лише токени» (CLAUDE.md, правило 4; SPEC §19, правило 2).
 * Шукає в коді кіта сирі кольори й довільні розміри, що оминають теми й шкалу Tailwind:
 *   - hex-кольори (#fff, #1a2b3c);
 *   - колірні функції (rgb(), hsl(), oklch() …) поза design/;
 *   - стандартну палітру Tailwind (bg-red-500, text-white …) — у демо її вимкнено, клас нічого не дасть;
 *   - довільні значення розмірів у класах (p-[13px], rounded-[10px], text-[15px]).
 * Виняток для окремого рядка: коментар `erp-ui: allow-raw-value — <причина>`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ALLOW_MARK = "erp-ui: allow-raw-value"

const TAILWIND_COLORS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white"
const COLOR_UTILITIES =
  "bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow|inset-shadow"
const SIZE_UTILITIES =
  "p[trblxy]?|m[trblxy]?|gap(?:-[xy])?|space-[xy]|rounded(?:-[a-z]{1,2})?|text|leading|tracking|size|[hw]|min-[hw]|max-[hw]|inset(?:-[xy])?|top|right|bottom|left|border(?:-[trblxy])?"

export const RULES = [
  {
    id: "hex-color",
    message: "сирий hex-колір — використовуйте токен теми",
    pattern:
      /(?<![\w&/-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi,
  },
  {
    id: "color-function",
    message: "колірна функція поза design/ — використовуйте токен теми",
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/gi,
  },
  {
    id: "tailwind-palette",
    message:
      "стандартна палітра Tailwind вимкнена — використовуйте токени (bg-primary, text-muted-foreground …)",
    pattern: new RegExp(
      `(?<![\\w-])(?:[\\w-]+:)*(?:${COLOR_UTILITIES})-(?:${TAILWIND_COLORS})(?:-\\d{2,3})?(?:\\/\\d+)?(?![\\w-])`,
      "g",
    ),
  },
  {
    id: "arbitrary-size",
    message:
      "довільний розмір поза шкалою — використовуйте шкалу Tailwind або токени щільності",
    pattern: new RegExp(
      `(?<![\\w-])-?(?:${SIZE_UTILITIES})-\\[(?!var\\()[^\\]\\s]*\\d(?:px|rem|em)[^\\]\\s]*\\]`,
      "g",
    ),
  },
]

/** Повертає порушення в тексті одного файла. */
export function findViolations(text) {
  const violations = []
  text.split("\n").forEach((line, index) => {
    if (line.includes(ALLOW_MARK)) return
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) {
        violations.push({
          line: index + 1,
          rule: rule.id,
          message: rule.message,
          match: match[0],
        })
      }
    }
  })
  return violations
}

const ROOTS = ["apps", "registry"]
const EXTENSIONS = new Set([".ts", ".tsx", ".css"])
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
])

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full)
    } else if (EXTENSIONS.has(path.extname(name)) && !name.endsWith(".d.ts")) {
      yield full
    }
  }
}

function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  )
  let total = 0
  for (const root of ROOTS) {
    for (const file of walk(path.join(repoRoot, root))) {
      for (const v of findViolations(readFileSync(file, "utf8"))) {
        total++
        console.error(
          `${path.relative(repoRoot, file)}:${v.line}  ${v.rule}  «${v.match}» — ${v.message}`,
        )
      }
    }
  }
  if (total > 0) {
    console.error(
      `\ncheck-tokens: ${total} порушень. Виняток для рядка: коментар «${ALLOW_MARK} — <причина>».`,
    )
    process.exit(1)
  }
  console.log("check-tokens: порушень немає")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
