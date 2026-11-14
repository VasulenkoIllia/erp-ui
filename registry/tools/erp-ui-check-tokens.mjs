#!/usr/bin/env node
/**
 * «Лише токени» (SPEC §19, правило 2): сирі кольори й довільні розміри, що оминають теми й шкалу Tailwind.
 *   - hex-кольори (#fff, #1a2b3c);
 *   - колірні функції (rgb(), hsl(), oklch() …);
 *   - стандартну палітру Tailwind (bg-red-500, text-white …) — у темах кіта її вимкнено, клас нічого не дасть;
 *   - довільні значення розмірів у класах (p-[13px], rounded-[10px], text-[15px]);
 *   - рух поза токенами (ADR-0009): transition-all, duration-200, ease-linear тощо.
 * Виняток для окремого рядка: коментар `erp-ui: allow-raw-value — <причина>`.
 *
 * У проекті: `node scripts/erp-ui-check-tokens.mjs [теки…]` (за замовчуванням `src`), у lint проекту (ADR-0089).
 * Файл ставить команда кіта разом із `base`: у проекті його не правте.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
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
    message: "колірна функція — використовуйте токен теми",
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
  {
    id: "motion",
    message:
      "рух поза токенами — duration-fast|base|slow, ease-standard|enter|exit; замість transition-all — конкретні властивості",
    pattern:
      /(?<![\w-])(?:[\w-]+:)*(?:transition-all|duration-(?:\d+|\[[^\]\s]+\])|ease-(?:linear|in|out|in-out|\[[^\]\s]+\]))(?![\w-])/g,
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

const DEFAULT_ROOTS = ["src"]
/**
 * Палітри тем генерує кіт із власних кольорів (`design/generate-themes.mjs`): там сирі кольори — джерело токенів.
 * Шлях — кінець відносного шляху файла, бо тека `src` у монорепо буває глибше.
 */
const GENERATED_SUFFIXES = ["styles/erp-ui/themes.css"]
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"])
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
])

/**
 * Файли теки. Помилку читання не ковтає: тека, яку не прочитано, — не перевірена. Символьне посилання
 * проходить як те, на що вказує; тека, у якій уже були (цикл посилань), — один раз.
 */
function* walk(dir, visited = new Set()) {
  const real = realpathSync(dir)
  if (visited.has(real)) return
  visited.add(real)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const kind = entry.isSymbolicLink() ? statSync(full) : entry
    if (kind.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full, visited)
    } else if (
      kind.isFile() &&
      EXTENSIONS.has(path.extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      yield full
    }
  }
}

const isGenerated = (relative) =>
  GENERATED_SUFFIXES.some(
    (suffix) => relative === suffix || relative.endsWith(`/${suffix}`),
  )

/** Теки, яких немає чи які не є теками: перевірка без них нічого б не перевірила. */
export function missingRoots(cwd, roots) {
  return roots.filter((root) => {
    if (!root.trim()) return true
    try {
      return !statSync(path.resolve(cwd, root)).isDirectory()
    } catch {
      return true
    }
  })
}

/** Порушення в теках `roots` відносно `cwd`; згенеровані палітри пропускає, файл (і через посилання) — один раз. */
export function scanRoots(cwd, roots) {
  const found = []
  const seen = new Set()
  for (const root of roots) {
    for (const file of walk(path.resolve(cwd, root))) {
      const relative = path.relative(cwd, file).split(path.sep).join("/")
      const real = realpathSync(file)
      if (seen.has(real) || isGenerated(relative)) continue
      seen.add(real)
      for (const v of findViolations(readFileSync(file, "utf8")))
        found.push({ file: relative, ...v })
    }
  }
  return { found, files: seen.size }
}

function main() {
  const args = process.argv.slice(2)
  const roots = args.length ? args : DEFAULT_ROOTS
  const cwd = process.cwd()
  const missing = missingRoots(cwd, roots)
  if (missing.length) {
    console.error(
      `check-tokens: немає теки ${missing.map((root) => `«${root}»`).join(", ")} — назвіть теки коду аргументами`,
    )
    process.exit(1)
  }
  const { found, files } = scanRoots(cwd, roots)
  if (files === 0) {
    console.error(
      `check-tokens: у ${roots.join(", ")} немає файлів .ts, .tsx, .js, .jsx, .css — нічого не перевірено`,
    )
    process.exit(1)
  }
  for (const v of found)
    console.error(`${v.file}:${v.line}  ${v.rule}  «${v.match}» — ${v.message}`)
  if (found.length > 0) {
    console.error(
      `\ncheck-tokens: знайдено порушень — ${found.length}. Виняток для рядка: коментар «${ALLOW_MARK} — <причина>».`,
    )
    process.exit(1)
  }
  console.log(`check-tokens: порушень немає (файлів — ${files})`)
}

// `import.meta.main` — Node ≥ 24.2; на старішій порівняння шляхів, щоб перевірка не вийшла мовчки з кодом 0.
const isMain =
  import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) main()
