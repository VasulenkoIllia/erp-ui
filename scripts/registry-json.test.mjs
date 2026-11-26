import assert from "node:assert/strict"
import { test } from "node:test"

import {
  GITHUB_SOURCE_LIMIT_BYTES,
  registrySizeProblems,
  SIZE_WARN_SHARE,
  serializeRegistry,
} from "./registry-json.mjs"

const REGISTRY = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: "erp-ui",
  items: [
    { name: "ui/button", files: [{ path: "registry/ui/button.tsx" }] },
    { name: "erp/photo-input", title: "Поле «фото»\nдва рядки" },
  ],
}

test("елемент — один рядок, вміст той самий", () => {
  const json = serializeRegistry(REGISTRY)
  assert.deepEqual(JSON.parse(json), REGISTRY)
  const lines = json.trimEnd().split("\n")
  assert.equal(lines.length, 4)
  // Шапка — першим рядком, елементи після неї: git diff стабільний.
  assert.ok(lines[0]?.startsWith('{"$schema":'))
  assert.ok(lines[1]?.startsWith('{"name":"ui/button"'))
  assert.ok(lines[2]?.startsWith('{"name":"erp/photo-input"'))
  assert.ok(json.endsWith("\n]}\n"))
})

test("порожній реєстр теж читається", () => {
  assert.deepEqual(JSON.parse(serializeRegistry({ items: [] })), { items: [] })
})

test("межа CLI shadcn: помилка понад 5 МіБ, попередження з частки межі", () => {
  const ofBytes = (bytes) => "x".repeat(bytes)
  assert.equal(registrySizeProblems(ofBytes(1024)).error, null)
  assert.equal(registrySizeProblems(ofBytes(1024)).warning, null)
  const near = registrySizeProblems(
    ofBytes(Math.ceil(GITHUB_SOURCE_LIMIT_BYTES * SIZE_WARN_SHARE) + 1),
  )
  assert.equal(near.error, null)
  assert.match(near.warning ?? "", /до межі CLI shadcn/)
  const over = registrySizeProblems(ofBytes(GITHUB_SOURCE_LIMIT_BYTES + 1))
  assert.match(over.error ?? "", /не прочитає його з GitHub/)
  // CLI відмовляє лише понад межу.
  assert.equal(
    registrySizeProblems(ofBytes(GITHUB_SOURCE_LIMIT_BYTES)).error,
    null,
  )
})

test("межа — у байтах UTF-8, як у CLI: кирилиця вдвічі важча", () => {
  const cyrillic = "я".repeat(Math.floor(GITHUB_SOURCE_LIMIT_BYTES / 2) + 1)
  assert.ok(cyrillic.length < GITHUB_SOURCE_LIMIT_BYTES)
  assert.match(
    registrySizeProblems(cyrillic).error ?? "",
    /не прочитає його з GitHub/,
  )
})
