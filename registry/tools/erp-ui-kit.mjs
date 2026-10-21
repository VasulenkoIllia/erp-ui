#!/usr/bin/env node
/**
 * Кіт erp-ui у проекті (крок 1.9, ADR-0029): оновлення однією командою й перевірка, що файли кіта
 * не правлені. Файл ставить `shadcn add` (елементи `base` і `tools/kit`): у проекті його не правте.
 *
 *   node scripts/erp-ui-kit.mjs check                     # файли кіта як у версії (додайте в pnpm lint)
 *   node scripts/erp-ui-kit.mjs update v1.0.0             # усі встановлені елементи — до тегу
 *   node scripts/erp-ui-kit.mjs update v1.0.0 --dry-run   # лише показати, що зміниться
 *   node scripts/erp-ui-kit.mjs update v1.0.0 --add erp/command-palette   # ще й новий елемент
 *   node scripts/erp-ui-kit.mjs update <гілка|SHA> --from ../erp-ui       # з локальної копії кіта
 *
 * Список встановлених елементів і відбитки файлів — у `kit-files.json` проекту; перший раз (у файлі
 * ще немає `items`) — `--items base,data,…`. Оновлення: чисте git → тег архівом одним запитом
 * (`gh api …/tarball/<тег>`, тайм-аут і повтори) → `shadcn build` → `add --dry-run` (звіт) →
 * `add --overwrite --yes` → файли, які проект доповнює сам, лишаються його → закріплена версія CLI →
 * повторний `--dry-run` (усе вже як у версії) → нові відбитки. Файлів, яких у новій версії немає,
 * команда не видаляє, а лише називає.
 */
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildKit,
  installCommand,
  KitError,
  mustRun,
  parseArgs,
  parseDryRun,
  printReport,
  readJson,
  run,
  shadcnBin,
} from "./erp-ui-kit-lib.mjs"

const MANIFEST = "kit-files.json"
/** Файли кіта, які проект після встановлення доповнює сам (стилі, блок для CLAUDE.md). */
export const PROJECT_OWNED = ["src/index.css", "docs/erp-ui/CLAUDE.project.md"]
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
const SAFE_ITEM = /^[a-z0-9][a-z0-9-]*(\/[A-Za-z0-9][A-Za-z0-9-]*)?$/
const RECOVERY_HINT =
  "Змінені файли — git diff, повернути все — git restore . (нові файли — git status, git clean)."

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex")

const hashFile = (root) => (file) => {
  const full = path.join(root, file)
  return existsSync(full) ? sha256(readFileSync(full)) : undefined
}

/** Файли кіта, змінені чи видалені в проекті (файли, які проект доповнює сам, — не рахуються). */
export function kitFileProblems(manifestFiles, hashOf) {
  const changed = []
  const missing = []
  for (const [file, hash] of Object.entries(manifestFiles)) {
    if (PROJECT_OWNED.includes(file)) continue
    const current = hashOf(file)
    if (current === undefined) missing.push(file)
    else if (current !== hash) changed.push(file)
  }
  return { changed, missing }
}

function readManifest(root) {
  const file = path.join(root, MANIFEST)
  if (!existsSync(file)) return null
  const manifest = readJson(file, MANIFEST)
  if (
    typeof manifest?.files !== "object" ||
    manifest.files === null ||
    (manifest.items !== undefined && !Array.isArray(manifest.items))
  )
    throw new KitError(
      `${MANIFEST}: немає відбитків файлів (files) чи items не список`,
    )
  return manifest
}

/** Запис через тимчасовий файл: обрив посеред запису не лишає зіпсованого маніфесту. */
function writeManifest(root, manifest) {
  const file = path.join(root, MANIFEST)
  writeFileSync(`${file}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(`${file}.tmp`, file)
}

const shadcnSpec = (root) => {
  const pkg = readJson(path.join(root, "package.json"), "package.json")
  return {
    dependencies: pkg.dependencies?.shadcn,
    devDependencies: pkg.devDependencies?.shadcn,
  }
}

/** `add` елемента з залежністю `shadcn@^…` (base до v1.0.0) знімає закріплення CLI — повертаємо. */
async function restoreCliPin(root, before) {
  const after = shadcnSpec(root)
  if (
    after.dependencies === before.dependencies &&
    after.devDependencies === before.devDependencies
  )
    return
  const file = path.join(root, "package.json")
  const pkg = readJson(file, "package.json")
  for (const field of ["dependencies", "devDependencies"]) {
    if (before[field] !== undefined) (pkg[field] ??= {}).shadcn = before[field]
    else if (pkg[field]) delete pkg[field].shadcn
  }
  // Відступ — як у файлі проекту, щоб diff показав лише версію CLI.
  const indent = /^([ \t]+)"/m.exec(readFileSync(file, "utf8"))?.[1] ?? "  "
  writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`)
  console.log(
    `Закріплення CLI shadcn повернуто (${String(before.dependencies ?? before.devDependencies)}).`,
  )
  const [cmd, args] = installCommand(root)
  await mustRun(cmd, args, { cwd: root })
}

