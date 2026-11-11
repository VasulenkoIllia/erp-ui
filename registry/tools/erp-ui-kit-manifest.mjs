/**
 * Цілісність `kit-files.json` для `scripts/erp-ui-kit.mjs` (ADR-0029, ADR-0078): контрольна сума
 * маніфесту, той самий тег з іншим умістом, файли-сироти й позначка локальної правки старого
 * правила (ADR-0076). Файл ставить `shadcn add` разом із командою: у проекті його не правте.
 */
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"

import {
  hashFile,
  isPlainRelativePath,
  isRegularFileInside,
  isReleaseTag,
  sha256,
} from "./erp-ui-kit-lib.mjs"

/**
 * Позначка старого правила в коментарі коду: `//`, `/*` чи рядок `*` блокового коментаря, далі
 * `erp-ui:` і `local override`. Markdown не перевіряємо: скіл і SPEC кіта цитують позначку як текст.
 */
const LOCAL_OVERRIDE = /(?:\/\/|\/\*+|^\s*\*)\s*erp-ui:\s*local override/m
const FILE_HASH = /^[0-9a-f]{64}$/
const COMMIT_SHA = /^[0-9a-f]{40}$/
/** Шляхи, яких у маніфесті не буває: git і залежності. */
const FOREIGN_PATH = /^(?:\.git|node_modules)(?:\/|$)/
/** Поля, які пише лише команда з контрольною сумою: без суми поруч із ними маніфест правили руками. */
const CHECKSUMMED_FIELDS = ["sha", "fingerprint", "orphans"]

const short = (sha) => String(sha).slice(0, 12)

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Шлях → відбиток: лише відносні шляхи проекту (не git, не залежності, не маніфест) і sha256. */
const isHashMap = (value, manifestName) =>
  isObject(value) &&
  Object.entries(value).every(
    ([file, hash]) =>
      isPlainRelativePath(file) &&
      !FOREIGN_PATH.test(file) &&
      file !== manifestName &&
      typeof hash === "string" &&
      FILE_HASH.test(hash),
  )

/** Що не так із формою маніфесту (його читає й `--prune`, тож шляхи — лише всередині проекту). */
export function manifestShapeProblem(manifest, manifestName) {
  if (!isObject(manifest) || !isObject(manifest.files))
    return `${manifestName}: немає відбитків файлів (files)`
  if (
    manifest.items !== undefined &&
    !(
      Array.isArray(manifest.items) &&
      manifest.items.every((item) => typeof item === "string")
    )
  )
    return `${manifestName}: items — не список назв елементів`
  for (const field of ["files", "own", "orphans"])
    if (
      manifest[field] !== undefined &&
      !isHashMap(manifest[field], manifestName)
    )
      return `${manifestName}: ${field} — лише відносні шляхи проекту з відбитками sha256`
  if (manifest.sha !== undefined && !COMMIT_SHA.test(String(manifest.sha)))
    return `${manifestName}: sha — не SHA коміту`
  if (
    manifest.fingerprint !== undefined &&
    !FILE_HASH.test(String(manifest.fingerprint))
  )
    return `${manifestName}: fingerprint — не sha256`
  return undefined
}

/** Ключі об'єктів за абеткою на кожному рівні: та сама сума незалежно від порядку полів у файлі. */
const sortedKeys = (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)),
      )
    : value

/** Контрольна сума маніфесту: усі поля, крім неї самої. */
export function manifestChecksum(manifest) {
  const fields = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== "checksum"),
  )
  return sha256(JSON.stringify(fields, sortedKeys))
}

export const withChecksum = (manifest) => ({
  ...manifest,
  checksum: manifestChecksum(manifest),
})

/**
 * Маніфест змінили не командою (зник елемент, правлені відбитки): `check` зупиняється. Це захист від
 * випадкової правки, а не від підробки: суму може перерахувати будь-хто. Маніфест старої команди без
 * суми — лише нагадування: суму запише наступний `update`.
 */
