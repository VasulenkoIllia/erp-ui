import assert from "node:assert/strict"
import { test } from "node:test"

import { findViolations } from "./check-tokens.mjs"

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
