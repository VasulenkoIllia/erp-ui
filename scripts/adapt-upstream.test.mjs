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

test("рух: лише токени, без transition-all", () => {
  assert.equal(
    adapt("transition-all after:transition-all transition-[width]"),
    "transition after:transition transition-[width]",
  )
  assert.equal(
    adapt("duration-100 duration-200 ease-linear data-open:duration-300"),
    "duration-fast duration-base ease-standard data-open:duration-slow",
  )
  assert.equal(
    adapt("ease-in-out ease-out ease-in"),
    "ease-standard ease-enter ease-exit",
  )
  assert.equal(
    adapt("data-open:animate-in data-closed:animate-out"),
    "data-open:animate-in data-open:ease-enter data-closed:animate-out data-closed:ease-exit",
  )
  assert.equal(
    adapt("animate-in-custom duration-1000ms"),
    "animate-in-custom duration-1000ms",
  )
})

test("ідемпотентність", () => {
  const once = adapt(
    "focus-visible:ring-3 focus-visible:ring-ring/50 text-destructive bg-black/10 transition-all duration-100 ease-in-out data-open:animate-in data-closed:animate-out",
  )
  assert.equal(adapt(once), once)
})
