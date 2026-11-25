/**
 * Проект для сценарію оновлення (`scripts/upgrade-smoke.mjs`, ADR-0088): проект на тегу кіта, файли
 * проекту за шаблоном цієї версії, typecheck і збірка, запуск команди кіта з перевіркою коду виходу.
 * Усе — з цієї копії кіта (`git archive`, `--from`), без GitHub.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  KIT_PATHS,
  mustRun,
  run,
  sha256,
} from "../registry/tools/erp-ui-kit-lib.mjs"

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
export const MANIFEST = "kit-files.json"
export const COMMAND = "scripts/erp-ui-kit.mjs"
/**
 * Сирота, якої немає в жодній версії кіта: шляхи сиріт і `--prune` перевіряються й тоді, коли кіт
 * між тегом і цим комітом нічого не видаляв.
 */
export const SMOKE_ORPHAN = "src/lib/erp-ui-upgrade-smoke-orphan.ts"

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
/** git без налаштувань машини: CI без імені автора, у людини — підпис комітів. */
const GIT_IDENTITY = [
  "-c",
  "user.name=erp-ui-upgrade-smoke",
  "-c",
  "user.email=upgrade-smoke@example.com",
  "-c",
  "commit.gpgsign=false",
]

/** Тег випуску кіта: `vX.Y.Z`. */
export const RELEASE_TAG = /^v\d+\.\d+\.\d+$/

/** `update` до цього коміту з цієї копії кіта; `extra` — ще аргументи команди. */
export const toHead = (...extra) => ["update", "HEAD", "--from", root, ...extra]

export function expect(condition, message) {
  if (!condition) throw new Error(`Сценарій оновлення: ${message}`)
}

export const git = async (cwd, ...gitArgs) =>
  (await mustRun("git", [...GIT_IDENTITY, ...gitArgs], { cwd, capture: true }))
    .stdout

/** Найновіший тег випуску цієї копії (за версією). */
export async function latestReleaseTag() {
  const tags = await git(root, "tag", "--list", "v*", "--sort=-v:refname")
  const tag = tags.split("\n").find((name) => RELEASE_TAG.test(name))
  expect(tag, "у копії немає тегів vX.Y.Z (CI: fetch-depth: 0)")
  return tag
}

export const commitAll = async (dir, message) => {
  await git(dir, "add", "-A")
  await git(dir, "commit", "-qm", message)
}

/** Файл кіта на тегу чи коміті; немає — `undefined`. */
export async function fileAt(ref, file) {
  const result = await run("git", ["show", `${ref}:${file}`], {
    cwd: root,
    capture: true,
  })
  return result.code === 0 ? result.stdout : undefined
}

export const readManifest = (dir) =>
  JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8"))

