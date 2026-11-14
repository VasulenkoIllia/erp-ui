#!/usr/bin/env node
/**
 * Сценарій оновлення (ADR-0088): проект на попередньому тегу кіта з розширенням модуля й адаптером
 * оновлюється командою кіта до цього коміту, і проект компілюється й збирається.
 *
 *   node scripts/upgrade-smoke.mjs [--from-tag vX.Y.Z] [--keep]
 *
 * Проект тегу (за замовчуванням — найновіший `vX.Y.Z`): шаблон тестового проекту тегу, адаптер
 * (`tests/consumer/upgrade`), `base` тегу як у посібнику, решта кіта командою тегу (`--from` цієї
 * копії, без GitHub). З нього два шляхи до `HEAD`: (1) стара команда проекту, сироти — зі звіту;
 * (2) команда цієї версії з тимчасової теки: «Що зробити в проекті» у звіті, ті самі сироти в
 * маніфесті, попередження `check`, `--prune`, зупинка на позначці локальної правки. Після кожного —
 * typecheck і збірка з файлами проекту тегу, потім із файлами за шаблоном цієї версії, і `check`.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { KIT_PATHS, mustRun, run } from "../registry/tools/erp-ui-kit-lib.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const keep = args.includes("--keep")
const fromTag = args.includes("--from-tag")
  ? args[args.indexOf("--from-tag") + 1]
  : undefined

/** Пакунки, які ставить проект (як у `consumer-smoke`); решта — елементи шарів і модулі. */
const BUNDLES = ["base", "data", "mocks", "auth", "lib/query-client"]
const TEMPLATE = "tests/consumer/template"
const AFTER_INSTALL = "tests/consumer/after-install.json"
/** Файли проекту з шаблону, які проект змінює сам за «Що зробити в проекті». */
const PROJECT_CONFIG = [
  "vite.config.ts",
  "index.html",
  "src/main.tsx",
  "src/vite-env.d.ts",
]
const MANIFEST = "kit-files.json"
const COMMAND = "scripts/erp-ui-kit.mjs"
const MARKED_FILE = "src/components/ui/button.tsx"
const MARKER = ["erp-ui", "local override"].join(": ")
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/
const ORPHAN_LINE = /^\s+\? (\S+) — у новій версії/gm
/** git без налаштувань машини: CI без імені автора, у людини — підпис комітів. */
const GIT_IDENTITY = [
  "-c",
  "user.name=erp-ui-upgrade-smoke",
  "-c",
  "user.email=upgrade-smoke@example.com",
  "-c",
  "commit.gpgsign=false",
]

const temp = mkdtempSync(path.join(tmpdir(), "erp-ui-upgrade-"))

function expect(condition, message) {
  if (!condition) throw new Error(`Сценарій оновлення: ${message}`)
}

const git = async (cwd, ...gitArgs) =>
  (await mustRun("git", [...GIT_IDENTITY, ...gitArgs], { cwd, capture: true }))
    .stdout

const commitAll = async (dir, message) => {
  await git(dir, "add", "-A")
  await git(dir, "commit", "-qm", message)
}

/** Файл кіта на тегу; немає — `undefined`. */
async function fileAt(tag, file) {
  const result = await run("git", ["show", `${tag}:${file}`], {
    cwd: root,
    capture: true,
  })
  return result.code === 0 ? result.stdout : undefined
}

/** Найновіший тег випуску (за версією), якщо не задано `--from-tag`. */
async function previousTag() {
  if (fromTag) return fromTag
  const tags = await git(root, "tag", "--list", "v*", "--sort=-v:refname")
  const tag = tags.split("\n").find((name) => RELEASE_TAG.test(name))
  expect(tag, "у копії немає тегів vX.Y.Z (CI: fetch-depth: 0)")
  return tag
}

/** Шляхи `paths` тегу в `dest`; `strip` — скільки тек шляху відкинути. */
async function extractAt(tag, paths, dest, strip = 0) {
  mkdirSync(dest, { recursive: true })
  const tar = path.join(temp, "archive.tar")
  await git(
    root,
    "archive",
    "--format=tar",
    `--output=${tar}`,
    tag,
    "--",
    ...paths,
  )
  await mustRun("tar", [
    "-xf",
    tar,
    "-C",
    dest,
    `--strip-components=${String(strip)}`,
  ])
  rmSync(tar)
}

