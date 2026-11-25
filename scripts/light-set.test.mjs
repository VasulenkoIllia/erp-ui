import assert from "node:assert/strict"
import { test } from "node:test"

import {
  lightSetNames,
  lightSetProblems,
  lightSetSection,
} from "./light-set.mjs"

const ITEMS = [
  { name: "base", dependencies: ["cn@^0.4.0", "i18next@^26.4.4"] },
  { name: "ui/button", dependencies: ["@base-ui/react@^1.9.0"] },
  { name: "ui/select", dependencies: [] },
  { name: "erp/data-table", dependencies: ["@tanstack/react-table@^9.3.1"] },
  {
    name: "erp/form",
    dependencies: ["ra-core@^5.15.4", "react-router@^7.18.4"],
  },
]

test("lightSetNames: перелік і всі ui/*, без повторів", () => {
  assert.deepEqual(
    lightSetNames(ITEMS, ["base", "ui/button", "erp/data-table"]),
    ["base", "ui/button", "erp/data-table", "ui/select"],
  )
})

test("lightSetProblems: легкий набір без ra-core і react-router — порушень немає", () => {
  assert.deepEqual(lightSetProblems(ITEMS, ["base", "erp/data-table"]), [])
})

test("lightSetProblems: елемент із ra-core чи react-router і елемент, якого немає", () => {
  const problems = lightSetProblems(ITEMS, ["erp/form", "erp/gone"])
  assert.equal(problems.length, 3)
  assert.match(problems[0], /^erp\/form: .*«ra-core»/)
  assert.match(problems[1], /^erp\/form: .*«react-router»/)
  assert.match(problems[2], /^erp\/gone: .*немає в реєстрі/)
})

test("lightSetProblems: ui/* перевіряються без переліку; назва пакета з областю — до версії", () => {
  const items = [
    { name: "ui/x", dependencies: ["@scope/ra-core@^1.0.0", "ra-core"] },
  ]
  const problems = lightSetProblems(items, [])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^ui\/x: .*«ra-core»/)
})

test("lightSetSection: розділ каталогу з переліком", () => {
  const section = lightSetSection(["base", "erp/login-form"])
  assert.match(section, /^## Легкий набір/)
  assert.match(section, /`base`, `erp\/login-form`/)
})
