/**
 * Чистий шар контрактів (ADR-0093): схеми, правила й типи без React, i18next і ra-core, які бере й сервер
 * на TypeScript. Файл шару імпортує лише `zod` і файли шару, зокрема типами й динамічно: тоді весь шар
 * компілюється й виконується без пакетів інтерфейсу. Перелік — `CONTRACT_LAYER` у
 * registry/registry.config.mjs; перевірку запускає `pnpm check:registry`, той самий перелік бере ESLint.
 */
import path from "node:path"

/** Пакети, які файл шару може імпортувати. */
export const CONTRACT_PACKAGES = new Set(["zod"])

/** Шляхи, якими файл шару бере інший файл утиліт: у `registry/lib` — `@/registry/lib`, у модулі — `@/lib`. */
const LIB_PREFIXES = ["@/registry/lib/", "@/lib/"]

/**
 * Файли шару з переліку: `registry/lib/<ім'я>.ts`; у кожному модулі (`moduleDirs`) — `contract.ts`,
 * `resources.ts`, якщо він є (`exists`), і файли правил із `layer.modules`.
 */
export function contractLayerFiles(layer, moduleDirs, exists) {
  const files = layer.lib.map((name) => `registry/lib/${name}.ts`)
  for (const dir of moduleDirs) {
    const base = `registry/modules/${dir}`
    files.push(`${base}/contract.ts`)
    if (exists(`${base}/resources.ts`)) files.push(`${base}/resources.ts`)
  }
  for (const [dir, names] of Object.entries(layer.modules))
    for (const name of names) files.push(`registry/modules/${dir}/${name}.ts`)
  return files
}

/**
 * Усі шляхи імпорту в тексті файла: статичні, типи, реекспорти й динамічні `import("…")` (і в коментарях).
 * Спільне з генератором реєстру: файл має їхати з елементом, а чистий шар не тягне нічого навіть типом.
 */
export function importSpecifiers(text) {
  return [
    ...text.matchAll(
      /(?:from|import)\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].map((m) => m[1] ?? m[2])
}

/** Ім'я npm-пакета з шляху імпорту: @base-ui/react/dialog → @base-ui/react, cn/config → cn. */
export function packageName(spec) {
  const parts = spec.split("/")
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

/** Шлях імпорту → файл реєстру (`registry/…/x.ts`); не файл утиліт і не сусід у модулі — `null`. */
function resolveImport(spec, file) {
  const prefix = LIB_PREFIXES.find((p) => spec.startsWith(p))
  if (prefix) return `registry/lib/${spec.slice(prefix.length)}.ts`
  if (spec.startsWith("./"))
    return `${path.posix.dirname(file)}/${spec.slice(2)}.ts`
  return null
}

/**
 * Порушення шару: файла з переліку немає; імпорт пакета, крім `zod`; імпорт компонента, хука чи файла
 * поза переліком. Для файла поза шаром, у якого є чиста частина `<ім'я>-core`, — підказка.
 */
export function contractLayerProblems(files, read, exists) {
  const layer = new Set(files)
  const problems = []
  for (const file of files) {
    if (!exists(file)) {
      problems.push(`${file}: файл чистого шару з CONTRACT_LAYER не знайдено`)
      continue
    }
    for (const spec of importSpecifiers(read(file))) {
      if (!spec.startsWith("@/") && !spec.startsWith(".")) {
        const pkg = packageName(spec)
        if (!CONTRACT_PACKAGES.has(pkg))
          problems.push(
            `${file}: пакет «${pkg}» — у чистому шарі лише zod (ADR-0093)`,
          )
        continue
      }
      const target = resolveImport(spec, file)
      if (target && layer.has(target)) continue
      const core = target?.replace(/\.ts$/, "-core.ts")
      const hint =
        core && layer.has(core)
          ? `; чиста частина — «${spec}-core»`
          : target
            ? "; файл без React — у CONTRACT_LAYER (registry/registry.config.mjs)"
            : ""
      problems.push(
        `${file}: імпорт «${spec}» — поза чистим шаром (ADR-0093)${hint}`,
      )
    }
  }
  return problems
}

/** Розділ каталогу: що з кіта бере сервер на TypeScript. */
export function contractLayerSection(layer) {
  const lib = layer.lib.map((name) => `\`lib/${name}\``).join(", ")
  const rules = Object.entries(layer.modules)
    .map(
      ([dir, names]) =>
        `\`${dir}\` — ${names.map((n) => `\`${n}.ts\``).join(", ")}`,
    )
    .join("; ")
  return [
    "## Чистий шар контрактів",
    "",
    "Схеми, правила й типи без React, i18next і ra-core (ADR-0093): їх бере й сервер на TypeScript, з єдиною залежністю `zod`. Файли шару імпортують лише `zod` і одне одного, зокрема типами. Як підключити на сервері — `docs/using-erp-ui.md`, «Сервер на TypeScript».",
    "",
    `- Утиліти: ${lib}.`,
    "- У кожному модулі: `contract.ts` і `resources.ts`.",
    `- Правила модулів: ${rules}.`,
    "",
  ].join("\n")
}