/** Файли застосунку шаблону: файл → шлях у `src/`; до файла-мапи — кожен у `src/` під своєю назвою. */
async function afterInstallMap(tag) {
  const map = await fileAt(tag, AFTER_INSTALL)
  if (map) return JSON.parse(map)
  const files = await git(root, "ls-tree", "--name-only", `${tag}:${TEMPLATE}`)
  return Object.fromEntries(
    files
      .split("\n")
      .filter((name) => name.endsWith(".after-install"))
      .map((name) => name.replace(/\.after-install$/, ""))
      .map((name) => [name, name]),
  )
}

/** Файли застосунку з `from` у `src/` проекту; з самого проекту — переносяться. */
function placeAfterInstall(dir, map, from) {
  for (const [file, target] of Object.entries(map)) {
    const source = path.join(from, `${file}.after-install`)
    const to = path.join(dir, "src", target)
    mkdirSync(path.dirname(to), { recursive: true })
    if (from === dir) renameSync(source, to)
    else cpSync(source, to)
  }
}

/** Файли команди кіта версії `ref` (закомічені) у теку `dest`; повертає шлях до `erp-ui-kit.mjs`. */
async function commandAt(ref, dest) {
  mkdirSync(dest)
  const tools = await git(
    root,
    "ls-tree",
    "--name-only",
    `${ref}:registry/tools`,
  )
  for (const file of tools
    .split("\n")
    .filter((name) => /^erp-ui-kit.*\.mjs$/.test(name)))
    writeFileSync(
      path.join(dest, file),
      await fileAt(ref, `registry/tools/${file}`),
    )
  return path.join(dest, "erp-ui-kit.mjs")
}

/** Команда кіта: вивід у журнал, код виходу — як очікується (`fail` — має впасти). */
async function kit(dir, script, kitArgs, { fail = false } = {}) {
  console.log(`\n$ node ${script} ${kitArgs.join(" ")}`)
  const result = await run(process.execPath, [script, ...kitArgs], {
    cwd: dir,
    capture: true,
  })
  const output = `${result.stdout}${result.stderr}`
  console.log(output)
  expect(
    fail ? result.code !== 0 : result.code === 0 && !result.timedOut,
    `node ${script} ${kitArgs[0]}: ${fail ? "мало впасти, а пройшло" : `код ${String(result.code)}`}`,
  )
  return output
}

/** typecheck і збірка з бекендом (запобіжник `VITE_BACKEND` шаблону цієї версії її вимагає). */
async function buildProject(dir, what) {
  console.log(`\n=== typecheck і збірка: ${what} ===`)
  await mustRun("pnpm", ["typecheck"], { cwd: dir })
  await mustRun("env", ["VITE_BACKEND=api", "pnpm", "build"], { cwd: dir })
  rmSync(path.join(dir, "dist"), { recursive: true, force: true })
}

/** `update` до цього коміту з цієї копії кіта. */
const toHead = (...extra) => ["update", "HEAD", "--from", root, ...extra]
const stepsHeading = (tag) => `Що зробити в проекті (${tag} → HEAD@`

const readManifest = (dir) =>
  JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8"))