export function checksumProblem(manifest, manifestName) {
  if (
    manifest.checksum === undefined &&
    CHECKSUMMED_FIELDS.some((field) => manifest[field] !== undefined)
  )
    return {
      fatal: true,
      message: `${manifestName} без контрольної суми, хоч його записала команда із сумою (є ${CHECKSUMMED_FIELDS.join(", ")}): поверніть його з git (git checkout -- ${manifestName})`,
    }
  if (manifest.checksum === undefined)
    return {
      fatal: false,
      message: `${manifestName} без контрольної суми (записала попередня версія команди): її запише наступний update`,
    }
  if (manifest.checksum !== manifestChecksum(manifest))
    return {
      fatal: true,
      message: `${manifestName} змінено не командою кіта (контрольна сума не збігається): випадково — поверніть його з git (git checkout -- ${manifestName}); навмисно (прибрали елемент зі списку items) — запустіть update <версія>, він запише нову суму`,
    }
  return undefined
}

/**
 * Той самий тег випуску, інший коміт: інший уміст — тег пересунули, зупинка; той самий уміст
 * (історію переписали) — лише попередження. SHA минулого встановлення не записано (його ставила
 * попередня версія команди) — звірити нема з чим, людині — з чим звірити самій. `version` —
 * `{ kit, sha, fingerprint }` нової версії.
 */
export function sameVersionProblem(manifest, version) {
  if (
    !isReleaseTag(version.kit) ||
    manifest.kit !== version.kit ||
    manifest.sha === version.sha
  )
    return undefined
  if (manifest.sha === undefined)
    return {
      fatal: false,
      message: `SHA минулого встановлення ${version.kit} не записано, звірити не можу: порівняйте коміт ${version.sha} з рядком «Коміт тегу» цієї версії в CHANGELOG.md на main у GitHub`,
    }
  const commits = `коміт ${short(manifest.sha)} → ${short(version.sha)}`
  if (manifest.fingerprint === version.fingerprint)
    return {
      fatal: false,
      message: `Тег ${version.kit} тепер на іншому коміті (${commits}), але вміст реєстру той самий`,
    }
  return {
    fatal: true,
    message: `Тег ${version.kit}: та сама версія, інший вміст (${commits}). Тег пересунули: не оновлюйтесь до нього, спитайте автора кіта; SHA випуску — у CHANGELOG.md кіта`,
  }
}

/**
 * Файли, які `update` перезапише, з позначкою локальної правки старого правила (ADR-0076): правку
 * спершу переносять у розширення, у кіт чи у свій компонент, файл повертають.
 */
export function localOverrides(root, files) {
  return files.filter((file) => {
    const full = path.join(root, file)
    return (
      !file.endsWith(".md") &&
      existsSync(full) &&
      LOCAL_OVERRIDE.test(readFileSync(full, "utf8"))
    )
  })
}

/**
 * Зупинки після звіту `--dry-run`, до запису: той самий тег з іншим умістом, файли з позначкою
 * локальної правки й змінені в проекті сироти, які нова версія повертає й перезапише (`files` —
 * звіт, без файлів проекту).
 */
export function stopsBeforeWrite(root, manifest, version, files) {
  const stops = []
  const sameVersion = sameVersionProblem(manifest, version)
  if (sameVersion) stops.push(sameVersion)
  const overwritten = files
    .filter((file) => file.action === "overwrite")
    .map((file) => file.path)
  const overrides = localOverrides(root, overwritten)
  if (overrides.length)
    stops.push({
      fatal: true,
      message: `Файли з позначкою local override update не перезаписує (ADR-0076: файли кіта в проекті не правляться): ${overrides.join(", ")}. Перенесіть правку в розширення, у кіт чи у свій компонент і поверніть файл кіта.`,
    })
  const hashOf = hashFile(root)
  const returning = Object.entries(manifest.orphans ?? {})
    .filter(
      ([file, hash]) => overwritten.includes(file) && hashOf(file) !== hash,
    )
    .map(([file]) => file)
  if (returning.length)
    stops.push({
      fatal: true,
      message: `Сироти, змінені в проекті, нова версія кіта поверне й перезапише: ${returning.join(", ")}. Перенесіть зміни у свій файл під іншою назвою й поверніть версію кіта.`,
    })
  return stops
}

