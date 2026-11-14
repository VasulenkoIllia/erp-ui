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

const adr = (number, title, status, extra = "", body = "") =>
  `# ${number}. ${title}\n\n- Статус: ${status}\n- Дата: 14.11.2026\n${extra}\n## Контекст\n${body}`

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

test("«змінює» тримається через `;` і вкладені дужки, до «доповнює»", () => {
  const nested = statusRefs(
    "0050",
    "прийнято (змінює ADR-0004 (п. 8) і ADR-0020; SPEC §3)",
  )
  assert.deepEqual([...nested.changes].sort(), ["0004", "0020"])
  const semicolon = statusRefs(
    "0050",
    "прийнято (змінює ADR-0004 п. 8; ADR-0020 п. 6; доповнює ADR-0030)",
  )
  assert.deepEqual([...semicolon.changes].sort(), ["0004", "0020"])
  assert.deepEqual([...semicolon.extends], ["0030"])
  const outside = statusRefs(
    "0050",
    "прийнято (змінює ADR-0004); посилання на ADR-0010",
  )
  assert.deepEqual([...outside.changes], ["0004"])
  assert.deepEqual([...outside.extends], ["0010"])
  assert.deepEqual(
    [...statusRefs("0050", "прийнято (змінює ADR-0095)").forward],
    ["0095"],
  )
  assert.deepEqual(
    [...statusRefs("0050", "прийнято; доповнено ADR-0060 (приклад)").extends],
    [],
  )
})

test("дубль номера, файл поза шаблоном, «змінює» пізніше й «замінено» без ADR — помилки, а не пропуск", () => {
  const dir = adrDir({
    "0001-first.md": adr("0001", "Перше", "замінено 0009"),
    "0002-second.md": adr("0002", "Друге", "прийнято (змінює ADR-0003)"),
    "0002-other.md": adr("0002", "Інше", "прийнято"),
    "0003-api-v1.2.md": adr("0003", "Крапка", "прийнято"),
    "0004-реєстр.md": adr("0004", "Кирилиця", "прийнято"),
  })
  try {
    const { problems } = checkAdrDir(dir)
    const has = (text) =>
      assert.ok(
        problems.some((p) => p.includes(text)),
        `${text}\n${problems.join("\n")}`,
      )
    has("0002-second.md: номер 0002 уже має 0002-other.md")
    has("0003-api-v1.2.md: назва файла ADR")
    has("0004-реєстр.md: назва файла ADR")
    has(
      "0001-first.md: «замінено 0009» — замінити може лише наявний пізніший ADR",
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("CRLF, рядок «Змінено» лише в шапці, текст після таблиці лишається, `|` у назві екранується", () => {
  const index = INDEX.replace(
    "\n## Шаблон",
    "\nПримітка під таблицею.\n\n## Шаблон",
  )
  const dir = adrDir(
    {
      "0001-first.md": adr(
        "0001",
        "Перше",
        "прийнято",
        "",
        "\n```md\n- Змінено: ADR-0002 — приклад у тілі\n```\n",
      ).replace(/\n/g, "\r\n"),
      "0002-second.md": adr("0002", "Друге", "прийнято"),
      "0003-third.md": adr("0003", "А | Б", "прийнято"),
    },
    index,
  )
  try {
    const { problems, expected } = checkAdrDir(dir)
    assert.ok(
      !problems.some((p) => p.includes("перший рядок")),
      problems.join("\n"),
    )
    assert.match(
      expected,
      /\| \[0001\]\(0001-first\.md\) \| Перше рішення з довшим описом \\\| і рискою \| прийнято \|/,
    )
    assert.match(
      expected,
      /\| \[0003\]\(0003-third\.md\) \| А \\\| Б \| прийнято \|\n\nПримітка під таблицею\.\n\n## Шаблон\n$/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
