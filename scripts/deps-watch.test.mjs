import assert from "node:assert/strict"
import { test } from "node:test"

import {
  auditFindings,
  formatAudit,
  formatDrift,
  versionDrift,
} from "./deps-watch.mjs"

const dep = (version) => ({ from: "x", version })

const BEFORE = [
  { name: "erp-ui", devDependencies: { shadcn: dep("4.23.0") } },
  {
    name: "@erp-ui/registry",
    dependencies: { "ra-core": dep("5.15.4"), zod: dep("4.6.6") },
    devDependencies: { msw: dep("3.0.3") },
  },
  {
    name: "@erp-ui/demo",
    dependencies: { "ra-core": dep("5.15.4"), "lucide-react": dep("1.55.0") },
  },
]

const AFTER = [
  { name: "erp-ui", devDependencies: { shadcn: dep("4.23.0") } },
  {
    name: "@erp-ui/registry",
    dependencies: { "ra-core": dep("5.15.7"), zod: dep("4.6.6") },
    devDependencies: { msw: dep("3.1.0") },
  },
  {
    name: "@erp-ui/demo",
    dependencies: {
      "ra-core": dep("5.15.7"),
      "lucide-react": dep("1.72.0"),
      "new-only-here": dep("1.0.0"),
    },
  },
]

test("версії без lock-файлу: пара «проект + пакет», один рядок на пакет і версію", () => {
  const { compared, rows } = versionDrift(BEFORE, AFTER)
  // shadcn, ra-core, zod і msw у реєстрі, ra-core і lucide-react у демо; new-only-here — лише з одного боку.
  assert.equal(compared, 6)
  assert.deepEqual(rows, [
    {
      name: "lucide-react",
      from: "1.55.0",
      to: "1.72.0",
      projects: ["@erp-ui/demo"],
    },
    { name: "msw", from: "3.0.3", to: "3.1.0", projects: ["@erp-ui/registry"] },
    {
      name: "ra-core",
      from: "5.15.4",
      to: "5.15.7",
      projects: ["@erp-ui/demo", "@erp-ui/registry"],
    },
  ])
})

test("новіша версія в одному проекті не ховається за такою самою старою в іншому", () => {
  const before = [
    { name: "a", dependencies: { zod: dep("4.6.6") } },
    { name: "b", dependencies: { zod: dep("4.7.0") } },
  ]
  const after = [
    { name: "a", dependencies: { zod: dep("4.7.0") } },
    { name: "b", dependencies: { zod: dep("4.7.0") } },
  ]
  assert.deepEqual(versionDrift(before, after).rows, [
    { name: "zod", from: "4.6.6", to: "4.7.0", projects: ["a"] },
  ])
})

test("вивід pnpm list не той — помилка, а не «змін немає»", () => {
  assert.throws(() => versionDrift(BEFORE, []), /жодної спільної/)
  assert.throws(() => versionDrift({ error: "x" }, AFTER), /не список проектів/)
})

test("без змін — окремий текст, зі змінами — таблиця з екрануванням", () => {
  assert.match(
    formatDrift(versionDrift(BEFORE, BEFORE)),
    /Порівняно прямих залежностей: 6\. Усі — ті самі/,
  )
  const table = formatDrift(versionDrift(BEFORE, AFTER))
  assert.match(table, /Новіші, ніж у lock-файлі кіта \(3\)/)
  assert.match(
    table,
    /\| ra-core \| 5\.15\.4 \| 5\.15\.7 \| @erp-ui\/demo, @erp-ui\/registry \|/,
  )
})

const AUDIT = {
  advisories: {
    1: {
      id: 1,
      module_name: "fast-uri",
      severity: "moderate",
      patched_versions: ">=3.1.9",
      github_advisory_id: "GHSA-w74x-v6f9-j3xg",
      title: "URI scheme spoofing",
      findings: [
        {
          version: "3.1.8",
          paths: [".>@hookform/resolvers>ajv>fast-uri", ".>ajv>fast-uri"],
        },
      ],
    },
    2: {
      id: 2,
      module_name: "decode-uri-component",
      severity: "high",
      patched_versions: ">=0.5.1",
      github_advisory_id: "GHSA-qr28-fpjm-wq7f",
      title: "Denial of service",
      findings: [
        { version: "0.2.2", paths: [".>ra-core>query-string>x"] },
        { version: "0.2.2", paths: [".>ra-core>query-string>x"] },
      ],
    },
  },
  metadata: { vulnerabilities: { high: 1, moderate: 1, low: 0 } },
}

test("знахідки аудиту — найважчі першими, з прямою залежністю, через яку прийшли", () => {
  const findings = auditFindings(AUDIT)
  assert.deepEqual(
    findings.map((f) => [f.severity, f.name, f.versions, f.via]),
    [
      ["high", "decode-uri-component", "0.2.2", ["ra-core"]],
      ["moderate", "fast-uri", "3.1.8", ["@hookform/resolvers", "ajv"]],
    ],
  )
  const table = formatAudit(findings)
  assert.match(table, /вразливостей 2/)
  assert.match(
    table,
    /\[GHSA-qr28-fpjm-wq7f\]\(https:\/\/github\.com\/advisories\/GHSA-qr28-fpjm-wq7f\)/,
  )
  assert.match(table, /окремим PR/)
})

test("опис із чужого звіту не ламає таблицю й не стає посиланням", () => {
  const title = "x \\| y [клік](https://evil.example) <b>`код`</b>\n::error::z"
  const [row] = formatAudit([
    { ...auditFindings(AUDIT)[0], title, id: "не-GHSA)(" },
  ])
    .split("\n")
    .filter((line) => line.startsWith("| high"))
  assert.ok(row)
  // Шість клітинок: усі `|` з опису екрановано.
  assert.equal(row.split(/(?<!\\)\|/).length, 8)
  assert.doesNotMatch(row, /(?<!\\)\[клік\]|(?<!\\)<b>|\n/)
  assert.doesNotMatch(row, /\]\(https/)
})

test("порожній аудит — «немає»; звіт без advisories чи з іншим лічильником — помилка", () => {
  const empty = { advisories: {}, metadata: { vulnerabilities: { high: 0 } } }
  assert.deepEqual(auditFindings(empty), [])
  assert.match(formatAudit([]), /вразливостей немає/)
  for (const broken of [
    { error: { code: "ERR_PNPM_AUDIT_BAD_RESPONSE" } },
    null,
    undefined,
    { advisories: [], metadata: { vulnerabilities: {} } },
    { advisories: {} },
  ])
    assert.throws(() => auditFindings(broken), /pnpm audit не дав звіту/)
  assert.throws(
    () =>
      auditFindings({
        advisories: {},
        metadata: { vulnerabilities: { high: 3 } },
      }),
    /знахідок 0, а за лічильником/,
  )
})
