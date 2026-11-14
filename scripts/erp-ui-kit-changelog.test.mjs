/**
 * «Що зробити в проекті» між версіями з CHANGELOG кіта (ADR-0088): вибір розділів за версіями й
 * обидві форми запису — вступ випуску й пункти `Unreleased`; на справжньому CHANGELOG.md.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { projectSteps } from "../registry/tools/erp-ui-kit-changelog.mjs"

const CHANGELOG = `# Changelog

Вступ файла: Що зробити в проекті — не розділ версії.

## [Unreleased]

### Додано

- Нове.
- **Що зробити в проекті** (нове). крок main

## [1.10.0] — 2026-11-20

Оновлення з v1.9.0. Що зробити в проекті:

- крок 1.10

### Додано

- **Що зробити в проекті** (ще). крок 1.10 у підрозділі

## [1.9.0] — 2026-11-10

Без кроків.

### Змінено

- Щось.

## [1.2.0] — 2026-11-01

Що зробити в проекті: крок 1.2
`

const versions = (sections) => sections.map(({ version }) => version)

test("тег: розділи після версії проекту до нового тегу включно, від старшого; без кроків — пропущено", () => {
  const sections = projectSteps(CHANGELOG, "v1.2.0", "v1.10.0")
  assert.deepEqual(versions(sections), ["1.10.0"])
  assert.equal(
    sections[0].steps,
    "Оновлення з v1.9.0. Що зробити в проекті:\n\n- крок 1.10\n- **Що зробити в проекті** (ще). крок 1.10 у підрозділі",
  )
  // 1.10 > 1.9 числами, а не рядком.
  assert.deepEqual(versions(projectSteps(CHANGELOG, "v1.9.0", "v1.10.0")), [
    "1.10.0",
  ])
  assert.deepEqual(projectSteps(CHANGELOG, "v1.10.0", "v1.10.0"), [])
})

test("гілка чи коміт: усі новіші за версію проекту й ще не випущене, останнім", () => {
  const sections = projectSteps(CHANGELOG, "v1.0.0", "main@0123456789ab")
  assert.deepEqual(versions(sections), ["1.2.0", "1.10.0", "Unreleased"])
  assert.equal(sections[0].steps, "Що зробити в проекті: крок 1.2")
  assert.equal(
    sections[2].steps,
    "- **Що зробити в проекті** (нове). крок main",
  )
})

test("версія проекту не тег — звірити нема з чим", () => {
  assert.equal(
    projectSteps(CHANGELOG, "main@0123456789ab", "v1.10.0"),
    undefined,
  )
  assert.equal(projectSteps(CHANGELOG, undefined, "v1.10.0"), undefined)
})

test("справжній CHANGELOG.md: з v1.2.0 до v1.3.0 — вступ випуску з кроками", () => {
  const changelog = readFileSync(
    new URL("../CHANGELOG.md", import.meta.url),
    "utf8",
  )
  const [section, ...rest] = projectSteps(changelog, "v1.2.0", "v1.3.0")
  assert.equal(rest.length, 0)
  assert.equal(section.version, "1.3.0")
  assert.match(
    section.steps,
    /^Оновлення з v1\.2\.0: [^]*Що зробити в проекті:\n\n- \*\*Node 26\.\*\*/,
  )
  assert.doesNotMatch(section.steps, /### /)
})
