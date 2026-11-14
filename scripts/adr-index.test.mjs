import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import { checkAdrDir, statusRefs } from "./adr-index.mjs"

const INDEX = `# Покажчик

| № | Рішення | Статус |
|---|---|---|
| [0001](0001-first.md) | Перше рішення з довшим описом \\| і рискою | прийнято |
| [0002](0002-second.md) | Друге | прийнято |

## Шаблон
`

function adrDir(files, index = INDEX) {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-adr-"))
  for (const [name, text] of Object.entries(files))
    writeFileSync(path.join(dir, name), text)
  writeFileSync(path.join(dir, "README.md"), index)
  return dir
}

const adr = (number, title, status, extra = "") =>
  `# ${number}. ${title}\n\n- Статус: ${status}\n- Дата: 14.11.2026\n${extra}\n## Контекст\n`

test("статус: «змінює» до кінця речення, решта посилань — доповнення", () => {
  const refs = statusRefs(
    "0048",
    "прийнято (змінює ADR-0004, п. 9; SPEC §3.3; доповнює ADR-0002 і ADR-0050)",
  )
  assert.deepEqual([...refs.changes], ["0004"])
  assert.deepEqual([...refs.extends], ["0002"])
  const mixed = statusRefs(
    "0076",
    "прийнято (змінює SPEC §3.3, ADR-0004 п. 8 і ADR-0020 п. 6–7; доповнює ADR-0029)",
  )
  assert.deepEqual([...mixed.changes].sort(), ["0004", "0020"])
  assert.deepEqual([...mixed.extends], ["0029"])
})

test("покажчик будується зі статусів: опис ручний, «доповнено» й «змінено» з файлів", () => {
  const dir = adrDir({
    "0001-first.md": adr(
      "0001",
      "Перше",
      "прийнято",
      "- Змінено: ADR-0003 п. 1 — інакше.\n",
    ),
    "0002-second.md": adr("0002", "Друге", "прийнято (доповнює\n  ADR-0001)"),
    "0003-third.md": adr(
      "0003",
      "Третє",
      "прийнято (змінює ADR-0001 п. 1; доповнює ADR-0002)",
    ),
  })
  try {
    const { problems, expected } = checkAdrDir(dir)
    assert.ok(
      problems.some((p) =>
        p.includes("у 0001-first.md є рядок «- Змінено: ADR-0003»"),
      ),
    )
    assert.ok(problems.some((p) => p.includes("README.md застарів")))
    assert.match(
      expected,
      /\| \[0001\]\(0001-first\.md\) \| Перше рішення з довшим описом \\\| і рискою \| прийнято; доповнено 0002; змінено 0003 \|/,
    )
    assert.match(
      expected,
      /\| \[0002\]\(0002-second\.md\) \| Друге \| прийнято; доповнено 0003 \|/,
    )
    assert.match(
      expected,
      /\| \[0003\]\(0003-third\.md\) \| Третє \| прийнято \|/,
    )
    assert.match(expected, /\n## Шаблон\n$/)
    writeFileSync(path.join(dir, "README.md"), expected)
    assert.deepEqual(checkAdrDir(dir).problems, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("«змінено» в покажчику без рядка у файлі — помилка в обидва боки", () => {
  const index = INDEX.replace(
    "| Друге | прийнято |",
    "| Друге | прийнято; змінено 0003 |",
  )
  const dir = adrDir(
    {
      "0001-first.md": adr("0001", "Перше", "прийнято"),
      "0002-second.md": adr("0002", "Друге", "прийнято"),
      "0003-third.md": adr("0003", "Третє", "прийнято (змінює ADR-0001 п. 2)"),
    },
    index,
  )
  try {
    const { problems } = checkAdrDir(dir)
    assert.ok(
      problems.some((p) =>
        p.includes("у ADR-0002 «змінено 0003», а в 0002-second.md немає рядка"),
      ),
    )
    assert.ok(
      problems.some((p) =>
        p.includes(
          "0003-third.md: статус змінює ADR-0001, а в 0001-first.md немає рядка",
        ),
      ),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("рядок «Змінено» лише від пізнішого й наявного ADR; статус і назва обов'язкові", () => {
  const dir = adrDir({
    "0001-first.md": adr(
      "0001",
      "Перше",
      "прийнято",
      "- Змінено: ADR-0009 — немає такого.\n",
    ),
    "0002-second.md": adr(
      "0002",
      "Друге",
      "чернетка",
      "- Змінено: ADR-0001 — раннє.\n",
    ),
  })
  try {
    const { problems } = checkAdrDir(dir)
    assert.ok(
      problems.some((p) =>
        p.includes(
          "0001-first.md: рядок «Змінено» називає ADR-0009, якого немає",
        ),
      ),
    )
    assert.ok(
      problems.some((p) =>
        p.includes(
          "0002-second.md: рядок «Змінено» називає ADR-0001, а змінити",
        ),
      ),
    )
    assert.ok(
      problems.some((p) => p.includes("0002-second.md: статус має починатися")),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
