#!/usr/bin/env node
/**
 * Сценарій оновлення (ADR-0088): проект на попередньому тегу кіта з розширенням модуля й адаптером
 * оновлюється командою кіта до цього коміту, і проект компілюється й збирається.
 *
 *   node scripts/upgrade-smoke.mjs [--from-tag vX.Y.Z] [--keep]
 *
 * Проект тегу (за замовчуванням — найновіший `vX.Y.Z`; `scripts/upgrade-smoke-project.mjs`): шаблон
 * тестового проекту тегу, адаптер (`tests/consumer/upgrade`), `base` тегу як у посібнику, решта кіта
 * командою тегу (`--from` цієї копії, без GitHub), сирота сценарію в маніфесті. З нього два шляхи до
 * `HEAD`: (1) стара команда проекту, сироти — зі звіту; (2) команда цієї версії з тимчасової теки:
 * «Що зробити в проекті» у звіті, ті самі сироти в маніфесті, попередження `check`, `--prune`,
 * зупинка на позначці локальної правки. Після кожного — typecheck і збірка з файлами проекту тегу,
 * потім із файлами за шаблоном цієї версії, і `check`.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { isPlainRelativePath } from "../registry/tools/erp-ui-kit-lib.mjs"
import {
  buildProject,
  COMMAND,
  commandAt,
  commitAll,
  expect,
  fileAt,
  followProjectSteps,
  git,
  kit,
  markLocalOverride,
  MANIFEST,
  projectAt,
  readManifest,
  root,
  SMOKE_ORPHAN,
} from "./upgrade-smoke-project.mjs"

const args = process.argv.slice(2)
const keep = args.includes("--keep")
const fromTagAt = args.indexOf("--from-tag")

const RELEASE_TAG = /^v\d+\.\d+\.\d+$/
const ORPHAN_LINE = /^\s+\? (\S+) — у новій версії/gm
const PROJECT_STEPS = "Що зробити в проекті"
const GUARD_WARNING = "немає запобіжника VITE_BACKEND"
const MARKED_FILE = "src/components/ui/button.tsx"

/** `update` до цього коміту з цієї копії кіта. */
const toHead = (...extra) => ["update", "HEAD", "--from", root, ...extra]

/** Найновіший тег випуску (за версією), якщо не задано `--from-tag`. */
async function previousTag() {
  if (fromTagAt >= 0) {
    const fromTag = args[fromTagAt + 1] ?? ""
    expect(
      RELEASE_TAG.test(fromTag),
      `--from-tag «${fromTag}»: потрібен vX.Y.Z`,
    )
    return fromTag
  }
  const tags = await git(root, "tag", "--list", "v*", "--sort=-v:refname")
  const tag = tags.split("\n").find((name) => RELEASE_TAG.test(name))
  expect(tag, "у копії немає тегів vX.Y.Z (CI: fetch-depth: 0)")
  return tag
}

/**
 * Незалежно від команди кіта: чи є «Що зробити в проекті» в розділах `CHANGELOG.md` цього коміту,
 * новіших за тег. Якщо є, звіт мусить їх надрукувати, а не «нових розділів немає».
 */
async function projectStepsExpected(tag) {
  const changelog = await fileAt("HEAD", "CHANGELOG.md")
  const first = changelog.indexOf("\n## [")
  const tagSection = changelog.indexOf(`\n## [${tag.slice(1)}]`)
  expect(first >= 0 && tagSection >= 0, `у CHANGELOG.md немає розділу ${tag}`)
  return changelog.slice(first, tagSection).includes(PROJECT_STEPS)
}