const writeManifest = (dir, manifest) =>
  writeFileSync(
    path.join(dir, MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

/** Шляхи `paths` тегу в `dest` (`temp` — для архіву); `strip` — скільки тек шляху відкинути. */
async function extractAt(tag, paths, dest, temp, strip = 0) {
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
export async function commandAt(ref, dest) {
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
export async function kit(dir, script, kitArgs, { fail = false } = {}) {
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
export async function buildProject(dir, what) {
  console.log(`\n=== typecheck і збірка: ${what} ===`)
  await mustRun("pnpm", ["typecheck"], { cwd: dir })
  await mustRun("env", ["VITE_BACKEND=api", "pnpm", "build"], { cwd: dir })
  rmSync(path.join(dir, "dist"), { recursive: true, force: true })
}

/**
 * CLI shadcn закріплена в проекті: та сама версія, що в кіті, для встановлення й оновлення (посібник, розділ 8);
 * `dependencies` — записи проекту до встановлення кіта.
 */
export function pinShadcn(dir, dependencies = {}) {
  const pkgFile = path.join(dir, "package.json")
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"))
  pkg.devDependencies.shadcn = JSON.parse(
    readFileSync(path.join(root, "node_modules/shadcn/package.json"), "utf8"),
  ).version
  Object.assign(pkg.dependencies, dependencies)
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
}

/**
 * `shadcn init` і `base` версії `ref` (тег чи `HEAD` цієї копії) — шляхами `--from` команди, лише ті, що є у
 * версії (новий шлях цієї версії старий тег не має). Повертає registry.json версії.
 */
export async function addBase(ref, dir, temp) {
  const shadcn = path.join(dir, "node_modules/.bin/shadcn")
  await mustRun(
    shadcn,
    ["init", "-b", "base", "-p", "nova", "-y", "--no-rtl"],
    { cwd: dir },
  )
  const kitDir = path.join(temp, `kit-${ref}`)
  const present = await git(
    root,
    "ls-tree",
    "--name-only",
    ref,
    "--",
    ...KIT_PATHS,
  )
  await extractAt(ref, present.split("\n").filter(Boolean), kitDir, temp)
  const registry = path.join(kitDir, "registry.json")
  const built = path.join(kitDir, "r")
  await mustRun(shadcn, ["build", registry, "-c", kitDir, "-o", built], {
    cwd: dir,
    capture: true,
  })
  await mustRun(
    shadcn,
    ["add", path.join(built, "base.json"), "-y", "--overwrite"],
    { cwd: dir },
  )
  return JSON.parse(readFileSync(registry, "utf8"))
}

/**
 * Шаблон тегу й адаптер, CLI shadcn проекту, `shadcn init`, `base` тегу — як у посібнику. `repo` — корінь git і
 * робочого простору, коли проект — пакет адмінки в монорепо (ADR-0097); `dependencies` — записи проекту до
 * встановлення кіта.
 */
async function startProject(tag, dir, temp, { repo = dir, dependencies = {} }) {
  await extractAt(tag, [TEMPLATE], dir, temp, 3)
  cpSync(path.join(root, "tests/consumer/upgrade"), dir, { recursive: true })
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\ndist/\n")
  pinShadcn(dir, dependencies)
  // Пакет робочого простору ставиться з кореня воркспейсу; окремий проект — без воркспейсів вище.
  await mustRun(
    "pnpm",
    repo === dir ? ["install", "--ignore-workspace"] : ["install"],
    { cwd: repo },
  )
  const registry = await addBase(tag, dir, temp)
  await git(repo, "init", "-q")
  await commitAll(dir, `erp-ui: base ${tag}`)
  return registry.items
    .filter(
      (item) =>
        BUNDLES.includes(item.name) ||
        /^(ui|erp|templates|tools)\//.test(item.name) ||
        item.meta?.layer === "modules",
    )
    .map((item) => item.name)
}

/**
 * Проект на тегу: шаблон тегу й адаптер, `base` тегу, решта кіта командою тегу, сирота сценарію в
 * маніфесті, typecheck. Маніфест із сумою (команда після v1.3.0) сума більше не збігається: `update`
 * лише попереджає й записує нову. `options` — як у `startProject` (пакет адмінки в монорепо).
 */
export async function projectAt(tag, dir, temp, options = {}) {
  const items = await startProject(tag, dir, temp, options)
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
  const orphan = "export const smokeOrphan = 1\n"
  writeFileSync(path.join(dir, SMOKE_ORPHAN), orphan)
  const manifest = readManifest(dir)
  manifest.files[SMOKE_ORPHAN] = sha256(orphan)
  writeManifest(dir, manifest)
  console.log(`\n=== typecheck проекту на ${tag} ===`)
  await mustRun("pnpm", ["typecheck"], { cwd: dir })
  await commitAll(dir, `erp-ui ${tag}`)
}

/** «Що зробити в проекті» для файлів проекту: файли шаблону тегу → файли шаблону цієї версії. */
export async function followProjectSteps(dir, tag) {
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

/** Незмінна позначка локальної правки старого правила в `file` і вилучений відбиток (ADR-0076). */
export function markLocalOverride(dir, file) {
  const full = path.join(dir, file)
  const marker = ["erp-ui", "local override"].join(": ")
  const marked = `// ${marker} — перевірка сценарію оновлення\n${readFileSync(full, "utf8")}`
  writeFileSync(full, marked)
  const manifest = readManifest(dir)
  delete manifest.files[file]
  writeManifest(dir, manifest)
  return marked
}
