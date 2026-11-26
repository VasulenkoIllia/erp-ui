#!/usr/bin/env node
/**
 * Сторож свіжих версій (ADR-0102, `.github/workflows/deps-watch.yml`): що новий проект дістане новішим, ніж у
 * lock-файлі кіта, і чи немає вразливостей у залежностях застосунку. Нічого не оновлює: знайдене називає, а
 * оновлення діапазону чи lock-файлу — окремим PR.
 *
 *   node scripts/deps-watch.mjs drift <до.json> <після.json>   # прямі залежності, що дістали іншу версію
 *
 * `до.json` і `після.json` — `pnpm list -r --depth 0 --json` з lock-файлом кіта й після встановлення без нього.
 * Аудит чистого проекту (`auditProject`) кличе `consumer-smoke --audit`. Звіт — Markdown у stdout, у CI ще й у
 * підсумок прогону (`$GITHUB_STEP_SUMMARY`). Вивід pnpm незнайомого вигляду — помилка, а не «змін немає» чи «чисто».
 */
import { appendFileSync } from "node:fs"

import { readJson, run } from "../registry/tools/erp-ui-kit-lib.mjs"

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
]
const SEVERITY_ORDER = ["critical", "high", "moderate", "low", "info"]
const AUDIT_TIMEOUT_MS = 2 * 60_000
/** Скільки чужого виводу показати в помилці. */
const QUOTE_LIMIT = 2000

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
/** Чужий вивід у помилці — одним рядком JSON: рядок `::…` з нього не стане командою раннера. */
const quote = (value) =>
  String(JSON.stringify(value) ?? value).slice(0, QUOTE_LIMIT)