/** У звіті — «Що зробити в проекті» з тегу до `HEAD`, і розділи з кроками, якщо вони є. */
function assertProjectSteps(output, tag, expected, what) {
  expect(
    output.includes(`${PROJECT_STEPS} (${tag} → HEAD@`),
    `${what}: немає «${PROJECT_STEPS}»`,
  )
  expect(
    !expected || output.includes(", CHANGELOG.md кіта):\n\n== "),
    `${what}: у CHANGELOG.md є «${PROJECT_STEPS}», а звіт їх не надрукував`,
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
  expect(
    orphans.includes(SMOKE_ORPHAN) && orphans.every(isPlainRelativePath),
    `сироти зі звіту старої команди: ${orphans.join(", ") || "жодної"}`,
  )
  for (const file of orphans) rmSync(path.join(dir, file))
  await buildProject(dir, "стара команда, файли проекту тегу")
  await followProjectSteps(dir, tag)
  await buildProject(dir, "стара команда, файли проекту цієї версії")
  await kit(dir, COMMAND, ["check"])
  return orphans
}

/** `check` попереджає про конфіг Vite без запобіжника: на час перевірки конфіг без нього. */
async function assertGuardWarning(dir) {
  const config = path.join(dir, "vite.config.ts")
  const original = readFileSync(config, "utf8")
  writeFileSync(config, "export default {}\n")
  try {
    const check = await kit(dir, COMMAND, ["check"])
    expect(
      check.includes(GUARD_WARNING),
      "check не попередив про конфіг без запобіжника",
    )
  } finally {
    writeFileSync(config, original)
  }
}

/** Шлях 2: команда цієї версії з тимчасової теки, `--prune`, позначка локальної правки. */
async function updateWithNewCommand(dir, tag, orphans) {
  console.log(`\n=== Шлях 2: оновлення ${tag} → HEAD командою цієї версії ===`)
  const script = await commandAt("HEAD", path.join(path.dirname(dir), "head"))
  const expected = await projectStepsExpected(tag)
  const dryRun = await kit(dir, script, toHead("--dry-run"))
  assertProjectSteps(dryRun, tag, expected, "--dry-run")
  const report = await kit(dir, script, toHead())
  assertProjectSteps(report, tag, expected, "звіт update")
  const manifest = readManifest(dir)
  expect(
    /^[0-9a-f]{40}$/.test(manifest.sha) &&
      manifest.fingerprint &&
      manifest.checksum,
    "маніфест без sha, fingerprint чи checksum",
  )
  const remembered = Object.keys(manifest.orphans).sort()
  expect(
    JSON.stringify(remembered) === JSON.stringify(orphans),
    `сироти маніфесту (${remembered.join(", ")}) — не ті, що назвала стара команда (${orphans.join(", ")})`,
  )
  const check = await kit(dir, COMMAND, ["check"])
  expect(check.includes("Файли-сироти"), "check не назвав сироти")
  await assertGuardWarning(dir)

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
    !after.includes(GUARD_WARNING),
    "check попереджає про запобіжник після «Що зробити в проекті»",
  )
  await commitAll(dir, "проект за «Що зробити в проекті»")
  await assertLocalOverrideStops(dir)
}

/** Файл кіта з позначкою локальної правки без відбитка: попередження в `--dry-run`, зупинка до запису. */
async function assertLocalOverrideStops(dir) {
  console.log("\n=== Позначка локальної правки зупиняє оновлення ===")
  const marked = markLocalOverride(dir, MARKED_FILE)
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
    stopped.includes("local override update не перезаписує") &&
      stopped.includes(MARKED_FILE),
    "update зупинився не на позначці",
  )
  expect(
    readFileSync(path.join(dir, MARKED_FILE), "utf8") === marked,
    `update змінив ${MARKED_FILE}`,
  )
  expect(
    !(await git(dir, "status", "--porcelain")).trim(),
    "update записав файли до зупинки",
  )
}

const temp = mkdtempSync(path.join(tmpdir(), "erp-ui-upgrade-"))
try {
  const tag = await previousTag()
  const dir = path.join(temp, "project")
  const head = (await git(root, "rev-parse", "HEAD")).trim()
  console.log(`Сценарій оновлення: проект на ${tag} → цей коміт (${head})`)
  await projectAt(tag, dir, temp)
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
