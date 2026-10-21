/**
 * Залежності кіта в проекті для `scripts/erp-ui-kit.mjs` (крок fix-kit-deps, ADR-0029): CLI shadcn
 * 4.22 під час `add` ставить кожну залежність елемента з версією заново (`pnpm add назва@діапазон`),
 * навіть наявну, і переписує діапазон проекту. Тому команда забирає залежності з елементів і сама
 * ставить лише ті, яких у проекті немає; наявні — діапазон і версія проекту — не змінюються.
 * Файл ставить `shadcn add` разом із командою: у проекті його не правте.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { KitError, mustRun, readJson } from "./erp-ui-kit-lib.mjs"

/** Менеджер пакетів → його lock-файли, команда додавання й прапорець залежності для розробки. */
const PACKAGE_MANAGERS = {
  pnpm: { locks: ["pnpm-lock.yaml"], add: ["add"], dev: "-D" },
  yarn: { locks: ["yarn.lock"], add: ["add"], dev: "-D" },
  bun: { locks: ["bun.lock", "bun.lockb"], add: ["add"], dev: "-d" },
  npm: {
    locks: ["package-lock.json", "npm-shrinkwrap.json"],
    add: ["install", "--no-audit", "--no-fund"],
    dev: "-D",
  },
}
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]
/** Діапазони кіта (`registry/package.json`, перевіряє build-registry): `^x.y.z`, `~x.y.z`, `x.y.z`. */
const KIT_RANGE = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

/** Теки від `root` угору до кореня диска — так Node шукає `node_modules` (підняті пакети). */
function* ancestors(root) {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    yield dir
    if (path.dirname(dir) === dir) return
  }
}

/**
 * Теки від `root` угору (lock-файл воркспейсу) до кореня git-репозиторію включно: чужий lock-файл
 * вище, напр. у домашній теці, — не проекту.
 */
function* upToGitRoot(root) {
  for (const dir of ancestors(root)) {
    yield dir
    if (existsSync(path.join(dir, ".git"))) return
  }
}

/**
 * Менеджер пакетів проекту: поле `packageManager` у `package.json`, інакше найближчий угору
 * lock-файл (проект у воркспейсі — lock у корені воркспейсу). `lock` — шлях до lock-файлу, якщо є.
 * Не вдалося визначити — `undefined`: вгадувати npm не можна, він переклав би `node_modules` іншого
 * менеджера. Lock-файли різних менеджерів в одній теці — помилка.
 */
export function detectPackageManager(root) {
  const field = readJson(
    path.join(root, "package.json"),
    "package.json",
  ).packageManager
  const declared = typeof field === "string" ? field.split("@")[0] : field
  if (declared !== undefined && !Object.hasOwn(PACKAGE_MANAGERS, declared))
    throw new KitError(
      `package.json: невідомий packageManager ${JSON.stringify(field)}`,
    )
  for (const dir of upToGitRoot(root)) {
    const found = Object.entries(PACKAGE_MANAGERS).flatMap(
      ([name, { locks }]) =>
        locks
          .filter((lock) => existsSync(path.join(dir, lock)))
          .map((lock) => ({ name, lock: path.join(dir, lock) })),
    )
    const names = new Set(found.map((entry) => entry.name))
    if (names.size > 1 && !declared)
      throw new KitError(
        `Кілька lock-файлів у ${dir} (${found.map((entry) => path.basename(entry.lock)).join(", ")}): вкажіть packageManager у package.json`,
      )
    const match = found.find((entry) => !declared || entry.name === declared)
    if (match) return match
  }
  return declared ? { name: declared, lock: undefined } : undefined
}

/** Додати залежності менеджером пакетів: `[команда, аргументи]`; `--` — назви не стануть опціями. */
export function addCommand(manager, specs, { dev = false } = {}) {
  const { add, dev: devFlag } = PACKAGE_MANAGERS[manager]
  return [manager, [...add, ...(dev ? [devFlag] : []), "--", ...specs]]
}

/**
 * `назва@діапазон` (так залежності елементів пише build-registry кіта) → `{ name, range }`. Лише
 * назва npm і діапазон кіта (`^`, `~`, точна версія), інше — `undefined`.
 */
export function parseDependency(spec) {
  const at = spec.lastIndexOf("@")
  const name = spec.slice(0, at)
  const range = spec.slice(at + 1)
  return at > 0 && PACKAGE_NAME.test(name) && KIT_RANGE.test(range)
    ? { name, range }
    : undefined
}

/**
 * Забирає залежності з елементів зібраного реєстру (файли переписує без них). CLI shadcn 4.22 під
 * час `add` ставить кожну залежність з версією заново (`pnpm add назва@діапазон`), навіть наявну, і
 * переписує діапазон проекту (крок fix-kit-deps), тож ставить їх команда. Повертає назва →
 * `{ range, dev }`; пакет, потрібний застосунку хоч одному елементу, — не `dev`.
 */