/** Проект на тегу: шаблон тегу, адаптер, `base` тегу, решта кіта командою тегу. */
async function projectAt(tag, dir) {
  await extractAt(tag, [TEMPLATE], dir, 3)
  cpSync(path.join(root, "tests/consumer/upgrade"), dir, { recursive: true })
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\ndist/\n")
  // CLI shadcn закріплена в проекті: та сама для встановлення й оновлення (посібник, розділ 8).
  const pkgFile = path.join(dir, "package.json")
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"))
  pkg.devDependencies.shadcn = JSON.parse(
    readFileSync(path.join(root, "node_modules/shadcn/package.json"), "utf8"),
  ).version
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
  await mustRun("pnpm", ["install", "--ignore-workspace"], { cwd: dir })
  const shadcn = path.join(dir, "node_modules/.bin/shadcn")
  await mustRun(
    shadcn,
    ["init", "-b", "base", "-p", "nova", "-y", "--no-rtl"],
    {
      cwd: dir,
    },
  )

  const kitDir = path.join(temp, `kit-${tag}`)
  await extractAt(tag, KIT_PATHS, kitDir)
  const registry = path.join(kitDir, "registry.json")
  const built = path.join(kitDir, "r")
  await mustRun(shadcn, ["build", registry, "-c", kitDir, "-o", built], {
    cwd: dir,
    capture: true,
  })
  await mustRun(
    shadcn,
    ["add", path.join(built, "base.json"), "-y", "--overwrite"],
    {
      cwd: dir,
    },
  )
  await git(dir, "init", "-q")
  await commitAll(dir, `erp-ui: base ${tag}`)

  const items = JSON.parse(readFileSync(registry, "utf8"))
    .items.filter(
      (item) =>
        BUNDLES.includes(item.name) ||
        /^(ui|erp|templates|tools)\//.test(item.name) ||
        item.meta?.layer === "modules",
    )
    .map((item) => item.name)
  const command = await commandAt(tag, path.join(temp, `command-${tag}`))
  await kit(dir, command, [
    "update",
    tag,
    "--from",
    root,
    "--items",
    items.join(","),
  ])
  placeAfterInstall(dir, await afterInstallMap(tag), dir)
  console.log(`\n=== typecheck проекту на ${tag} ===`)
  await mustRun("pnpm", ["typecheck"], { cwd: dir })
  await commitAll(dir, `erp-ui ${tag}`)
}

/** «Що зробити в проекті» для файлів проекту: файли шаблону тегу → файли шаблону цієї версії. */
async function followProjectSteps(dir, tag) {
  for (const target of Object.values(await afterInstallMap(tag)))
    rmSync(path.join(dir, "src", target), { force: true })
  for (const file of PROJECT_CONFIG)
    if (existsSync(path.join(root, TEMPLATE, file)))
      cpSync(path.join(root, TEMPLATE, file), path.join(dir, file))
  placeAfterInstall(
    dir,
    JSON.parse(readFileSync(path.join(root, AFTER_INSTALL), "utf8")),
    path.join(root, TEMPLATE),
  )
}

/** Шлях 1: стара команда проекту; сироти — зі звіту, проект видаляє їх сам. Повертає сироти. */
async function updateWithOldCommand(dir, tag) {
  console.log(
    `\n=== Шлях 1: оновлення ${tag} → HEAD старою командою проекту ===`,
  )
  const output = await kit(dir, COMMAND, toHead())
  const orphans = [
    ...new Set([...output.matchAll(ORPHAN_LINE)].map((match) => match[1])),
  ].sort()
  for (const file of orphans) rmSync(path.join(dir, file))
  await buildProject(dir, "стара команда, файли проекту тегу")
  await followProjectSteps(dir, tag)
  await buildProject(dir, "стара команда, файли проекту цієї версії")
  await kit(dir, COMMAND, ["check"])
  return orphans
}

