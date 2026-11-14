import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import {
  findViolations,
  scanRoots,
} from "../registry/tools/erp-ui-check-tokens.mjs"

const rules = (text) => findViolations(text).map((v) => v.rule)

test("ловить сирі кольори", () => {
  assert.deepEqual(rules('style={{ color: "#1a2b3c" }}'), ["hex-color"])
  assert.deepEqual(rules('className="bg-[#fff]"'), ["hex-color"])
  assert.deepEqual(rules("color: oklch(0.5 0.1 250);"), ["color-function"])
  assert.deepEqual(rules("background: rgb(0 0 0 / 50%);"), ["color-function"])
})

test("ловить стандартну палітру Tailwind", () => {
  assert.deepEqual(rules('className="bg-red-500 hover:text-white"'), [
    "tailwind-palette",
    "tailwind-palette",
  ])
  assert.deepEqual(rules('className="border-gray-200/50"'), [
    "tailwind-palette",
  ])
})

test("ловить довільні розміри", () => {
  assert.deepEqual(rules('className="p-[13px] rounded-[10px] text-[15px]"'), [
    "arbitrary-size",
    "arbitrary-size",
    "arbitrary-size",
  ])
})

test("ловить рух поза токенами", () => {
  assert.deepEqual(
    rules(
      'className="transition-all duration-200 ease-linear data-open:duration-[120ms] ease-in-out"',
    ),
    ["motion", "motion", "motion", "motion", "motion"],
  )
  assert.deepEqual(
    rules(
      'className="transition-colors duration-fast ease-standard data-open:ease-enter transition-[width] animate-in"',
    ),
    [],
  )
})

test("пропускає токени й допустимі значення", () => {
  assert.deepEqual(
    rules(
      'className="bg-primary text-muted-foreground border-input h-(--control-h) min-h-touch max-w-[60ch] bg-success-soft"',
    ),
    [],
  )
  assert.deepEqual(rules('data-palette="teal" href="#main" id="#root"'), [])
  assert.deepEqual(rules("height: var(--control-h);"), [])
})

test("поважає явний виняток", () => {
  assert.deepEqual(
    rules('color: "#000" // erp-ui: allow-raw-value — колір бренду клієнта'),
    [],
  )
})

test("у проекті сканує src і пропускає згенеровані палітри тем", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-check-tokens-"))
  try {
    const write = (file, text) => {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), text)
    }
    write(
      "src/styles/erp-ui/themes.css",
      ":root { --primary: oklch(0.5 0.1 250); }",
    )
    write(
      "src/App.tsx",
      'export const App = () => <div className="bg-red-500" />',
    )
    write("src/node_modules/x.css", "a { color: #fff; }")
    write("src/types.d.ts", "// #fff")
    assert.deepEqual(
      scanRoots(dir, ["src"]).map((v) => `${v.file}:${v.rule}`),
      ["src/App.tsx:tailwind-palette"],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
