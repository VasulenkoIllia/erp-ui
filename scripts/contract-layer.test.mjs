import assert from "node:assert/strict"
import { test } from "node:test"

import {
  contractLayerFiles,
  contractLayerProblems,
  contractLayerSection,
  importSpecifiers,
} from "./contract-layer.mjs"

/** Файли в пам'яті: шлях → текст. */
const fsOf = (files) => ({
  read: (file) => files[file],
  exists: (file) => Object.hasOwn(files, file),
})

const LAYER = { lib: ["api", "statuses-core"], modules: { K2: ["debt"] } }

test("contractLayerFiles: утиліти, contract.ts і наявний resources.ts кожного модуля, правила модулів", () => {
  const { exists } = fsOf({ "registry/modules/K2/resources.ts": "" })
  assert.deepEqual(contractLayerFiles(LAYER, ["B1", "K2"], exists), [
    "registry/lib/api.ts",
    "registry/lib/statuses-core.ts",
    "registry/modules/B1/contract.ts",
    "registry/modules/K2/contract.ts",
    "registry/modules/K2/resources.ts",
    "registry/modules/K2/debt.ts",
  ])
})

test("importSpecifiers: статичні, типи, реекспорти й динамічні імпорти", () => {
  const text = [
    'import { z } from "zod"',
    'import type { A } from "@/lib/a"',
    'export { b } from "./b"',
    'import "./side"',
    'const c = import("@/lib/c")',
  ].join("\n")
  assert.deepEqual(importSpecifiers(text), [
    "zod",
    "@/lib/a",
    "./b",
    "./side",
    "@/lib/c",
  ])
})

test("contractLayerProblems: zod і файли шару — без порушень", () => {
  const files = {
    "registry/lib/api.ts": 'import { z } from "zod"',
    "registry/lib/statuses-core.ts":
      'import type { Api } from "@/registry/lib/api"',
    "registry/modules/K2/contract.ts": [
      'import { statusSchema } from "@/lib/statuses-core"',
      'import { RESOURCES } from "./resources"',
    ].join("\n"),
    "registry/modules/K2/resources.ts": "export const RESOURCES = []",
  }
  const { read, exists } = fsOf(files)
  assert.deepEqual(contractLayerProblems(Object.keys(files), read, exists), [])
})

test("contractLayerProblems: пакет інтерфейсу навіть типом, компонент, файл поза шаром — порушення з підказкою", () => {
  const files = {
    "registry/lib/statuses-core.ts": 'import { z } from "zod"',
    "registry/modules/K2/contract.ts": [
      'import type { ReactNode } from "react"',
      'import { statusSchema } from "@/lib/statuses"',
      'import { useMe } from "@/hooks/use-me"',
      'import { format } from "@/lib/format"',
      'import { kinds } from "./invoice-kind"',
    ].join("\n"),
  }
  const { read, exists } = fsOf(files)
  assert.deepEqual(
    contractLayerProblems(
      [...Object.keys(files), "registry/lib/gone.ts"],
      read,
      exists,
    ),
    [
      "registry/modules/K2/contract.ts: пакет «react» — у чистому шарі лише zod (ADR-0093)",
      "registry/modules/K2/contract.ts: імпорт «@/lib/statuses» — поза чистим шаром (ADR-0093); чиста частина — «@/lib/statuses-core»",
      "registry/modules/K2/contract.ts: імпорт «@/hooks/use-me» — поза чистим шаром (ADR-0093)",
      "registry/modules/K2/contract.ts: імпорт «@/lib/format» — поза чистим шаром (ADR-0093); файл без React — у CONTRACT_LAYER (registry/registry.config.mjs)",
      "registry/modules/K2/contract.ts: імпорт «./invoice-kind» — поза чистим шаром (ADR-0093); файл без React — у CONTRACT_LAYER (registry/registry.config.mjs)",
      "registry/lib/gone.ts: файл чистого шару з CONTRACT_LAYER не знайдено",
    ],
  )
})

test("contractLayerSection: перелік утиліт і правил модулів для каталогу", () => {
  const md = contractLayerSection(LAYER)
  assert.match(md, /^## Чистий шар контрактів/)
  assert.match(md, /- Утиліти: `lib\/api`, `lib\/statuses-core`\./)
  assert.match(md, /- Правила модулів: `K2` — `debt\.ts`\./)
})
