import assert from "node:assert/strict"
import { test } from "node:test"

import {
  budgetReport,
  ratchetLimit,
  scaleParts,
  splitFirstScreen,
  staticClosure,
  updatedBudget,
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
// Склад: вхідний чанк — пів на пів кіт і демо, решта — бібліотеки.
const parts = (key) =>
  key === "index.html"
    ? { libs: 0, kit: size(key) / 2, demo: size(key) / 2 }
    : { libs: size(key), kit: 0, demo: 0 }
const budget = {
  entryCeilingKb: 60,
  mocksLimitKb: 43,
  pageLimitsKb: { "DataPage.tsx": 25, "HomePage.tsx": 1 },
}

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

test("стеля входу, власна частина сторінки й шар моків; склад входу", () => {
  const report = budgetReport(splitFirstScreen(manifest), size, budget, parts)
  assert.equal(report.entry.kb, 60)
  assert.equal(report.entry.over, false)
  assert.deepEqual(report.entry.parts, { libs: 50, kit: 5, demo: 5 })
  const byName = Object.fromEntries(report.pages.map((p) => [p.name, p]))
  // Власна частина — без входу; увесь перший екран — разом із ним.
  assert.equal(byName["DataPage.tsx"].kb, 25)
  assert.equal(byName["DataPage.tsx"].totalKb, 85)
  assert.equal(byName["DataPage.tsx"].over, false)
  assert.equal(report.mocks.kb, 43)
  assert.equal(report.mocks.over, false)
  assert.deepEqual(report.stale, [])
})

test("понад стелю, понад межу й сторінка без межі валять перевірку", () => {
  const report = budgetReport(
    splitFirstScreen(manifest),
    size,
    {
      entryCeilingKb: 59.9,
      mocksLimitKb: 42.9,
      pageLimitsKb: { "DataPage.tsx": 24.9 },
    },
    parts,
  )
  const byName = Object.fromEntries(report.pages.map((p) => [p.name, p]))
  assert.equal(report.entry.over, true)
  assert.equal(byName["DataPage.tsx"].over, true)
  assert.equal(byName["HomePage.tsx"].over, true, "немає межі")
  assert.equal(report.mocks.over, true)
})

test("ріст входу під стелею не зачіпає межі сторінок", () => {
  const heavierEntry = (key) => (key === "index.html" ? 14_000 : size(key))
  const report = budgetReport(
    splitFirstScreen(manifest),
    heavierEntry,
    { ...budget, entryCeilingKb: 65 },
    parts,
  )
  assert.equal(report.entry.over, false)
  assert.equal(
    report.pages.some((p) => p.over),
    false,
  )
})

test("межа сторінки, якої немає у збірці, — застаріла", () => {
  const report = budgetReport(
    splitFirstScreen(manifest),
    size,
    { ...budget, pageLimitsKb: { ...budget.pageLimitsKb, "OldPage.tsx": 50 } },
    parts,
  )
  assert.deepEqual(report.stale, ["OldPage.tsx"])
})

test("сторінка модуля кіта — свій маршрут, як сторінка демо", () => {
  const split = splitFirstScreen({
    ...manifest,
    "../../registry/modules/B1-contacts/pages/contacts-list-page.tsx": {
      file: "a/contacts.js",
      isDynamicEntry: true,
      imports: ["_table.js"],
    },
  })
  assert.deepEqual(split.pages["contacts-list-page.tsx"].sort(), [
    "../../registry/modules/B1-contacts/pages/contacts-list-page.tsx",
    "_table.js",
  ])
})

test("дві сторінки з однаковою назвою файла валять перевірку", () => {
  assert.throws(
    () =>
      splitFirstScreen({
        ...manifest,
        "../../registry/modules/N5-notifications/pages/DataPage.tsx": {
          file: "a/n5-data.js",
          isDynamicEntry: true,
        },
      }),
    /дві сторінки з назвою DataPage\.tsx/,
  )
})

test("збірка без сторінок валить перевірку, а не проходить порожньою", () => {
  const withoutPages = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !key.startsWith("src/pages/")),
  )
  assert.throws(() => splitFirstScreen(withoutPages), /немає сторінок/)
})

test("оновлення меж: факт до 0,1 КБ + 0,1; стеля входу та сама", () => {
  assert.equal(ratchetLimit(404.64), 404.7)
  assert.equal(ratchetLimit(404.66), 404.8)
  assert.equal(ratchetLimit(100), 100.1)
  const report = budgetReport(splitFirstScreen(manifest), size, budget, parts)
  assert.deepEqual(updatedBudget(report, { ...budget, entryCeilingKb: 1 }), {
    entryCeilingKb: 1,
    mocksLimitKb: 43.1,
    pageLimitsKb: { "DataPage.tsx": 25.1, "HomePage.tsx": 1.1 },
  })
})

test("склад чанка зводиться до справжнього розміру; чанк без коду — нуль", () => {
  assert.deepEqual(scaleParts({ libs: 300, kit: 100, demo: 0 }, 200), {
    libs: 150,
    kit: 50,
    demo: 0,
  })
  assert.deepEqual(scaleParts(undefined, 0), { libs: 0, kit: 0, demo: 0 })
})
