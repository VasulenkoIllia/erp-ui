#!/usr/bin/env node
/**
 * Генерує registry.json (shadcn GitHub-реєстр) і docs/CATALOG.md з коду registry/ та registry/registry.config.mjs.
 *   node scripts/build-registry.mjs          — перезаписати обидва файли
 *   node scripts/build-registry.mjs --check  — перевірити, що вони актуальні (CI)
 *
 * Правила (ADR-0004):
 * - елемент із кодом = файл у registry/{ui,erp,templates,lib,hooks}; ім'я — `<тека>/<файл>` (ui/button);
 * - кожен елемент несе ВСІ потрібні йому файли реєстру (замикання імпортів @/registry/…), а не
 *   registryDependencies: так `add …#v0.3.0` ставить узгоджений набір з однієї версії;
 * - npm-залежності — з імпортів, версії — з registry/package.json; типи для пакетів без власних
 *   типів (TYPE_PACKAGES) і пакети для розробки (DEV_PACKAGES, напр. msw) — у devDependencies;
 * - метадані каталогу (назва, опис, статус, демо, SPEC) — у meta;
 * - модуль (шар 5, ADR-0025) — тека registry/modules/<ID>-<назва>/; ім'я — `modules/<ID>-<назва>`.
 *   Його файли копіюються в проект як є (`registry:file`, ціль `~/src/modules/<ID>-<назва>/…`),
 *   тож імпорти в них — шляхами проекту (`@/components/templates/…`, `@/lib/…`), а всередині
 *   модуля — відносні. Спільні файли, які він імпортує, їдуть із ним першими: shadcn шукає файл
 *   спільного шару за назвою, і `lib/mocks` має стояти перед `mocks.ts` модуля.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { registrySchema } from "shadcn/schema"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const REGISTRY_JSON = path.join(root, "registry.json")
const CATALOG_MD = path.join(root, "docs/CATALOG.md")
const ROUTER = path.join(root, "apps/demo/src/router.ts")

const { REPO, CODE_ITEMS, BUNDLE_ITEMS, MODULE_ITEMS } = await import(
  path.join(root, "registry/registry.config.mjs")
)
const MODULES_DIR = "registry/modules"
const pkg = JSON.parse(
  readFileSync(path.join(root, "registry/package.json"), "utf8"),
)
const versions = { ...pkg.dependencies, ...pkg.devDependencies }

/** Тека реєстру → тип файла shadcn і префікс цілі в проекті. */
const KINDS = {
  ui: { type: "registry:ui", target: "@ui" },
  lib: { type: "registry:lib", target: "@lib" },
  hooks: { type: "registry:hook", target: "@hooks" },
  erp: { type: "registry:component", target: "@components/erp" },
  templates: { type: "registry:component", target: "@components/templates" },
}
const PEERS = new Set(["react", "react-dom"])
/** Пакети без власних типів → пакет типів, який ставиться як devDependency. */
const TYPE_PACKAGES = {
  "google-libphonenumber": "@types/google-libphonenumber",
}
/** Пакети лише для розробки й тестів (моки): у devDependencies, не в збірку застосунку. */
const DEV_PACKAGES = new Set(["msw"])
const LAYER_TITLES = {
  base: "Основа",
  tokens: "Шар 1 · токени й теми",
  claude: "Правила для Claude Code",
  lib: "Утиліти",
  hooks: "Хуки",
  ui: "Шар 2 · примітиви",
  erp: "Шар 3 · ERP-компоненти",
  templates: "Шар 4 · шаблони сторінок",
  modules: "Шар 5 · модулі",
}
/** Шляхи проекту в імпортах модуля → шар реєстру (аліаси shadcn за замовчуванням). */
const PROJECT_PATHS = [
  ["@/components/ui/", "ui"],
  ["@/components/erp/", "erp"],
  ["@/components/templates/", "templates"],
  ["@/hooks/", "hooks"],
  ["@/lib/", "lib"],
]
/** Без цих файлів модуль у реєстр не приймається (SPEC §17, ADR-0020). */
const MODULE_FILES = [
  "contract.ts",
  "mocks.ts",
  "fixtures.ts",
  "index.ts",
  "README.md",
  "i18n/uk.json",
  "i18n/en.json",
]

function codeFiles() {
  const files = []
  for (const dir of Object.keys(KINDS)) {
    const abs = path.join(root, "registry", dir)
    if (!existsSync(abs)) continue
    for (const f of readdirSync(abs).sort()) {
      if (/\.(test|spec)\./.test(f) || !/\.(ts|tsx)$/.test(f)) continue
      files.push({
        name: `${dir}/${f.replace(/\.tsx?$/, "")}`,
        dir,
        file: `registry/${dir}/${f}`,
      })
    }
  }
  return files
}

