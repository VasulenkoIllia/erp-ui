import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import {
  findViolations,
  missingRoots,
  scanRoots,
} from "../registry/tools/erp-ui-check-tokens.mjs"

const TOOL = new URL(
  "../registry/tools/erp-ui-check-tokens.mjs",
  import.meta.url,
).pathname

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

function project(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-check-tokens-"))
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  return dir
}

const run = (cwd, args = [], tool = TOOL) =>
  spawnSync(process.execPath, [tool, ...args], { cwd, encoding: "utf8" })

test("у проекті сканує теки один раз і пропускає згенеровані палітри тем", () => {
  const dir = project({
    "src/styles/erp-ui/themes.css": ":root { --primary: oklch(0.5 0.1 250); }",
    "apps/web/src/styles/erp-ui/themes.css": ":root { --primary: #fff; }",
    "src/App.tsx": 'export const App = () => <div className="bg-red-500" />',
    "src/legacy.jsx": 'const x = "#123456"',
    "src/node_modules/x.css": "a { color: #fff; }",
    "src/types.d.ts": "// #fff",
  })
  try {
    const { found, files } = scanRoots(dir, ["src", "src", "apps"])
    assert.deepEqual(
      found.map((v) => `${v.file}:${v.rule}`),
      ["src/App.tsx:tailwind-palette", "src/legacy.jsx:hex-color"],
    )
    assert.equal(files, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("символьне посилання на теку чи файл перевіряється, цикл посилань — один раз", () => {
  const dir = project({
    "shared/inner/bad.tsx":
      'export const B = () => <b className="bg-red-500" />',
    "shared/one.css": "a { color: #fff; }",
    "src/a.ts": "export {}",
  })
  try {
    symlinkSync(path.join(dir, "shared"), path.join(dir, "src/linked"))
    symlinkSync(path.join(dir, "shared/one.css"), path.join(dir, "src/one.css"))
    symlinkSync(path.join(dir, "src"), path.join(dir, "src/loop"))
    const { found, files } = scanRoots(dir, ["src"])
    assert.equal(files, 3)
    assert.deepEqual(found.map((v) => v.rule).sort(), [
      "hex-color",
      "tailwind-palette",
    ])
    assert.ok(found.some((v) => v.file === "src/linked/inner/bad.tsx"))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("тека, якої немає, файл замість теки чи порожній аргумент — не перевірені", () => {
  const dir = project({ "src/a.ts": "export {}" })
  try {
    assert.deepEqual(missingRoots(dir, ["src", "app", "src/a.ts", " "]), [
      "app",
      "src/a.ts",
      " ",
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("команда: без src, без файлів чи з порушенням падає; чистий код і запуск через посилання проходять", () => {
  const empty = project({ "app/page.tsx": "export {}" })
  const blank = project({ "src/readme.md": "текст" })
  const bad = project({
    "src/a.tsx": 'export const A = () => <b className="text-white" />',
  })
  const clean = project({
    "src/a.tsx": 'export const A = () => <b className="text-primary" />',
  })
  const links = mkdtempSync(path.join(tmpdir(), "erp-ui-check-tokens-link-"))
  try {
    const noSrc = run(empty)
    assert.equal(noSrc.status, 1)
    assert.match(noSrc.stderr, /немає теки «src»/)
    assert.equal(run(empty, ["app"]).status, 0)
    assert.match(run(blank).stderr, /нічого не перевірено/)
    const failed = run(bad)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /src\/a\.tsx:1 {2}tailwind-palette/)
    assert.match(run(clean).stdout, /порушень немає \(файлів — 1\)/)
    symlinkSync(path.dirname(TOOL), path.join(links, "tools"))
    const linked = run(bad, [], path.join(links, "tools", path.basename(TOOL)))
    assert.equal(linked.status, 1, "через посилання main() має запуститися")
  } finally {
    for (const dir of [empty, blank, bad, clean, links])
      rmSync(dir, { recursive: true, force: true })
  }
})

test("файл ставиться в проект сам: імпортує лише вбудовані модулі node", () => {
  const imports = [
    ...readFileSync(TOOL, "utf8").matchAll(/^import .* from "([^"]+)"/gm),
  ]
  assert.ok(imports.length > 0)
  for (const [, from] of imports) assert.match(from, /^node:/)
})