/**
 * Файли, які проект доповнює сам. `own` — відбитки версій кіта з минулого встановлення: файл, що
 * відрізняється від своєї версії кіта, змінив проект — його версію повертаємо. Різницю з новою
 * версією кіта показуємо, лише коли версія кіта змінилась. Повертає відбитки версій кіта всіх таких
 * файлів, зокрема створених цим `add`.
 */
export async function keepProjectOwned(root, saved, own, dir) {
  const kitHashes = {}
  for (const file of PROJECT_OWNED) {
    const full = path.join(root, file)
    if (!existsSync(full)) continue
    const after = readFileSync(full)
    kitHashes[file] = sha256(after)
    const before = saved.get(file)
    if (!before || after.equals(before) || own[file] === sha256(before))
      continue
    writeFileSync(full, before)
    if (own[file] === kitHashes[file]) continue
    const kitCopy = path.join(dir, "kit-version", path.basename(file))
    mkdirSync(path.dirname(kitCopy), { recursive: true })
    writeFileSync(kitCopy, after)
    const diff = await run(
      "git",
      ["diff", "--no-index", "--no-color", "--", kitCopy, full],
      { capture: true },
    )
    // Код 1 — файли різні (так і має бути), інше — git не порівняв. Тимчасові шляхи — назвами.
    const shown =
      diff.code === 1
        ? diff.stdout
            .replaceAll(kitCopy.slice(1), `кіт/${file}`)
            .replaceAll(full.slice(1), file)
        : `(git diff: ${diff.stderr})`
    console.log(
      `\n${file}: лишив версію проекту; у новій версії кіта цей файл інший — перенесіть потрібне вручну:\n${shown}`,
    )
  }
  return kitHashes
}

/** Файли, які git ігнорує (`.gitignore`, `.git/info/exclude`): у чистій копії, напр. в CI, їх немає. */
async function ignoredByGit(root, files) {
  if (!files.length) return new Set()
  const result = await run("git", ["check-ignore", "--", ...files], {
    cwd: root,
    capture: true,
  })
  // Код 0 — є ігноровані, 1 — жодного; інше — git не перевірив, і мовчки вважати «жодного» не можна.
  if (result.code !== 0 && result.code !== 1)
    throw new KitError(
      `git check-ignore: код ${String(result.code)}\n${result.stderr}`,
    )
  // Шляхи кіта — ASCII, тож git видає їх без лапок, по рядку на шлях.
  return new Set(result.stdout.split("\n").filter(Boolean))
}

/**
 * Відбитки файлів кіта зі звіту `--dry-run`: без файлів, які проект доповнює сам, і без
 * ігнорованих git (їх названо). Файл зі звіту, якого після `add` немає, — помилка.
 */
async function kitFileHashes(root, files) {
  const paths = files
    .map((file) => file.path)
    .filter((file) => !PROJECT_OWNED.includes(file))
  const ignored = await ignoredByGit(root, paths)
  if (ignored.size)
    console.log(
      `Без відбитків (git їх ігнорує, тож check їх не перевіряє): ${[...ignored].join(", ")}`,
    )
  const hash = hashFile(root)
  const hashes = {}
  for (const file of paths.filter((f) => !ignored.has(f)).sort()) {
    const value = hash(file)
    if (!value) throw new KitError(`Після оновлення немає файлу кіта ${file}`)
    hashes[file] = value
  }
  return hashes
}

function checkCommand(root) {
  const manifest = readManifest(root)
  if (!manifest)
    throw new KitError(
      `Немає ${MANIFEST}: його записує update після встановлення кіта`,
    )
  const total = Object.keys(manifest.files).length
  if (!total)
    throw new KitError(`${MANIFEST} без відбитків файлів: перевіряти нічого`)
  const { changed, missing } = kitFileProblems(manifest.files, hashFile(root))
  for (const file of changed) console.error(`змінено файл кіта: ${file}`)
  for (const file of missing) console.error(`немає файлу кіта: ${file}`)
  if (changed.length || missing.length)
    throw new KitError(
      "Файли кіта не правимо: зміни — у файлі розширення, бракує точки розширення — PR у кіт.",
    )
  console.log(
    `Файли кіта ${String(manifest.kit)} не змінені: ${String(total)}.`,
  )
}

/** Чисте git (оновлення видно окремо в diff) і файли кіта такі, як після встановлення. */
async function readinessProblems(root, manifest) {
  const status = await mustRun("git", ["status", "--porcelain"], {
    cwd: root,
    capture: true,
  })
  const problems = []
  if (status.stdout.trim())
    problems.push(
      `Спершу закомітьте зміни: оновлення має бути видно окремо в git diff.\n${status.stdout}`,
    )
  const { changed, missing } = kitFileProblems(manifest.files, hashFile(root))
  if (changed.length || missing.length)
    problems.push(
      `Файли кіта змінено в проекті (спершу перенесіть зміни в розширення чи в кіт): ${[...changed, ...missing].join(", ")}`,
    )
  return problems
}

