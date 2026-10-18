import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  extensionFormFields,
  extensionFormSchema,
  extensionFormValues,
  extensionPayload,
} from "@/registry/lib/extension-form"

import { FIELDS, FORM } from "@/kit/extension-form.fixtures"

/** Крок 1.4b1 (ADR-0026): поля розширення у формі — порядок, перевірка, значення й запит. */

const MESSAGES = {
  required: "Заповніть",
  dateIssue: (value: string) => (value === "2026-02-30" ? "Немає дати" : null),
}

describe("lib/extension-form", () => {
  it("у формі — поля з form.add у їх порядку; невідомий ключ і обов'язкове поза формою — помилка", () => {
    expect(extensionFormFields(FIELDS, FORM).map((f) => f.id)).toEqual([
      "limit",
      "vatPayer",
    ])
    expect(extensionFormFields(undefined, undefined)).toEqual([])
    expect(() =>
      extensionFormFields(FIELDS, { add: [{ id: "zzz" }, { id: "limit" }] }),
    ).toThrow(/zzz/)
    expect(() => extensionFormFields(FIELDS, { add: [] })).toThrow(/limit/)
  })

  it("перевірка: обов'язкові не порожні, дата — правильна, необов'язкові можуть бути порожні", () => {
    const schema = z.object(extensionFormSchema(FIELDS, MESSAGES))
    const ok = {
      vatPayer: false,
      limit: 0,
      signed: "",
      tax: null,
      note: "",
    }
    expect(schema.safeParse(ok).success).toBe(true)
    const bad = schema.safeParse({ ...ok, limit: null, signed: "2026-02-30" })
    expect(
      bad.error?.issues.map((issue) => [issue.path.join(), issue.message]),
    ).toEqual([
      ["limit", "Заповніть"],
      ["signed", "Немає дати"],
    ])
  })

  it("значення форми з запису й порожні; у запит — лише змінені, порожнє — null", () => {
    expect(
      extensionFormValues(FIELDS, {
        vatPayer: true,
        limit: 5,
        signed: "2026-10-01",
        tax: "single",
        note: 42,
      }),
    ).toEqual({
      vatPayer: true,
      limit: 5,
      signed: "2026-10-01",
      tax: "single",
      note: "",
    })
    expect(extensionFormValues(FIELDS)).toEqual({
      vatPayer: false,
      limit: null,
      signed: "",
      tax: null,
      note: "",
    })
    expect(
      extensionPayload(
        FIELDS,
        { limit: 3, signed: "", note: "x", name: "ТОВ" },
        ["limit", "signed", "name"],
      ),
    ).toEqual({ limit: 3, signed: null })
  })
})
