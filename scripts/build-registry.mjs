#!/usr/bin/env node
/**
 * Генерує registry.json (shadcn GitHub-реєстр) і docs/CATALOG.md з коду registry/ та registry/registry.config.mjs.
 *   node scripts/build-registry.mjs          — перезаписати обидва файли
 *   node scripts/build-registry.mjs --check  — перевірити, що вони актуальні (CI)
 *
 * Правила (ADR-0004):
 * - елемент із кодом = файл у registry/{ui,lib,hooks}; ім'я — `<тека>/<файл>` (ui/button);
 * - кожен елемент несе ВСІ потрібні йому файли реєстру (замикання імпортів @/registry/…), а не
 *   registryDependencies: так `add …#v0.3.0` ставить узгоджений набір з однієї версії;
 * - npm-залежності — з імпортів, версії — з registry/package.json;
 * - метадані каталогу (назва, опис, статус, демо, SPEC) — у meta.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { registrySchema } from "shadcn/schema"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const REGISTRY_JSON = path.join(root, "registry.json")
const CATALOG_MD = path.join(root, "docs/CATALOG.md")
const ROUTER = path.join(root, "apps/demo/src/router.ts")

const { REPO, CODE_ITEMS, BUNDLE_ITEMS } = await import(
  path.join(root, "registry/registry.config.mjs")
)
const pkg = JSON.parse(
  readFileSync(path.join(root, "registry/package.json"), "utf8"),
)
const versions = { ...pkg.dependencies, ...pkg.devDependencies }

/** Тека реєстру → тип файла shadcn і префікс цілі в проекті. */
const KINDS = {
  ui: { type: "registry:ui", target: "@ui" },
  lib: { type: "registry:lib", target: "@lib" },
  hooks: { type: "registry:hook", target: "@hooks" },
}
const PEERS = new Set(["react", "react-dom"])
const LAYER_TITLES = {
  base: "Основа",
  tokens: "Шар 1 · токени й теми",
  claude: "Правила для Claude Code",
  lib: "Утиліти",
  hooks: "Хуки",
  ui: "Шар 2 · примітиви",
}

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

function importsOf(file) {
  const src = readFileSync(path.join(root, file), "utf8")
  return [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map(
    (m) => m[1],
  )
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
        else if (!spec.startsWith(".") && !spec.startsWith("@/")) {
          const pkgName = packageName(spec)
          if (!PEERS.has(pkgName)) packages.add(pkgName)
        }
      }
    }
    return {
      names: [start, ...[...seen].filter((n) => n !== start).sort()],
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
      dependencies: [...packages].sort().map(dependency),
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
  for (const f of files) {
    const cfg = CODE_ITEMS[f.name]
    if (!cfg) continue
    const { names, packages } = closure(f.name)
    items.push({
      name: f.name,
      type: KINDS[f.dir].type,
      title: cfg.title,
      description: cfg.description,
      dependencies: [...packages].sort().map(dependency),
      files: names.map(fileEntry),
      meta: meta(f.dir, cfg),
    })
  }

  // Сторінки демо, на які посилаються елементи, мусять існувати.
  const routes = new Set(
    [...readFileSync(ROUTER, "utf8").matchAll(/^\s+(\w+):\s*"#\//gm)].map(
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
  const sections = ["base", "tokens", "claude", "lib", "hooks", "ui"]
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