/** Текст у клітинці таблиці Markdown: без розриву рядка, розмітка й `|` — буквально. */
const cell = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\\`*_[\]()<>!|#~]/g, "\\$&")
const advisoryLink = (id) =>
  /^GHSA(?:-[0-9a-z]{4}){3}$/i.test(id)
    ? `[${id}](https://github.com/advisories/${id})`
    : cell(id)

/** Прямі залежності з виводу `pnpm list --json`: «проект\0пакет» → версія. */
function directVersions(projects, what) {
  if (!Array.isArray(projects))
    throw new Error(
      `${what}: не список проектів pnpm list — ${quote(projects)}`,
    )
  const versions = new Map()
  for (const project of projects)
    for (const field of DEPENDENCY_FIELDS)
      for (const [name, dep] of Object.entries(project?.[field] ?? {}))
        if (typeof dep?.version === "string")
          versions.set(`${String(project.name)}\0${name}`, dep.version)
  return versions
}

/**
 * Прямі залежності проектів воркспейсу, що без lock-файлу дістали іншу версію: `{ compared, rows }`, рядок —
 * `{ name, from, to, projects }`. Порівнюємо пару «проект + пакет»; пакет, якого немає з одного боку, не враховуємо:
 * склад залежностей задає `package.json`, а не lock-файл. Жодної спільної пари — помилка: вивід не той.
 */
export function versionDrift(before, after) {
  const was = directVersions(before, "версії з lock-файлом")
  const groups = new Map()
  let compared = 0
  for (const [key, to] of directVersions(after, "версії без lock-файлу")) {
    const from = was.get(key)
    if (from === undefined) continue
    compared++
    if (from === to) continue
    const [project = "", name = ""] = key.split("\0")
    const group = `${name}\0${from}\0${to}`
    const row = groups.get(group) ?? { name, from, to, projects: [] }
    row.projects.push(project)
    groups.set(group, row)
  }
  if (!compared)
    throw new Error(
      "Версії з lock-файлом і без нього не мають жодної спільної залежності: вивід pnpm list не той",
    )
  const rows = [...groups.values()]
    .map((row) => ({ ...row, projects: row.projects.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.to.localeCompare(b.to))
  return { compared, rows }
}

export function formatDrift({ compared, rows }) {
  const checked = `Порівняно прямих залежностей: ${String(compared)}.`
  if (!rows.length)
    return `### Версії без lock-файлу кіта\n\n${checked} Усі — ті самі, що в lock-файлі кіта.\n`
  return [
    `### Новіші, ніж у lock-файлі кіта (${String(rows.length)})`,
    "",
    `${checked} Так їх дістане новий проект; typecheck, тести й збірка нижче — на цих версіях.`,
    "",
    "| Пакет | Lock-файл кіта | Без lock-файлу | Де |",
    "|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${cell(row.name)} | ${cell(row.from)} | ${cell(row.to)} | ${cell(row.projects.join(", "))} |`,
    ),
    "",
  ].join("\n")
}

/** Знахідка звіту: рівень, пакет, версії, виправлення, ідентифікатор, опис і прямі залежності, через які прийшла. */
function finding(advisory) {
  const found = Array.isArray(advisory?.findings) ? advisory.findings : []
  const paths = found.flatMap((item) =>
    Array.isArray(item?.paths) ? item.paths.map(String) : [],
  )
  return {
    severity: String(advisory?.severity ?? "unknown"),
    name: String(advisory?.module_name ?? "?"),
    versions: [...new Set(found.map((item) => String(item?.version)))]
      .sort()
      .join(", "),
    patched: String(advisory?.patched_versions ?? "?"),
    id: String(advisory?.github_advisory_id ?? advisory?.id ?? "?"),
    title: String(advisory?.title ?? ""),
    // Пряма залежність проекту — другий сегмент шляху `.>ra-core>query-string>…`.
    via: [...new Set(paths.map((p) => p.split(">")[1] ?? p))].sort(),
  }
}

/**
 * Знахідки зі звіту `pnpm audit --json`, найважчі першими. Звіт без `advisories` чи з іншим числом, ніж у
 * `metadata.vulnerabilities` (мережа, інший формат), — помилка, а не «вразливостей немає».
 */
export function auditFindings(auditReport) {
  const counts = auditReport?.metadata?.vulnerabilities
  if (!isObject(auditReport?.advisories) || !isObject(counts))
    throw new Error(`pnpm audit не дав звіту: ${quote(auditReport)}`)
  const advisories = Object.values(auditReport.advisories)
  const total = Object.values(counts).reduce(
    (sum, count) => sum + (Number.isInteger(count) ? count : NaN),
    0,
  )
  if (total !== advisories.length)
    throw new Error(
      `pnpm audit: знахідок ${String(advisories.length)}, а за лічильником ${quote(counts)} — інший формат звіту`,
    )
  const rank = (severity) => {
    const index = SEVERITY_ORDER.indexOf(severity)
    return index === -1 ? SEVERITY_ORDER.length : index
  }
  return advisories
    .map(finding)
    .sort(
      (a, b) =>
        rank(a.severity) - rank(b.severity) || a.name.localeCompare(b.name),
    )
}

export function formatAudit(findings) {
  if (!findings.length)
    return "### pnpm audit --prod\n\nУ залежностях застосунку вразливостей немає.\n"
  return [
    `### pnpm audit --prod: вразливостей ${String(findings.length)}`,
    "",
    "Не оновлено: оновлення діапазону чи lock-файлу — окремим PR (ADR-0102).",
    "",
    "| Рівень | Пакет | Версії | Виправлено в | Через | Опис |",
    "|---|---|---|---|---|---|",
    ...findings.map(
      (f) =>
        `| ${cell(f.severity)} | ${cell(f.name)} | ${cell(f.versions)} | ${cell(f.patched)} | ${cell(f.via.join(", "))} | ${advisoryLink(f.id)} ${cell(f.title)} |`,
    ),
    "",
  ].join("\n")
}

/** Звіт — у stdout і, в CI, у підсумок прогону. */
function publish(markdown) {
  console.log(markdown)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) appendFileSync(summary, `${markdown}\n`)
}

/** `pnpm audit --prod` у теці проекту: називає знайдене й повертає, чи чисто. Збій самого аудиту — виняток. */
export async function auditProject(dir) {
  const result = await run("pnpm", ["audit", "--prod", "--json"], {
    cwd: dir,
    capture: true,
    timeoutMs: AUDIT_TIMEOUT_MS,
  })
  if (result.timedOut)
    throw new Error(
      `pnpm audit не відповів за ${String(AUDIT_TIMEOUT_MS / 60_000)} хв`,
    )
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    throw new Error(
      `pnpm audit (код ${String(result.code)}) дав не JSON: ${quote(`${result.stdout}${result.stderr}`)}`,
    )
  }
  const findings = auditFindings(parsed)
  publish(formatAudit(findings))
  return findings.length === 0
}

function main() {
  const [command, before, after, ...extra] = process.argv.slice(2)
  if (command !== "drift" || !before || !after || extra.length) {
    console.error("node scripts/deps-watch.mjs drift <до.json> <після.json>")
    process.exitCode = 2
    return
  }
  publish(
    formatDrift(
      versionDrift(
        readJson(before, "версії з lock-файлом"),
        readJson(after, "версії без lock-файлу"),
      ),
    ),
  )
}

if (import.meta.main) main()