/** Шлях 2: команда цієї версії з тимчасової теки, `--prune`, позначка локальної правки. */
async function updateWithNewCommand(dir, tag, orphans) {
  console.log(`\n=== Шлях 2: оновлення ${tag} → HEAD командою цієї версії ===`)
  const script = await commandAt("HEAD", path.join(temp, "command-head"))
  const dryRun = await kit(dir, script, toHead("--dry-run"))
  expect(dryRun.includes(stepsHeading(tag)), "--dry-run без «Що зробити»")
  const report = await kit(dir, script, toHead())
  expect(report.includes(stepsHeading(tag)), "звіт без «Що зробити»")
  const manifest = readManifest(dir)
  expect(
    /^[0-9a-f]{40}$/.test(manifest.sha) &&
      manifest.fingerprint &&
      manifest.checksum,
    "маніфест без sha, fingerprint чи checksum",
  )
  expect(
    JSON.stringify(Object.keys(manifest.orphans).sort()) ===
      JSON.stringify(orphans),
    `сироти маніфесту ${Object.keys(manifest.orphans).join(", ")} — не ті, що назвала стара команда (${orphans.join(", ")})`,
  )
  const check = await kit(dir, COMMAND, ["check"])
  const guarded = (await fileAt(tag, `${TEMPLATE}/vite.config.ts`))?.includes(
    "VITE_BACKEND",
  )
  expect(
    check.includes("немає запобіжника VITE_BACKEND") === !guarded,
    guarded
      ? "check попереджає про запобіжник, хоч він є"
      : "check не попередив про конфіг Vite без запобіжника",
  )
  expect(
    !orphans.length || check.includes("Файли-сироти"),
    "check не назвав сироти",
  )

  await commitAll(dir, "erp-ui HEAD")
  await kit(dir, COMMAND, toHead("--prune"))
  expect(
    !Object.keys(readManifest(dir).orphans).length,
    "--prune лишив сироти в маніфесті",
  )
  for (const file of orphans)
    expect(!existsSync(path.join(dir, file)), `--prune не видалив ${file}`)
  await buildProject(dir, "нова команда, файли проекту тегу")
  await followProjectSteps(dir, tag)
  await buildProject(dir, "нова команда, файли проекту цієї версії")
  const after = await kit(dir, COMMAND, ["check"])
  expect(
    !after.includes("немає запобіжника VITE_BACKEND"),
    "check попереджає про запобіжник після «Що зробити в проекті»",
  )
  await commitAll(dir, "проект за «Що зробити в проекті»")
  await assertLocalOverrideStops(dir)
}

/** Файл кіта з позначкою локальної правки без відбитка: попередження в `--dry-run`, зупинка до запису. */
async function assertLocalOverrideStops(dir) {
  console.log("\n=== Позначка локальної правки зупиняє оновлення ===")
  const file = path.join(dir, MARKED_FILE)
  const marked = `// ${MARKER} — перевірка сценарію оновлення\n${readFileSync(file, "utf8")}`
  writeFileSync(file, marked)
  const manifest = readManifest(dir)
  delete manifest.files[MARKED_FILE]
  writeFileSync(
    path.join(dir, MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  await commitAll(dir, "локальна правка старого правила")
  const dryRun = await kit(dir, COMMAND, toHead("--dry-run"))
  expect(
    dryRun.includes(
      "справжнє оновлення зупиниться): Файли з позначкою local override",
    ) && dryRun.includes(`немає в ${MANIFEST}`),
    "--dry-run не попередив про позначку й файл поза маніфестом",
  )
  const stopped = await kit(dir, COMMAND, toHead(), { fail: true })
  expect(
    stopped.includes(`local override update не перезаписує`) &&
      stopped.includes(MARKED_FILE),
    "update зупинився не на позначці",
  )
  expect(readFileSync(file, "utf8") === marked, `update змінив ${MARKED_FILE}`)
  expect(
    !(await git(dir, "status", "--porcelain")).trim(),
    "update записав файли до зупинки",
  )
}

try {
  const tag = await previousTag()
  const dir = path.join(temp, "project")
  console.log(
    `Сценарій оновлення: проект на ${tag} → цей коміт (${(await git(root, "rev-parse", "HEAD")).trim()})`,
  )
  await projectAt(tag, dir)
  const baseline = (await git(dir, "rev-parse", "HEAD")).trim()
  const orphans = await updateWithOldCommand(dir, tag)
  await git(dir, "reset", "-q", "--hard", baseline)
  await git(dir, "clean", "-qfd")
  await updateWithNewCommand(dir, tag, orphans)
  console.log(
    `\nOK: проект на ${tag} оновлено до цього коміту старою командою й командою цієї версії; сироти (${String(orphans.length)}) названо й видалено, typecheck і збірка зелені, позначка локальної правки зупиняє оновлення.`,
  )
} finally {
  if (keep) console.log(`Тестовий проект лишено: ${temp}`)
  else rmSync(temp, { recursive: true, force: true })
}
