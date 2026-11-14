import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import {
  SKILL_CORE_MAX_BYTES,
  SKILL_DIR,
  SKILL_REFERENCE_MAX_BYTES,
  shippedProblems,
  skillProblems,
  unknownNames,
  withoutComments,
} from "./check-docs.mjs"

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), "erp-ui-docs-"))
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), text)
  }
  return root
}

test("скіл: межі розміру, таблиця ядра називає кожну довідку, довідки існують, сторонніх файлів немає", () => {
  const root = project({
    [`${SKILL_DIR}/SKILL.md`]: `| списки | \`references/lists.md\` |\n| форми | \`references/forms.md\` |\nКрок 3: \`references/orphan.md\`.\n${"я".repeat(SKILL_CORE_MAX_BYTES / 2)}`,
    [`${SKILL_DIR}/references/lists.md`]: "ш".repeat(
      SKILL_REFERENCE_MAX_BYTES / 2 + 1,
    ),
    [`${SKILL_DIR}/references/orphan.md`]: "названа лише поза таблицею",
    [`${SKILL_DIR}/references/notes.txt`]: "не довідка",
    [`${SKILL_DIR}/references/sub/deep.md`]: "вкладена",
  })
  try {
    const problems = skillProblems(root)
    const has = (pattern) =>
      assert.ok(
        problems.some((p) => pattern.test(p)),
        `${String(pattern)}\n${problems.join("\n")}`,
      )
    has(/references\/notes\.txt: у references\/ лише файли/)
    has(/references\/sub: у references\/ лише файли/)
    has(/SKILL\.md: \d+ Б, межа ядра/)
    has(/references\/lists\.md: \d+ Б, межа довідки/)
    has(/таблиця «Що робиш, що прочитати» не називає references\/orphan\.md/)
    has(/SKILL\.md: довідки references\/forms\.md немає/)
    assert.equal(problems.length, 6, problems.join("\n"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("реєстр ставить кожен файл скіла за його шляхом у claude і base", () => {
  const files = (paths) => paths.map(([p, target]) => ({ path: p, target }))
  const core = [`${SKILL_DIR}/SKILL.md`, "~/.claude/skills/erp-ui/SKILL.md"]
  const lists = [
    `${SKILL_DIR}/references/lists.md`,
    "~/.claude/skills/erp-ui/references/lists.md",
  ]
  const root = project({
    [`${SKILL_DIR}/SKILL.md`]: "| списки | `references/lists.md` |",
    [`${SKILL_DIR}/references/lists.md`]: "довідка",
    "registry.json": JSON.stringify({
      items: [
        { name: "claude", files: files([core, lists]) },
        { name: "base", files: files([core, [lists[0], "~/docs/lists.md"]]) },
      ],
    }),
  })
  try {
    assert.deepEqual(shippedProblems(root), [
      `registry.json: елемент «base» ставить ${lists[0]} у ~/docs/lists.md, а має в ${lists[1]}`,
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("назви в лапках: перша назва відрізка має бути в коді кіта, елементи — у реєстрі", () => {
  const root = project({
    "registry/lib/format.ts": "",
    "registry/hooks/use-wizard.ts": "",
    "registry/modules/B1-contacts/index.ts": "",
  })
  try {
    const names = {
      words: new Set([
        "DataTable",
        "useFormat",
        "createApiClient",
        "RealtimeSync",
        "useDocumentLinesSchema",
        "lazyWithPreload",
      ]),
      items: new Set(["erp/data-table"]),
    }
    const text =
      "`DataTable`, `<RealtimeSync />`, `<DataTable columns={x} />`, `useFormat()`, `useDocumentLinesSchema(currency)`, `createApiClient`, `lazyWithPreload`, " +
      "`erp/data-table`, `lib/format`, `hooks/use-wizard`, `modules/B1-contacts`, `README.md`, `PATCH /x`, `npx shadcn`, `--dry-run`, `p-[13px]`, `own`, " +
      "`LoginPage`, `<GhostPanel open />`, `useMissing()`, `createNothing`, `documentSumOf`, `erp/login-page`, `lib/nope`, `lib/..`"
    assert.deepEqual(unknownNames(text, root, names), [
      "LoginPage",
      "GhostPanel",
      "useMissing",
      "createNothing",
      "documentSumOf",
      "erp/login-page",
      "lib/nope",
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("назва лише в коментарі не рахується назвою коду; посилання з // лишаються", () => {
  const code =
    'export const a = 1 // LegacyPanel\n/* OldName */ const url = "https://x.example/Path"\nexport function RealOne() {}'
  const words = withoutComments(code).match(/[A-Za-z_$][\w$]*/g)
  assert.ok(!words.includes("LegacyPanel"))
  assert.ok(!words.includes("OldName"))
  assert.ok(words.includes("RealOne"))
  assert.ok(words.includes("Path"))
})
