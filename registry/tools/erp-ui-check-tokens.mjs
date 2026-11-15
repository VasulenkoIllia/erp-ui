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
 * У проекті: `node scripts/erp-ui-check-tokens.mjs [теки…]` у lint проекту (ADR-0089). Без аргументів — найближча
 * `src` над файлом `tailwind.css` з `components.json` (без неї — тека файла), без нього `src` (ADR-0096).
 * Файл ставить команда кіта разом із `base`: у проекті його не правте.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs"
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

const FALLBACK_ROOT = "src"
const SHADCN_CONFIG = "components.json"

const errorText = (error) =>
  error instanceof Error ? error.message : String(error)

/** `components.json`: помилку читання й зламаний JSON не ковтаємо, BOM (файл з Windows) прибираємо. */
function readShadcnConfig(file) {
  let text
  try {
    text = readFileSync(file, "utf8")
  } catch (error) {
    throw new Error(
      `${SHADCN_CONFIG} не читається (${errorText(error)}) — назвіть теки коду аргументами`,
      { cause: error },
    )
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""))
  } catch (error) {
    throw new Error(
      `${SHADCN_CONFIG} — не JSON (${errorText(error)}): виправте файл або назвіть теки коду аргументами`,
      { cause: error },
    )
  }
}

const isOutside = (dir) =>
  dir === ".." ||
  dir.startsWith("../") ||
  path.posix.isAbsolute(dir) ||
  /^[A-Za-z]:/.test(dir)

/**
 * Тека за замовчуванням і звідки вона (ADR-0096 п. 2): найближча `src` над файлом стилів `tailwind.css` з
 * `components.json`, а без неї — тека самого файла (так і в підпакеті робочого простору); без файла — `src`. Файл стилів у корені проекту —
 * теж `src`: корінь цілком зачепив би скрипти й конфіги. Зламаний `components.json` і тека стилів поза
 * проектом (спільний пакет стилів у монорепо) — помилка: мовчки перевірили б не той код.
 */
export function defaultRoots(cwd) {
  const file = path.join(cwd, SHADCN_CONFIG)
  if (!existsSync(file))
    return { roots: [FALLBACK_ROOT], source: `без ${SHADCN_CONFIG}` }
  const css = readShadcnConfig(file)?.tailwind?.css
  if (typeof css !== "string" || !css.trim())
    return {
      roots: [FALLBACK_ROOT],
      source: `у ${SHADCN_CONFIG} немає tailwind.css`,
    }
  // Шлях у components.json — зі скісною рискою; зворотну (файл правили руками на Windows) теж приймаємо.
  const dir = path.posix.dirname(
    path.posix.normalize(css.trim().replaceAll("\\", "/")),
  )
  if (isOutside(dir))
    throw new Error(
      `тека стилів «${dir}» з ${SHADCN_CONFIG} поза проектом — назвіть теки коду аргументами`,
    )
  if (dir === ".")
    return { roots: [FALLBACK_ROOT], source: "файл стилів у корені проекту" }
  // Стилі буває глибше за код (`src/styles/globals.css`, `src/app/globals.css`): тоді — найближча `src` над ними.
  const parts = dir.split("/")
  const srcAt = parts.lastIndexOf(FALLBACK_ROOT)
  return srcAt >= 0
    ? {
        roots: [parts.slice(0, srcAt + 1).join("/")],
        source: `тека src над tailwind.css з ${SHADCN_CONFIG}`,
      }
    : { roots: [dir], source: `тека tailwind.css з ${SHADCN_CONFIG}` }
}
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

function rootsOrExit(cwd, args) {
  if (args.length) return { roots: args, source: "аргументи" }
  try {
    return defaultRoots(cwd)
  } catch (error) {
    console.error(`check-tokens: ${errorText(error)}`)
    process.exit(1)
  }
}

function main() {
  const cwd = process.cwd()
  const { roots, source } = rootsOrExit(cwd, process.argv.slice(2))
  const missing = missingRoots(cwd, roots)
  if (missing.length) {
    console.error(
      `check-tokens: немає теки ${missing.map((root) => `«${root}»`).join(", ")} (${source}) — назвіть теки коду аргументами`,
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
  console.log(
    `check-tokens: порушень немає (теки: ${roots.join(", ")} — ${source}; файлів — ${String(files)})`,
  )
}

// `import.meta.main` — Node ≥ 24.2; на старішій порівняння шляхів, щоб перевірка не вийшла мовчки з кодом 0.
const isMain =
  import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) main()
