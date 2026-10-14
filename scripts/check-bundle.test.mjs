import assert from "node:assert/strict"
import { test } from "node:test"

import {
  budgetReport,
  ENTRY_ROW,
  splitFirstScreen,
  staticClosure,
  updatedLimits,
} from "./check-bundle.mjs"

// Вхід → react; сторінка Data → таблиця + react (спільний); моки → msw; динамічний модуль кіта.
const manifest = {
  "index.html": { file: "a/index.js", isEntry: true, imports: ["_react.js"] },
  "_react.js": { file: "a/react.js" },
  "_table.js": { file: "a/table.js", imports: ["_react.js"] },
  "src/pages/DataPage.tsx": {
    file: "a/data.js",
    isDynamicEntry: true,
    imports: ["_table.js", "_react.js"],
  },
  "src/pages/HomePage.tsx": { file: "a/home.js", isDynamicEntry: true },
  "src/mocks/browser.ts": {
    file: "a/mocks.js",
    isDynamicEntry: true,
    imports: ["_msw.js", "_react.js"],
  },
  "_msw.js": { file: "a/msw.js" },
  "../../registry/erp/command-palette-list.tsx": {
    file: "a/palette.js",
    isDynamicEntry: true,
  },
}
const sizes = {
  "index.html": 10_000,
  "_react.js": 50_000,
  "_table.js": 20_000,
  "src/pages/DataPage.tsx": 5_000,
  "src/pages/HomePage.tsx": 1_000,
  "src/mocks/browser.ts": 3_000,
  "_msw.js": 40_000,
}
const size = (key) => sizes[key] ?? 0

test("статичне замикання без циклів і динамічних імпортів", () => {
  assert.deepEqual(
    [...staticClosure(manifest, "src/pages/DataPage.tsx")].sort(),
    ["_react.js", "_table.js", "src/pages/DataPage.tsx"],
  )
})

test("перший екран: сторінка без спільного з входом, моки окремо", () => {
  const split = splitFirstScreen(manifest)
  assert.deepEqual(split.entry.sort(), ["_react.js", "index.html"])
  assert.deepEqual(split.pages["DataPage.tsx"].sort(), [
    "_table.js",
    "src/pages/DataPage.tsx",
  ])
  assert.deepEqual(split.mocks.sort(), ["_msw.js", "src/mocks/browser.ts"])
  // Динамічний модуль кіта (палітра) — ні в першому екрані, ні в моках.
  assert.equal(Object.keys(split.pages).length, 2)
})

test("межі: перевищення й маршрут без межі валять перевірку", () => {
  const report = budgetReport(splitFirstScreen(manifest), size, {
    [ENTRY_ROW]: 60,
    "DataPage.tsx": 80,
  })
  const byName = Object.fromEntries(report.rows.map((r) => [r.name, r]))
  assert.equal(byName[ENTRY_ROW].kb, 60)
  assert.equal(byName[ENTRY_ROW].over, false)
  assert.equal(byName["DataPage.tsx"].kb, 85)
  assert.equal(byName["DataPage.tsx"].over, true)
  assert.equal(byName["HomePage.tsx"].over, true, "немає межі")
  assert.deepEqual(report.stale, [])
  assert.equal(report.mocksKb, 43)
})

test("межа маршруту, якого немає у збірці, — застаріла", () => {
  const report = budgetReport(splitFirstScreen(manifest), size, {
    [ENTRY_ROW]: 60,
    "DataPage.tsx": 90,
    "HomePage.tsx": 70,
    "OldPage.tsx": 50,
  })
  assert.deepEqual(report.stale, ["OldPage.tsx"])
})

test("збірка без сторінок валить перевірку, а не проходить порожньою", () => {
  const withoutPages = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !key.startsWith("src/pages/")),
  )
  assert.throws(() => splitFirstScreen(withoutPages), /немає сторінок/)
})

test("оновлення меж: факт + 5 %, угору до 0,1 КБ", () => {
  assert.deepEqual(
    updatedLimits([
      { name: ENTRY_ROW, kb: 334.2 },
      { name: "DataPage.tsx", kb: 100 },
    ]),
    { [ENTRY_ROW]: 351, "DataPage.tsx": 105 },
  )
})
