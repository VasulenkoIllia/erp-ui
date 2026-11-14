import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import {
  SKILL_CORE_MAX_BYTES,
  SKILL_DIR,
  SKILL_REFERENCE_MAX_BYTES,
  skillProblems,
  unknownNames,
} from "./check-docs.mjs"

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), "erp-ui-docs-"))
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), text)
  }
  return root
}

test("скіл: межі розміру ядра й довідки, кожна довідка названа в ядрі й існує", () => {
  const root = project({
    [`${SKILL_DIR}/SKILL.md`]: `| списки | \`references/lists.md\` |\n| форми | \`references/forms.md\` |\n${"я".repeat(SKILL_CORE_MAX_BYTES / 2)}`,
    [`${SKILL_DIR}/references/lists.md`]: "ш".repeat(SKILL_REFERENCE_MAX_BYTES),
    [`${SKILL_DIR}/references/orphan.md`]: "ніхто не називає",
  })
  try {
    const problems = skillProblems(root)
    assert.equal(problems.length, 4, problems.join("\n"))
    assert.match(problems[0], /SKILL\.md: \d+ Б, межа ядра/)
    assert.match(problems[1], /references\/lists\.md: \d+ Б, межа довідки/)
    assert.match(problems[2], /не називає references\/orphan\.md/)
    assert.match(problems[3], /SKILL\.md: довідки references\/forms\.md немає/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("назви в лапках: компоненти, хуки, фабрики й елементи реєстру мають бути в коді кіта", () => {
  const root = project({
    "registry/lib/format.ts": "",
    "registry/hooks/use-wizard.ts": "",
  })
  try {
    const names = {
      words: new Set([
        "DataTable",
        "useFormat",
        "createApiClient",
        "RealtimeSync",
      ]),
      items: new Set(["erp/data-table"]),
    }
    const text =
      "`DataTable`, `<RealtimeSync />`, `useFormat()`, `createApiClient`, `erp/data-table`, `lib/format`, `hooks/use-wizard`, " +
      "`LoginPage`, `useMissing()`, `createNothing`, `erp/login-page`, `lib/nope`, `npx shadcn`, `--dry-run`, `p-[13px]`"
    assert.deepEqual(unknownNames(text, root, names), [
      "LoginPage",
      "useMissing",
      "createNothing",
      "erp/login-page",
      "lib/nope",
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
