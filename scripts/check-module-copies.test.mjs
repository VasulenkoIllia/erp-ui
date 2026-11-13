import assert from "node:assert/strict"
import { test } from "node:test"

import {
  findModuleCopies,
  significantLines,
  unexpectedCopies,
} from "./check-module-copies.mjs"

/** `count` різних рядків коду: `const v1 = load(1)` … */
const code = (count, prefix = "v") =>
  Array.from({ length: count }, (_, i) => `  const ${prefix}${i} = load(${i})`)

test("significantLines: без коментарів, імпортів і рядків лише з дужок; номери — з файлу", () => {
  const text = [
    'import { a } from "x"',
    "import {",
    "  b,",
    '} from "y"',
    'import "./style.css"',
    "/**",
    " * опис",
    " */",
    "// рядок",
    "",
    "function f() {",
    "  return a + b",
    "}",
  ].join("\n")
  assert.deepEqual(significantLines(text), [
    { text: "function f() {", line: 11 },
    { text: "return a + b", line: 12 },
  ])
})

test("findModuleCopies: однаковий шматок у двох модулях — копія з рядками кожного файлу", () => {
  const shared = code(10)
  const copies = findModuleCopies([
    { module: "B3", file: "b3.ts", text: ["// B3", ...shared].join("\n") },
    { module: "K2", file: "k2.ts", text: [...shared, "  done()"].join("\n") },
  ])
  assert.deepEqual(copies, [
    { files: ["b3.ts", "k2.ts"], ranges: ["2-11", "1-10"] },
  ])
})

test("findModuleCopies: менше за вікно чи той самий модуль — не копія; інші відступи — копія", () => {
  const nine = code(9)
  assert.deepEqual(
    findModuleCopies([
      { module: "B3", file: "b3.ts", text: nine.join("\n") },
      { module: "K2", file: "k2.ts", text: nine.join("\n") },
    ]),
    [],
  )
  const ten = code(10)
  assert.deepEqual(
    findModuleCopies([
      { module: "K2", file: "a.ts", text: ten.join("\n") },
      { module: "K2", file: "b.ts", text: ten.join("\n") },
    ]),
    [],
  )
  assert.equal(
    findModuleCopies([
      { module: "B3", file: "b3.ts", text: ten.join("\n") },
      {
        module: "K4",
        file: "k4.ts",
        text: ten.map((line) => `    ${line.trim()}`).join("\n"),
      },
    ]).length,
    1,
  )
})

test("findModuleCopies: однакові лише імпорти й коментарі — не копія", () => {
  const imports = Array.from(
    { length: 12 },
    (_, i) => `import { name${i} } from "@/lib/x${i}"`,
  )
  assert.deepEqual(
    findModuleCopies([
      {
        module: "B3",
        file: "b3.ts",
        text: [...imports, ...code(3, "b")].join("\n"),
      },
      {
        module: "K2",
        file: "k2.ts",
        text: [...imports, ...code(3, "k")].join("\n"),
      },
    ]),
    [],
  )
})

test("unexpectedCopies: дозволена пара — у будь-якому порядку файлів", () => {
  const copies = [
    { files: ["a.ts", "b.ts"], ranges: ["1-10", "1-10"] },
    { files: ["a.ts", "c.ts"], ranges: ["1-10", "1-10"] },
  ]
  assert.deepEqual(
    unexpectedCopies(copies, [{ files: ["b.ts", "a.ts"], reason: "тест" }]),
    [copies[1]],
  )
})