export function takeItemDependencies(itemFiles) {
  const deps = new Map()
  for (const file of itemFiles) {
    const item = readJson(file, path.basename(file))
    for (const [field, dev] of [
      ["dependencies", false],
      ["devDependencies", true],
    ]) {
      for (const spec of item[field] ?? []) {
        const dep = parseDependency(spec)
        if (!dep)
          throw new KitError(
            `${path.basename(file)}: незрозуміла залежність ${spec}`,
          )
        const known = deps.get(dep.name)
        // Діапазони кіта — з одного registry/package.json; різні — зіпсований реєстр.
        if (known && known.range !== dep.range)
          throw new KitError(
            `${dep.name}: у елементах різні діапазони (${known.range}, ${dep.range})`,
          )
        deps.set(dep.name, {
          range: dep.range,
          dev: (known?.dev ?? dev) && dev,
        })
      }
      delete item[field]
    }
    writeFileSync(file, JSON.stringify(item))
  }
  return deps
}

/**
 * Чи версія в діапазоні кіта, як у semver: `~` — та сама мажорна й мінорна, `^` — до першої
 * ненульової частини включно (^0.7.1 — 0.7.x), точна — та сама. Пререліз (`5.0.0-rc.1`) у
 * діапазон без пререлізу не входить. Незрозуміла версія чи діапазон — `undefined`.
 */
