import assert from "node:assert/strict"
import { test } from "node:test"

import { adapt } from "./adapt-upstream.mjs"

test("фокус: суцільне кільце 2 px", () => {
  assert.equal(
    adapt(
      '"outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:ring-3"',
    ),
    '"outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-3"',
  )
  assert.equal(
    adapt("has-[[data-slot=input-group-control]:focus-visible]:ring-3"),
    "has-[[data-slot=input-group-control]:focus-visible]:ring-2",
  )
  assert.equal(adapt("focus-visible:ring-[3px]"), "focus-visible:ring-2")
})

test("текст помилок і підкладка", () => {
  assert.equal(
    adapt("text-destructive hover:bg-destructive/20"),
    "text-destructive-foreground hover:bg-destructive/20",
  )
  assert.equal(
    adapt("bg-black/10 supports-backdrop-filter:backdrop-blur-xs"),
    "bg-overlay",
  )
})

test("довільні значення → шкала", () => {
  assert.equal(
    adapt("rounded-[min(var(--radius-md),10px)] text-[0.8rem]"),
    "rounded-md text-xs",
  )
  assert.equal(
    adapt("has-[>button]:ml-[-0.3rem] has-[>kbd]:mr-[-0.15rem]"),
    "has-[>button]:-ml-1.25 has-[>kbd]:-mr-0.5",
  )
})

test("cn з налаштуванням erp-ui", () => {
  assert.equal(
    adapt('import { cn } from "cn"'),
    'import { cn } from "@/registry/lib/utils"',
  )
})

test("ідемпотентність", () => {
  const once = adapt(
    "focus-visible:ring-3 focus-visible:ring-ring/50 text-destructive bg-black/10",
  )
  assert.equal(adapt(once), once)
})
