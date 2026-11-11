/**
 * Цілісність `kit-files.json` для `scripts/erp-ui-kit.mjs` (ADR-0029, ADR-0078): контрольна сума
 * маніфесту, той самий тег з іншим умістом, файли-сироти й позначка локальної правки старого
 * правила (ADR-0076). Файл ставить `shadcn add` разом із командою: у проекті його не правте.
 */
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"

import { hashFile, isReleaseTag, sha256 } from "./erp-ui-kit-lib.mjs"

/**
 * Позначка старого правила в коментарі коду: `//` чи `/*`, далі `erp-ui:` і `local override`.
 * Markdown не перевіряємо: скіл і SPEC кіта цитують позначку як текст.
 */
const LOCAL_OVERRIDE = /(?:\/\/|\/\*)\s*erp-ui:\s*local override/

const short = (sha) => String(sha).slice(0, 12)

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
 * Маніфест змінили не командою (зник елемент, правлені відбитки): `check` зупиняється. Маніфест
 * старої команди без суми — лише нагадування: суму запише наступний `update`.
 */
export function checksumProblem(manifest, manifestName) {
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
 * (історію переписали) — лише попередження. `version` — `{ kit, sha, fingerprint }` нової версії.
 */
export function sameVersionProblem(manifest, version) {
  if (
    !isReleaseTag(version.kit) ||
    manifest.kit !== version.kit ||
    typeof manifest.sha !== "string" ||
    manifest.sha === version.sha
  )
    return undefined
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
 * Зупинки після звіту `--dry-run`, до запису: той самий тег з іншим умістом і файли з позначкою
 * локальної правки серед тих, що перезапишуться (`files` — звіт, без файлів проекту).
 */
export function stopsBeforeWrite(root, manifest, version, files) {
  const stops = []
  const sameVersion = sameVersionProblem(manifest, version)
  if (sameVersion) stops.push(sameVersion)
  const overrides = localOverrides(
    root,
    files
      .filter((file) => file.action === "overwrite")
      .map((file) => file.path),
  )
  if (overrides.length)
    stops.push({
      fatal: true,
      message: `Файли з позначкою local override update не перезаписує (ADR-0076: файли кіта в проекті не правляться): ${overrides.join(", ")}. Перенесіть правку в розширення, у кіт чи у свій компонент і поверніть файл кіта.`,
    })
  return stops
}

/**
 * Файли-сироти після оновлення до версії зі звіту `files`: були у версії кіта (відбитки старого
 * маніфесту чи сироти минулих оновлень), а в новій їх немає, і в проекті вони ще є. Шлях → відбиток
 * версії кіта.
 */
export function orphansAfter(root, manifest, files) {
  const newPaths = new Set(files.map((file) => file.path))
  const known = { ...manifest.orphans, ...manifest.files }
  return Object.fromEntries(
    Object.entries(known)
      .filter(
        ([file]) => !newPaths.has(file) && existsSync(path.join(root, file)),
      )
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  )
}

/** Сироти з маніфесту, які ще є в проекті (для `check`). */
export const presentOrphans = (root, manifest) =>
  Object.keys(manifest.orphans ?? {}).filter((file) =>
    existsSync(path.join(root, file)),
  )

/** Шлях із маніфесту всередині проекту: `--prune` не видаляє нічого поза ним. */
const insideRoot = (root, file) => {
  const relative = path.relative(root, path.resolve(root, file))
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  )
}

/**
 * `--prune`: сироти з відбитком версії кіта видаляє (`dryRun` — лише називає), змінені в проекті
 * лишає сиротами. Повертає видалені й ті, що лишились.
 */
export function pruneOrphans(root, orphans, { dryRun = false } = {}) {
  const hashOf = hashFile(root)
  const removed = []
  const kept = {}
  for (const [file, hash] of Object.entries(orphans)) {
    if (!insideRoot(root, file) || hashOf(file) !== hash) {
      kept[file] = hash
      continue
    }
    if (!dryRun) rmSync(path.join(root, file))
    removed.push(file)
  }
  return { removed, kept }
}

/** Сироти після запису оновлення; з `prune` незмінені видаляються, змінені лишаються сиротами. */
export function settleOrphans(root, manifest, files, prune) {
  const orphans = orphansAfter(root, manifest, files)
  if (!prune) return orphans
  const { removed, kept } = pruneOrphans(root, orphans)
  for (const file of removed) console.log(`  - ${file} — сироту видалено`)
  for (const file of Object.keys(kept))
    console.log(`  ? ${file} — сироту змінено в проекті, лишається`)
  return kept
}

/** `--dry-run --prune`: які сироти видалив би `--prune`. */
export function previewPrune(root, manifest, files) {
  const { removed } = pruneOrphans(root, orphansAfter(root, manifest, files), {
    dryRun: true,
  })
  console.log(
    removed.length
      ? `--prune видалить сироти: ${removed.join(", ")}`
      : "--prune: незмінених сиріт немає",
  )
}

/** Наприкінці звіту й у `check`: сироти не губляться в довгому виводі. */
export function printOrphans(files, ref = "<версія>") {
  if (!files.length) return
  console.warn(
    `\nФайли-сироти (у версії кіта їх немає, у проекті лишились): ${String(files.length)}`,
  )
  for (const file of files) console.warn(`  ? ${file}`)
  console.warn(
    `Приберіть імпорти з них і видаліть: update ${ref} --prune видалить ті, яких проект не змінював.`,
  )
}