export function satisfiesRange(version, range) {
  const want = KIT_RANGE.exec(range ?? "")
  const have = /^(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(\+[\w.-]+)?$/.exec(
    version ?? "",
  )
  if (!want || !have) return undefined
  if (have[4]) return false
  const wanted = want.slice(2, 5).map(Number)
  const got = have.slice(1, 4).map(Number)
  const index = got.findIndex((part, i) => part !== wanted[i])
  if (index === -1) return true
  if (got[index] < wanted[index]) return false
  const fixed = { "~": 2, "^": wanted.findIndex(Boolean) + 1 || 3, "": 3 }[
    want[1]
  ]
  return index >= fixed
}

/** Діапазони залежностей проекту з усіх полів: назва → `{ field, range }`. */
const declaredDependencies = (pkg) =>
  new Map(
    [...DEPENDENCY_FIELDS]
      .reverse()
      .flatMap((field) =>
        Object.entries(pkg[field] ?? {}).map(([name, range]) => [
          name,
          { field, range },
        ]),
      ),
  )

/**
 * Що зробити з залежностями кіта: яких у `package.json` проекту немає — поставити з діапазоном
 * кіта; наявні лишаються як є (діапазон і версія проекту), а ті, чия встановлена версія не в
 * діапазоні кіта, не встановлена чи незрозуміла, — у `outside` для попередження.
 */
export function dependencyPlan(kitDeps, pkg, installedVersion) {
  const declared = declaredDependencies(pkg)
  const plan = { add: [], addDev: [], outside: [] }
  const names = [...kitDeps.keys()].sort((a, b) => (a < b ? -1 : 1))
  for (const name of names) {
    const { range, dev } = kitDeps.get(name)
    const project = declared.get(name)
    if (!project) {
      ;(dev ? plan.addDev : plan.add).push(`${name}@${range}`)
      continue
    }
    const version = installedVersion(name)
    if (satisfiesRange(version, range) !== true)
      plan.outside.push({ name, range, project: project.range, version })
  }
  return plan
}

/** Встановлена версія пакета (`node_modules/<назва>` у проекті чи вище — підняті), ні — `undefined`. */
export const installedVersion = (root) => (name) => {
  for (const dir of ancestors(root)) {
    const file = path.join(dir, "node_modules", name, "package.json")
    if (existsSync(file)) return readJson(file, `${name}/package.json`).version
  }
  return undefined
}

const outsideLine = ({ name, range, project, version }) =>
  version === undefined
    ? `${name}: у package.json ${project}, але не встановлено — встановіть залежності проекту`
    : `${name}: кіт чекає ${range}, у проекті ${project} (встановлено ${version}) — лишається версія проекту; якщо збірка чи тести впадуть, оновіть її самі`

/** Звіт перед записом: які залежності команда поставить і які версії проекту не в діапазоні кіта. */
export function printDependencyPlan(plan) {
  const added = [
    ...plan.add,
    ...plan.addDev.map((spec) => `${spec} (для розробки)`),
  ]
  console.log(
    added.length
      ? `Нові залежності: ${added.join(", ")}. Наявні в package.json — без змін.`
      : "Залежності: нових немає, наявні в package.json — без змін.",
  )
  for (const entry of plan.outside) console.log(`  ! ${outsideLine(entry)}`)
}

/**
 * Після оновлення — ще раз, щоб попередження не загубились у виводі `add`. Версії — поточні:
 * менеджер пакетів під час встановлення нових міг доставити й наявні.
 */
export function printDependencyWarnings(root, plan) {
  const version = installedVersion(root)
  const outside = plan.outside
    .map((entry) => ({ ...entry, version: version(entry.name) }))
    .filter((entry) => satisfiesRange(entry.version, entry.range) !== true)
  if (!outside.length) return
  console.warn(
    `\nУвага: ${String(outside.length)} залежн. проекту не в діапазоні кіта:`,
  )
  for (const entry of outside) console.warn(`  ! ${outsideLine(entry)}`)
}

/**
 * Перед записом (і в `--dry-run`): менеджер пакетів проекту — його lock-файл звіряємо після `add`;
 * якщо треба ставити залежності — він відомий і запускається (`--version`). Не визначено, а ставити
 * нічого — `undefined`.
 */
export async function packageManagerFor(root, plan) {
  const manager = detectPackageManager(root)
  if (!plan.add.length && !plan.addDev.length) return manager
  if (!manager)
    throw new KitError(
      `Не вдалося визначити менеджер пакетів (немає lock-файлу й поля packageManager у package.json), а поставити треба: ${[...plan.add, ...plan.addDev].join(", ")}`,
    )
  await mustRun(manager.name, ["--version"], { cwd: root, capture: true })
  return manager
}

const lockFilesIn = (dir) =>
  Object.values(PACKAGE_MANAGERS)
    .flatMap(({ locks }) => locks)
    .filter((lock) => existsSync(path.join(dir, lock)))

/** Стан файлів залежностей до `add`: `package.json`, lock-файл менеджера, lock-файли в корені. */
export function snapshotDependencies(root, manager) {
  const files = [path.join(root, "package.json"), manager?.lock].filter(Boolean)
  return {
    root,
    bytes: new Map(files.map((file) => [file, readFileSync(file)])),
    locks: lockFilesIn(root),
    declared: declaredDependencies(
      readJson(path.join(root, "package.json"), "package.json"),
    ),
  }
}

/**
 * Елементи без залежностей CLI 4.22 ставить без менеджера пакетів; змінений чи видалений `add`
 * файл залежностей — інша поведінка CLI, і мовчки йти далі не можна.
 */
export function assertDependenciesUntouched(snapshot) {
  const changed = [...snapshot.bytes].filter(
    ([file, bytes]) => !existsSync(file) || !readFileSync(file).equals(bytes),
  )
  if (changed.length)
    throw new KitError(
      `shadcn add змінив ${changed.map(([file]) => path.basename(file)).join(" і ")}, хоч залежностей в елементах немає (інша версія CLI?)`,
    )
}

/** Нові залежності кіта — менеджером пакетів проекту; наявні не чіпаємо. */
export async function installNewDependencies(root, plan, manager) {
  for (const [specs, dev] of [
    [plan.add, false],
    [plan.addDev, true],
  ]) {
    if (!specs.length) continue
    const [cmd, args] = addCommand(manager.name, specs, { dev })
    await mustRun(cmd, args, { cwd: root })
  }
}

/**
 * Після встановлення: діапазони, що були, — ті самі й у тих самих полях, нові — у `package.json` і
 * встановлені, чужого lock-файлу (інший менеджер) не з'явилось; свій може з'явитись уперше. Код
 * виходу менеджера — не доказ.
 */
export function verifyDependencies(snapshot, plan, manager) {
  const { root } = snapshot
  const now = declaredDependencies(
    readJson(path.join(root, "package.json"), "package.json"),
  )
  const problems = []
  for (const [name, before] of snapshot.declared) {
    const after = now.get(name)
    if (after?.range !== before.range || after.field !== before.field)
      problems.push(
        `${name}: було ${before.field} ${before.range}, стало ${after ? `${after.field} ${after.range}` : "немає"}`,
      )
  }
  const version = installedVersion(root)
  for (const spec of [...plan.add, ...plan.addDev]) {
    const { name } = parseDependency(spec)
    if (!now.has(name) || version(name) === undefined)
      problems.push(`${name}: не встановлено`)
  }
  const strayLocks = lockFilesIn(root).filter(
    (lock) =>
      !snapshot.locks.includes(lock) &&
      !PACKAGE_MANAGERS[manager.name].locks.includes(lock),
  )
  if (strayLocks.length)
    problems.push(
      `з'явився lock-файл іншого менеджера: ${strayLocks.join(", ")}`,
    )
  if (problems.length)
    throw new KitError(
      `Залежності після встановлення не такі, як треба:\n  ${problems.join("\n  ")}`,
    )
}
