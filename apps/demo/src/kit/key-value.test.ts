import { describe, expect, it } from "vitest"

import {
  KEY_VALUE_KEY_MAX,
  KEY_VALUE_VALUE_MAX,
  keyValueRecord,
  keyValueRows,
  keyValueSchema,
  keyValueText,
} from "@/registry/lib/key-value"

/** Поле «ключ–значення» (UI42, ADR-0047): рядки форми й об'єкт запиту. */
const SCHEMA = keyValueSchema({
  required: "required",
  duplicate: "duplicate",
  tooLong: "tooLong",
})

const issues = (rows: unknown) => {
  const result = SCHEMA.safeParse(rows)
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => [path.join("."), message])
}

describe("lib/key-value", () => {
  it("межу рахуємо без пробілів на краях: вони в запит не йдуть", () => {
    const rows = [{ key: `${"к".repeat(60)} `, value: ` ${"з".repeat(200)} ` }]
    expect(issues(rows)).toEqual([])
  })

  it("об'єкт → рядки в тому самому порядку; порожнє → без рядків", () => {
    expect(keyValueRows({ b: "1", a: "2" })).toEqual([
      { key: "b", value: "1" },
      { key: "a", value: "2" },
    ])
    expect(keyValueRows(undefined)).toEqual([])
    expect(keyValueRows(null)).toEqual([])
  })

  it("рядки → об'єкт: без порожніх рядків і пробілів на краях", () => {
    expect(
      keyValueRecord([
        { key: " 1С ", value: " 0301 " },
        { key: "", value: "  " },
      ]),
    ).toEqual({ "1С": "0301" })
  })

  it("ключ `__proto__` — звичайний запис, а не прототип об'єкта", () => {
    const record = keyValueRecord([{ key: "__proto__", value: "x" }])
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype)
    expect(Object.keys(record)).toEqual(["__proto__"])
  })

  it("порожній рядок не вимагає заповнення", () => {
    expect(issues([{ key: "", value: " " }])).toEqual([])
  })

  it("половина рядка — помилка біля порожньої клітинки", () => {
    expect(issues([{ key: "a", value: "" }])).toEqual([["0.value", "required"]])
    expect(issues([{ key: "", value: "b" }])).toEqual([["0.key", "required"]])
  })

  it("дублікат ключа без урахування регістру й пробілів — біля другого", () => {
    expect(
      issues([
        { key: "1С", value: "x" },
        { key: " 1с ", value: "y" },
      ]),
    ).toEqual([["1.key", "duplicate"]])
  })

  it("задовгі ключ і значення", () => {
    expect(
      issues([
        {
          key: "k".repeat(KEY_VALUE_KEY_MAX + 1),
          value: "v".repeat(KEY_VALUE_VALUE_MAX + 1),
        },
      ]),
    ).toEqual([
      ["0.key", "tooLong"],
      ["0.value", "tooLong"],
    ])
  })

  it("текст для порівняння при конфлікті; без значень — null", () => {
    expect(
      keyValueText([
        { key: "a", value: "1" },
        { key: "b", value: "2" },
      ]),
    ).toBe("a: 1, b: 2")
    expect(keyValueText([{ key: "", value: "" }])).toBeNull()
  })
})