/** Файли модуля (шляхи від теки модуля), без тестів. */
function moduleFiles(dir) {
  const files = []
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(root, MODULES_DIR, dir, rel), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(next)
      else if (!/\.(test|spec)\./.test(entry.name)) files.push(next)
    }
  }
  walk("")
  return files
}

function moduleDirs() {
  const abs = path.join(root, MODULES_DIR)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function importsOf(file) {
  const src = readFileSync(path.join(root, file), "utf8")
  // І статичні імпорти, і динамічні `import("…")` (мова за запитом у lib/i18n): файл має їхати з елементом.
  return [
    ...src.matchAll(
      /(?:from|import)\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].map((m) => m[1] ?? m[2])
}

/** Ім'я npm-пакета з шляху імпорту: @base-ui/react/dialog → @base-ui/react, cn/config → cn. */
function packageName(spec) {
  const parts = spec.split("/")
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

function dependency(name) {
  const range = versions[name]
  if (!range)
    throw new Error(
      `Пакет ${name} використовується в реєстрі, але не вказаний у registry/package.json`,
    )
  return `${name}@${range}`
}

function build() {
  const files = codeFiles()
  const byName = new Map(files.map((f) => [f.name, f]))
  const problems = []

  for (const f of files)
    if (!CODE_ITEMS[f.name])
      problems.push(`Немає опису для ${f.name} у registry/registry.config.mjs`)
  for (const name of Object.keys(CODE_ITEMS))
    if (!byName.has(name)) problems.push(`Опис ${name} є, а файлу немає`)
  // shadcn CLI переписує імпорти за назвою файлу: lib/x і erp/x в одному пакунку плутаються
  // (імпорт lib/x стає @/components/erp/x). Назви файлів у різних шарах мають бути різними.
  const byBase = new Map()
  for (const f of files) {
    const base = f.name.split("/").at(-1)
    const other = byBase.get(base)
    if (other)
      problems.push(
        `${f.file}: та сама назва файлу, що й ${other.file} — shadcn CLI їх переплутає; перейменуйте один`,
      )
    else byBase.set(base, f)
  }
  problems.push(...sharedImportProblems(files))
  problems.push(...useClientProblems(files.map((f) => f.file)))
  // shadcn CLI переписує шлях у `export … from "@/registry/lib/x"` і в `import("@/registry/lib/x")`
  // на `@/components/x` — ламає збірку в проекті.
  for (const f of files) {
    const src = readFileSync(path.join(root, f.file), "utf8")
    if (/^export\s[^;]*?\sfrom\s+["']@\/registry\//m.test(src))
      problems.push(
        `${f.file}: реекспорт \`export … from "@/registry/…"\` — замініть на import + export`,
      )
    if (/import\(\s*["']@\/registry\//.test(src))
      problems.push(
        `${f.file}: динамічний \`import("@/registry/…")\` — у межах шару пишіть \`import("./файл")\` (файли шару лягають в одну теку проекту)`,
      )
  }

  /** Замикання внутрішніх імпортів + зовнішні пакети. */
  function closure(start) {
    const seen = new Set()
    const packages = new Set()
    const stack = [start]
    while (stack.length) {
      const name = stack.pop()
      if (seen.has(name)) continue
      seen.add(name)
      const entry = byName.get(name)
      if (!entry) {
        problems.push(`Імпорт @/registry/${name} не знайдено`)
        continue
      }
      for (const spec of importsOf(entry.file)) {
        if (spec.startsWith("@/registry/"))
          stack.push(spec.slice("@/registry/".length))
        // Відносний шлях — лише в межах шару (динамічний import, див. перевірку вище).
        else if (/^\.\/[\w-]+$/.test(spec))
          stack.push(`${entry.dir}/${spec.slice(2)}`)
        else if (spec.startsWith("."))
          problems.push(
            `${entry.file}: імпорт «${spec}» — поза шаром лише через @/registry/<шар>/<файл>`,
          )
        else if (!spec.startsWith("@/")) {
          const pkgName = packageName(spec)
          if (!PEERS.has(pkgName)) packages.add(pkgName)
        }
      }
    }
    return {
      // Ненайдені імпорти вже в `problems` — без них, щоб дійти до звіту, а не впасти.
      names: [
        start,
        ...[...seen].filter((n) => n !== start && byName.has(n)).sort(),
      ],
      packages,
    }
  }

  const fileEntry = (name) => {
    const { dir, file } = byName.get(name)
    return {
      path: file,
      type: KINDS[dir].type,
      target: `${KINDS[dir].target}/${path.basename(file)}`,
    }
  }

  /** dependencies елемента: усе, крім пакетів для розробки. */
  const dependencies = (packages) =>
    [...packages]
      .filter((name) => !DEV_PACKAGES.has(name))
      .sort()
      .map(dependency)

  /** devDependencies елемента: пакети типів і пакети для розробки. */
  const devDependencies = (packages) => {
    const dev = [
      ...[...packages].map((name) => TYPE_PACKAGES[name]).filter(Boolean),
      ...[...packages].filter((name) => DEV_PACKAGES.has(name)),
    ].sort()
    return dev.length ? { devDependencies: dev.map(dependency) } : {}
  }

  const meta = (layer, cfg) => ({
    layer,
    status: cfg.status,
    ...(cfg.demo ? { demo: cfg.demo } : {}),
    ...(cfg.spec ? { spec: cfg.spec } : {}),
  })

  const items = []
  for (const [name, cfg] of Object.entries(BUNDLE_ITEMS)) {
    const included = (cfg.include ?? []).map(closure)
    const names = [...new Set(included.flatMap((c) => c.names))]
    const packages = new Set([
      ...(cfg.dependencies ?? []),
      ...included.flatMap((c) => [...c.packages]),
    ])
    for (const f of cfg.files) {
      // docs/CATALOG.md генерує цей самий скрипт.
      if (
        f.path !== "docs/CATALOG.md" &&
        !existsSync(path.join(root, f.path))
      ) {
        problems.push(`${name}: файлу ${f.path} немає`)
      }
    }
    items.push({
      name,
      type: "registry:item",
      title: cfg.title,
      description: cfg.description,
      dependencies: dependencies(packages),
      ...devDependencies(packages),
      files: [
        ...cfg.files.map((f) => ({
          path: f.path,
          type: "registry:file",
          target: f.target,
        })),
        ...names.map(fileEntry),
      ],
      ...(cfg.docs ? { docs: cfg.docs } : {}),
      meta: meta(name, cfg),
    })
  }
  items.push(
    ...moduleItems({
      problems,
      closure,
      fileEntry,
      dependencies,
      devDependencies,
      meta,
    }),
  )
  for (const f of files) {
    const cfg = CODE_ITEMS[f.name]
    if (!cfg) continue
    const { names, packages } = closure(f.name)
    items.push({
      name: f.name,
      type: KINDS[f.dir].type,
      title: cfg.title,
      description: cfg.description,
      dependencies: dependencies(packages),
      ...devDependencies(packages),
      files: names.map(fileEntry),
      meta: meta(f.dir, cfg),
    })
  }

  // Сторінки демо, на які посилаються елементи, мусять існувати.
  const routes = new Set(
    [...readFileSync(ROUTER, "utf8").matchAll(/^\s+(\w+):\s*"#?\//gm)].map(
      (m) => m[1],
    ),
  )
  for (const it of items) {
    if (it.meta.demo && !routes.has(it.meta.demo)) {
      problems.push(
        `${it.name}: сторінки демо «${it.meta.demo}» немає в apps/demo/src/router.ts`,
      )
    }
  }

  // Скіл для роботи в самому репозиторії — копія скіла, що ставиться в проекти.
  const skill = "registry/claude/skills/erp-ui/SKILL.md"
  const localSkill = ".claude/skills/erp-ui/SKILL.md"
  if (
    readFileSync(path.join(root, skill), "utf8") !==
    readFileSync(path.join(root, localSkill), "utf8")
  ) {
    problems.push(
      `${localSkill} розійшовся з ${skill}: правте ${skill} і скопіюйте`,
    )
  }

  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "erp-ui",
    homepage: `https://github.com/${REPO}`,
    items,
  }
  const parsed = registrySchema.safeParse(registry)
  if (!parsed.success)
    problems.push(
      `registry.json не проходить схему shadcn: ${JSON.stringify(parsed.error.issues)}`,
    )

  return { registry, catalog: catalog(items), problems }
}

// Директива на початку файлу, зокрема після коментарів (блочний коментар без лінивого `*?`:
// лінійно навіть на сотнях коментарів поспіль).
const USE_CLIENT =
  /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*(?:[^*]|\*(?!\/))*\*\/)*["']use client["'](?=\s*(?:;|\r?\n|\/[/*]|$))/

/**
 * Без директиви "use client": у Vite вона нічого не робить, а CLI shadcn 4.22.0 при `"rsc": false`
 * прибирає її лише з частини файлів, тож оновлення проекту дає зміни, яких у кіті немає.
 */
function useClientProblems(files) {
  return files
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        USE_CLIENT.test(readFileSync(path.join(root, file), "utf8")),
    )
    .map(
      (file) =>
        `${file}: директива "use client" — приберіть (у Vite вона нічого не робить, а CLI shadcn прибирає її лише з частини файлів)`,
    )
}

/** Спільний шар не знає модулів і проекту: файл реєстру з таким імпортом зламав би кожен модуль. */
function sharedImportProblems(files) {
  const problems = []
  for (const f of files)
    for (const spec of importsOf(f.file))
      if (
        spec.startsWith("@/registry/modules/") ||
        (spec.startsWith("@/") && !spec.startsWith("@/registry/"))
      )
        problems.push(
          `${f.file}: імпорт «${spec}» — спільний шар імпортує лише @/registry/<шар>/<файл>`,
        )
  return problems
}

/**
 * Модулі (ADR-0025): файли модуля — як є, з ціллю в `src/modules/<тека>/`; спільні файли з
 * замикання імпортів — першими. Перевіряє опис, обов'язкові файли, точку входу й імпорти.
 */
function moduleItems({
  problems,
  closure,
  fileEntry,
  dependencies,
  devDependencies,
  meta,
}) {
  const dirs = moduleDirs()
  problems.push(...moduleConfigProblems(dirs))
  const items = []
  for (const dir of dirs) {
    const name = `modules/${dir}`
    const cfg = MODULE_ITEMS[name]
    if (!cfg) continue
    const base = `${MODULES_DIR}/${dir}`
    const files = moduleFiles(dir)
    problems.push(...moduleEntryProblems(base, files))
    problems.push(...useClientProblems(files.map((rel) => `${base}/${rel}`)))
    const { shared, packages } = moduleImports(base, files, problems)
    const included = [...new Set(shared)].sort().map(closure)
    const names = [...new Set(included.flatMap((c) => c.names))].sort()
    for (const c of included)
      for (const pkgName of c.packages) packages.add(pkgName)
    for (const peer of PEERS) packages.delete(peer)
    items.push({
      name,
      type: "registry:item",
      title: cfg.title,
      description: cfg.description,
      dependencies: dependencies(packages),
      ...devDependencies(packages),
      files: [
        ...names.map(fileEntry),
        ...files.map((rel) => ({
          path: `${base}/${rel}`,
          type: "registry:file",
          target: `~/src/modules/${dir}/${rel}`,
        })),
      ],
      ...(cfg.docs ? { docs: cfg.docs } : {}),
      meta: meta("modules", cfg),
    })
  }
  return items
}

/** Теки модулів і описи в `MODULE_ITEMS` — одне до одного. */
function moduleConfigProblems(dirs) {
  const problems = []
  for (const dir of dirs)
    if (!MODULE_ITEMS[`modules/${dir}`])
      problems.push(
        `Немає опису для modules/${dir} у registry/registry.config.mjs`,
      )
  for (const name of Object.keys(MODULE_ITEMS))
    if (!dirs.includes(name.replace(/^modules\//, "")))
      problems.push(
        `Опис ${name} є, а теки ${MODULES_DIR}/${name.slice(8)} немає`,
      )
  return problems
}

/** Файли SPEC §17 і точка входу: фабрика `create<Модуль>Module` і тип `<Модуль>Extension`. */
function moduleEntryProblems(base, files) {
  const problems = []
  for (const required of MODULE_FILES)
    if (!files.includes(required))
      problems.push(`${base}: немає ${required} (SPEC §17)`)
  const index = path.join(root, base, "index.ts")
  if (!existsSync(index)) return problems
  const src = readFileSync(index, "utf8")
  const factory = /export function create(\w+)Module\(/.exec(src)
  if (!factory) {
    problems.push(
      `${base}/index.ts: немає фабрики create<Модуль>Module (ADR-0020, п. 3)`,
    )
    return problems
  }
  // Тип розширення — того самого модуля, що й фабрика: `createContactsModule` → `ContactsExtension`.
  const extension = `${factory[1]}Extension`
  const exported = new RegExp(
    `export (type|interface) ${extension}\\b|export type \\{[^}]*\\b${extension}\\b`,
  )
  if (!exported.test(src))
    problems.push(
      `${base}/index.ts: немає типу розширення ${extension} (ADR-0020, п. 3)`,
    )
  return problems
}

/**
 * Імпорти файлів модуля: свої — відносно й лише всередині модуля; кіт — шляхами проекту
 * (`PROJECT_PATHS`) → спільні файли для замикання; решта — npm-пакети.
 */
function moduleImports(base, files, problems) {
  const shared = []
  const packages = new Set()
  for (const rel of files.filter((f) => /\.(ts|tsx)$/.test(f)))
    for (const spec of importsOf(`${base}/${rel}`)) {
      const where = `${base}/${rel}`
      if (spec.startsWith(".")) {
        if (!isOwnModuleFile(rel, spec, files))
          problems.push(
            `${where}: відносний імпорт «${spec}» — лише файли цього модуля`,
          )
      } else if (spec.startsWith("@/")) {
        const layer = sharedLayerOf(spec)
        if (layer) shared.push(layer)
        else problems.push(`${where}: ${moduleImportProblem(spec)}`)
      } else packages.add(packageName(spec))
    }
  return { shared, packages }
}

function isOwnModuleFile(rel, spec, files) {
  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(rel), spec),
  )
  return (
    !target.startsWith("..") &&
    ["", ".ts", ".tsx", "/index.ts"].some((ext) =>
      files.includes(`${target}${ext}`),
    )
  )
}

/** `@/components/ui/button` → `ui/button`; не файл кіта першого рівня — `null`. */
function sharedLayerOf(spec) {
  if (spec.startsWith("@/registry/")) return null
  const match = PROJECT_PATHS.find(([prefix]) => spec.startsWith(prefix))
  if (!match || spec.slice(match[0].length).includes("/")) return null
  return `${match[1]}/${spec.slice(match[0].length)}`
}

function moduleImportProblem(spec) {
  return spec.startsWith("@/registry/")
    ? `імпорт «${spec}» — у модулі шляхи проекту (@/components/…, @/lib/…), файли модуля копіюються як є`
    : `імпорт «${spec}» — модуль імпортує лише кіт (@/components/{ui,erp,templates}/…, @/lib/…, @/hooks/…) і свої файли (ADR-0020, п. 3)`
}

function catalog(items) {
  const rows = (layer) =>
    items
      .filter(
        (it) =>
          it.meta.layer === layer ||
          (layer === it.name && it.type === "registry:item"),
      )
      .map((it) => {
        const spec = it.meta.spec?.join(", ") ?? "—"
        const demo = it.meta.demo ? `\`${it.meta.demo}\`` : "—"
        return `| \`${it.name}\` | ${it.title} | ${it.description} | ${it.meta.status} | ${demo} | ${spec} |`
      })
  const sections = [
    "base",
    "tokens",
    "claude",
    "lib",
    "hooks",
    "ui",
    "erp",
    "templates",
    "modules",
  ]
    .map((layer) => {
      const r = rows(layer)
      if (r.length === 0) return ""
      return [
        `## ${LAYER_TITLES[layer]}`,
        "",
        "| Елемент | Назва | Що це | Статус | Демо | SPEC |",
        "|---|---|---|---|---|---|",
        ...r,
        "",
      ].join("\n")
    })
    .filter(Boolean)
  return [
    "# Каталог erp-ui",
    "",
    "> Генерується з `registry/registry.config.mjs` скриптом `pnpm registry` — руками не правити.",
    "",
    `Елементів: ${items.length}. Встановлення в проект: \`npx shadcn@latest add ${REPO}/<елемент>\` (версія — \`#vX.Y.Z\`). Як підключити кіт — \`docs/using-erp-ui.md\`.`,
    "",
    "Статуси: **draft** — у роботі; **beta** — є в демо й тестах, API може змінитися; **stable** — підтверджено стрес-сторінкою.",
    "",
    ...sections,
  ].join("\n")
}

function main() {
  const { registry, catalog: md, problems } = build()
  if (problems.length) {
    for (const p of problems) console.error(`ПОМИЛКА: ${p}`)
    process.exit(1)
  }
  const json = JSON.stringify(registry, null, 2) + "\n"
  if (process.argv.includes("--check")) {
    const stale = []
    if (
      !existsSync(REGISTRY_JSON) ||
      readFileSync(REGISTRY_JSON, "utf8") !== json
    )
      stale.push("registry.json")
    if (!existsSync(CATALOG_MD) || readFileSync(CATALOG_MD, "utf8") !== md)
      stale.push("docs/CATALOG.md")
    if (stale.length) {
      console.error(
        `${stale.join(" і ")} застаріли. Запустіть \`pnpm registry\` і закомітьте результат.`,
      )
      process.exit(1)
    }
    console.log(`Реєстр: ${registry.items.length} елементів, актуальний`)
    return
  }
  writeFileSync(REGISTRY_JSON, json)
  writeFileSync(CATALOG_MD, md)
  console.log(
    `Записано registry.json і docs/CATALOG.md (${registry.items.length} елементів)`,
  )
}

main()
