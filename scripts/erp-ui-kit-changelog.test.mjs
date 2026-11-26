/**
 * «Що зробити в проекті» між версіями з CHANGELOG кіта (ADR-0088): вибір розділів за версіями й
 * обидві форми запису — вступ випуску й пункти `Unreleased`; на справжньому CHANGELOG.md.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  printProjectSteps,
  projectSteps,
} from "../registry/tools/erp-ui-kit-changelog.mjs"
import {
  forTerminal,
  specialArchiveEntries,
} from "../registry/tools/erp-ui-kit-lib.mjs"

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

## [1.4.0-rc.1] — 2026-11-05

Що зробити в проекті: крок пререлізу

## [1.2.0] — 2026-11-01

Що зробити в проекті: крок 1.2
`

const versions = (sections) => sections.map(({ version }) => version)

test("тег: розділи після версії проекту до нового тегу включно, від старшого; без кроків — порожні", () => {
  const sections = projectSteps(CHANGELOG, "v1.2.0", "v1.10.0")
  assert.deepEqual(versions(sections), ["1.9.0", "1.10.0"])
  assert.equal(sections[0].steps, "")
  assert.equal(
    sections[1].steps,
    "Оновлення з v1.9.0. Що зробити в проекті:\n\n- крок 1.10\n- **Що зробити в проекті** (ще). крок 1.10 у підрозділі",
  )
  // 1.10 > 1.9 числами, а не рядком.
  assert.deepEqual(versions(projectSteps(CHANGELOG, "v1.9.0", "v1.10.0")), [
    "1.10.0",
  ])
  assert.deepEqual(projectSteps(CHANGELOG, "v1.10.0", "v1.10.0"), [])
})

test("гілка чи коміт: усі новіші за версію проекту й ще не випущене, останнім; пререліз — ні", () => {
  const sections = projectSteps(CHANGELOG, "v1.0.0", "main@0123456789ab")
  assert.deepEqual(versions(sections), [
    "1.2.0",
    "1.9.0",
    "1.10.0",
    "Unreleased",
  ])
  // Заголовок пререлізу закриває розділ 1.9.0: його рядки туди не потрапляють.
  assert.equal(sections[1].steps, "")
  assert.equal(sections[0].steps, "Що зробити в проекті: крок 1.2")
  assert.equal(
    sections[3].steps,
    "- **Що зробити в проекті** (нове). крок main",
  )
})

/** Вивід `printProjectSteps` рядком. */
function printed(...args) {
  const lines = []
  const log = console.log
  console.log = (line) => lines.push(line)
  try {
    printProjectSteps(...args)
  } finally {
    console.log = log
  }
  return lines.join("\n")
}

test("друк: кроки з розділами, розділи без кроків названо, керівні символи прибрано; перше встановлення — нічого", () => {
  const text = printed(
    CHANGELOG.replace("крок 1.10\n", "крок 1.10\u001b[1A\u001b[2K\n"),
    "v1.2.0",
    "v1.10.0",
  )
  assert.match(
    text,
    /^\nЩо зробити в проекті \(v1\.2\.0 → v1\.10\.0, CHANGELOG\.md кіта\):\n\n== v1\.10\.0 ==\n/,
  )
  assert.match(text, /- крок 1\.10\n/)
  assert.ok(!text.includes("\u001b"))
  assert.match(
    text,
    /Без пункту «Що зробити в проекті»: v1\.9\.0 — перегляньте/,
  )
  assert.match(
    printed(CHANGELOG, "v1.10.0", "v1.10.0"),
    /нових розділів у CHANGELOG\.md немає/,
  )
  assert.equal(printed(CHANGELOG, undefined, "v1.10.0"), "")
})

test("перелік tar: посилання й пристрої — особливі; жорстке посилання bsdtar із розміром — теж", () => {
  const listing = [
    "drwxr-xr-x  0 u g     0 Nov 14 17:41 kit/",
    "-rw-r--r-- u/g      2 2026-11-14 17:41 kit/a.ts",
    "lrwxrwxrwx u/g      0 2026-11-14 17:41 kit/l -> /etc/passwd",
    "hrw-r--r-- u/g      0 2026-11-14 17:41 kit/h link to kit/a.ts",
    "-rw-r--r--  0 u g     2 Nov 14 17:41 kit/h2 link to kit/a.ts",
    "crw-r--r-- u/g    1,3 2026-11-14 17:41 kit/null",
    "",
  ].join("\n")
  assert.deepEqual(
    specialArchiveEntries(listing).map((line) => line.split(" ").at(-1)),
    ["/etc/passwd", "kit/a.ts", "kit/a.ts", "kit/null"],
  )
})

test("forTerminal: без керівних послідовностей і символів, табуляція й новий рядок лишаються", () => {
  assert.equal(
    forTerminal("a\u001b[2K\u001b]52;c;eA==\u0007b\tc\nd\re\u0085f"),
    "ab\tc\ndef",
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

// Випуски з v1.4.0: кроки лише у вступі (ADR-0088). Новий випуск — рядок тут: перший пункт його вступу.
const RELEASES_WITH_STEPS_IN_INTRO = [
  { from: "1.3.0", to: "1.4.0", firstStep: "Команда оновлення." },
  { from: "1.4.0", to: "1.5.0", firstStep: "Рядки функцій кіта" },
  { from: "1.5.0", to: "1.6.0", firstStep: "CLI shadcn 4.23.0" },
]

for (const { from, to, firstStep } of RELEASES_WITH_STEPS_IN_INTRO) {
  test(`справжній CHANGELOG.md: з v${from} до v${to} — кроки лише у вступі, без повтору з підрозділів`, () => {
    const changelog = readFileSync(
      new URL("../CHANGELOG.md", import.meta.url),
      "utf8",
    )
    const [section, ...rest] = projectSteps(changelog, `v${from}`, `v${to}`)
    assert.equal(rest.length, 0)
    assert.equal(section.version, to)
    assert.ok(
      section.steps.startsWith(`Оновлення з v${from}: `),
      section.steps.slice(0, 80),
    )
    assert.ok(
      section.steps.includes(`Що зробити в проекті:\n\n- **${firstStep}**`),
      `перший крок «${firstStep}»`,
    )
    assert.doesNotMatch(
      section.steps,
      /### |- \*\*Що зробити в проекті|vX\.Y\.Z/,
    )
    const bullets = section.steps
      .split("\n")
      .filter((line) => line.startsWith("- **"))
    assert.equal(new Set(bullets).size, bullets.length)
  })
}