function itemsToInstall(manifest, itemsArg, add) {
  if (itemsArg && manifest.items?.length)
    throw new KitError(
      `У ${MANIFEST} уже є список елементів: новий — --add, прибрати — зі списку items у ${MANIFEST}`,
    )
  const items = [...new Set([...(itemsArg ?? manifest.items ?? []), ...add])]
  if (!items.length)
    throw new KitError(
      `У ${MANIFEST} немає списку елементів: перший раз — --items base,data,…`,
    )
  const badItem = items.find((item) => !SAFE_ITEM.test(item))
  if (badItem) throw new KitError(`Некоректна назва елемента: ${badItem}`)
  return items
}

const dryRunReport = async (root, itemFiles) =>
  parseDryRun(
    (
      await mustRun(shadcnBin(root), ["add", ...itemFiles, "--dry-run"], {
        cwd: root,
        capture: true,
      })
    ).stdout,
  )

/** Після запису все, крім файлів проекту, — як у версії (`skip`), інакше оновлення неповне. */
async function verifyApplied(root, itemFiles) {
  const left = (await dryRunReport(root, itemFiles)).filter(
    (file) => file.action !== "skip" && !PROJECT_OWNED.includes(file.path),
  )
  if (left.length)
    throw new KitError(
      `Після оновлення файли кіта не збігаються з версією: ${left.map((file) => file.path).join(", ")}`,
    )
}

/** `add --overwrite` і все, що після нього: файли проекту, закріплення CLI, звірка, відбитки. */
async function applyUpdate({
  root,
  kit,
  items,
  itemFiles,
  files,
  manifest,
  dir,
}) {
  const saved = new Map(
    PROJECT_OWNED.filter((file) => existsSync(path.join(root, file))).map(
      (file) => [file, readFileSync(path.join(root, file))],
    ),
  )
  const pin = shadcnSpec(root)
  try {
    await mustRun(
      shadcnBin(root),
      ["add", ...itemFiles, "--overwrite", "--yes"],
      {
        cwd: root,
      },
    )
    const own = await keepProjectOwned(root, saved, manifest.own ?? {}, dir)
    await restoreCliPin(root, pin)
    await verifyApplied(root, itemFiles)
    const kitFiles = await kitFileHashes(root, files)
    writeManifest(root, { kit, items, files: kitFiles, own })
    console.log(
      `\nКіт ${kit}: ${MANIFEST} оновлено (${String(Object.keys(kitFiles).length)} файлів). Далі — typecheck, lint, тести, збірка й e2e; що змінилось — CHANGELOG.md кіта.`,
    )
  } catch (error) {
    console.error(
      `\nОновлення не завершилось, ${MANIFEST} не змінено. ${RECOVERY_HINT}`,
    )
    throw error
  }
}

async function updateCommand(root, args) {
  const { rest, dryRun, add, items: itemsArg, from } = parseArgs(args)
  const ref = rest[0]
  if (!ref || !SAFE_REF.test(ref) || ref.includes(".."))
    throw new KitError(
      "Потрібна версія кіта: update vX.Y.Z (тег, гілка чи SHA)",
    )
  const manifest = readManifest(root) ?? { files: {} }
  const items = itemsToInstall(manifest, itemsArg, add)
  const problems = await readinessProblems(root, manifest)
  if (problems.length && !dryRun) throw new KitError(problems.join("\n"))
  for (const problem of problems)
    console.warn(`Увага (справжнє оновлення зупиниться): ${problem}`)

  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-kit-"))
  // Ctrl+C посеред `add`: тимчасова тека — геть, людині — як побачити й повернути зміни.
  const interrupted = () => {
    rmSync(dir, { recursive: true, force: true })
    console.error(`\nОновлення перервано. ${RECOVERY_HINT}`)
    process.exit(130)
  }
  process.once("SIGINT", interrupted)
  process.once("SIGTERM", interrupted)
  try {
    const { out, kit } = await buildKit({ ref, from, root, dir })
    const itemFiles = items.map((item) => {
      const file = path.join(out, `${item}.json`)
      if (!existsSync(file))
        throw new KitError(`У версії ${ref} немає елемента ${item}`)
      return file
    })
    const files = await dryRunReport(root, itemFiles)
    printReport(kit, files, manifest.files, PROJECT_OWNED)
    if (!dryRun)
      await applyUpdate({ root, kit, items, itemFiles, files, manifest, dir })
  } finally {
    process.off("SIGINT", interrupted)
    process.off("SIGTERM", interrupted)
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main([command, ...args]) {
  const root = process.cwd()
  if (!existsSync(path.join(root, "components.json")))
    throw new KitError("Запускайте з кореня проекту (поруч із components.json)")
  if (command === "check") checkCommand(root)
  else if (command === "update") await updateCommand(root, args)
  else
    throw new KitError(
      "Команди: check | update <версія> [--dry-run] [--add …] [--items …] [--from …]",
    )
}

// Запуск файлом, а не імпорт (тести): Node дає реальний шлях модуля, а `argv[1]` — як передали;
// на macOS `/var` і `/tmp` — символьні посилання, тож порівнюємо реальні шляхи.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof KitError ? error.message : error)
    process.exit(1)
  })
}