/**
 * Файли-сироти після оновлення до версії зі звіту `files`: були у версії кіта (відбитки старого
 * маніфесту чи сироти минулих оновлень), а в новій їх немає, і в проекті вони ще є. Шлях → відбиток
 * версії кіта. Шлях, що в новій версії лише змінив регістр, — не сирота: на macOS і Windows це той
 * самий файл.
 */
export function orphansAfter(root, manifest, files) {
  const newPaths = new Set(files.map((file) => file.path.toLowerCase()))
  const known = { ...manifest.orphans, ...manifest.files }
  return Object.fromEntries(
    Object.entries(known)
      .filter(
        ([file]) =>
          !newPaths.has(file.toLowerCase()) &&
          existsSync(path.join(root, file)),
      )
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  )
}

/** Сироти з маніфесту, які ще є в проекті (для `check`). */
export const presentOrphans = (root, manifest) =>
  Object.keys(manifest.orphans ?? {}).filter((file) =>
    existsSync(path.join(root, file)),
  )

/**
 * `--prune`: видаляє сироти з відбитком версії кіта, лише звичайні файли всередині проекту, які
 * відстежує git (`isTracked`; їх повертає `git restore`). Решта лишаються сиротами; `dryRun` — лише
 * називає. Повертає видалені й ті, що лишились.
 */
export function pruneOrphans(
  root,
  orphans,
  isTracked,
  { dryRun = false } = {},
) {
  const hashOf = hashFile(root)
  const removed = []
  const kept = {}
  for (const [file, hash] of Object.entries(orphans)) {
    const removable =
      isPlainRelativePath(file) &&
      isTracked(file) &&
      isRegularFileInside(root, file) &&
      hashOf(file) === hash
    if (!removable) {
      kept[file] = hash
      continue
    }
    if (!dryRun) rmSync(path.resolve(root, file))
    removed.push(file)
  }
  return { removed, kept }
}

/** Сироти після запису оновлення; з `isTracked` (`--prune`) — видалити, що можна. */
export function settleOrphans(root, orphans, isTracked) {
  if (!isTracked) return orphans
  const { removed, kept } = pruneOrphans(root, orphans, isTracked)
  for (const file of removed) console.log(`  - ${file} — сироту видалено`)
  for (const file of Object.keys(kept))
    console.log(
      `  ? ${file} — сироту не видаляю: змінено в проекті, не під git чи не звичайний файл`,
    )
  return kept
}

/** `--dry-run --prune`: які сироти видалив би `--prune`. */
export function previewPrune(root, orphans, isTracked) {
  const { removed } = pruneOrphans(root, orphans, isTracked, { dryRun: true })
  console.log(
    removed.length
      ? `--prune видалить сироти: ${removed.join(", ")}`
      : "--prune: сиріт, які можна видалити, немає",
  )
}

/**
 * Наприкінці звіту й у `check`: сироти не губляться в довгому виводі. Після `--prune` лишились ті,
 * яких він не видаляє.
 */
export function printOrphans(files, { kit, pruned = false } = {}) {
  if (!files.length) return
  console.warn(
    `\nФайли-сироти (у версії кіта їх немає, у проекті лишились): ${String(files.length)}`,
  )
  for (const file of files) console.warn(`  ? ${file}`)
  const ref = isReleaseTag(kit) ? kit : "<версія>"
  console.warn(
    pruned
      ? "Їх --prune не видаляє: перенесіть потрібне у свій файл під іншою назвою й видаліть сироту сам."
      : `Приберіть імпорти з них і видаліть: update ${ref} --prune видалить ті, яких проект не змінював.`,
  )
}
