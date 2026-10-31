import { describe, expect, it } from "vitest"

import {
  applicableRows,
  buildRows,
  cellText,
  columnSample,
  countActions,
  dataRowCount,
  errorReportRows,
  fieldValueText,
  HEADER_ROW_CHOICES,
  headerRowChoices,
  headerRowIndex,
  mappingIssues,
  mergeCheck,
  parseCell,
  sheetIssue,
  suggestMapping,
  templateRows,
  type ImportField,
} from "@/registry/lib/import-rows"
import { IMPORT_MAX_COLUMNS } from "@/registry/lib/imports"

const FIELDS: ImportField[] = [
  { key: "name", label: "Назва", required: true, example: "Кава" },
  { key: "email", label: "Пошта", aliases: ["E-mail"] },
  { key: "price", label: "Ціна", type: "number" },
]

describe("зіставлення колонок", () => {
  it("знаходить поля за назвою, ключем і синонімом, без регістру й знаків", () => {
    expect(
      suggestMapping(["НАЗВА", "e-mail", "price", "Інше"], FIELDS),
    ).toEqual({ 0: "name", 1: "email", 2: "price" })
  })

  it("одне поле дістається лише першій колонці", () => {
    expect(suggestMapping(["Назва", "назва"], FIELDS)).toEqual({ 0: "name" })
  })

  it("показує обов'язкові без колонки й повтори", () => {
    const issues = mappingIssues({ 0: "email", 1: "email" }, FIELDS)
    expect(issues.missing.map((field) => field.key)).toEqual(["name"])
    expect([...issues.repeated]).toEqual(["email"])
  })
})

describe("розбір клітинки", () => {
  const number: ImportField = { key: "n", label: "N", type: "number" }

  it.each([
    ["1 234,56", 1234.56],
    ["1 234.56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1,234,567", 1234567],
    ["12,5", 12.5],
    ["0,125", 0.125],
    ["-7", -7],
  ])("число %s", (raw, value) => {
    expect(parseCell(number, raw)).toEqual({ value })
  })

  it("«1,234» не вгадує: це може бути і тисяча, і дріб", () => {
    expect(parseCell(number, "1,234")).toEqual({ code: "ambiguous_number" })
  })

  it("текст замість числа — помилка", () => {
    expect(parseCell(number, "abc")).toEqual({ code: "invalid" })
    expect(parseCell(number, true)).toEqual({ code: "invalid" })
  })

  it("ціле не приймає дробу", () => {
    const integer: ImportField = { key: "n", label: "N", type: "integer" }
    expect(parseCell(integer, 3)).toEqual({ value: 3 })
    expect(parseCell(integer, "3,5")).toEqual({ code: "invalid" })
  })

  it("так/ні обома мовами", () => {
    const flag: ImportField = { key: "f", label: "F", type: "boolean" }
    expect(parseCell(flag, "Так")).toEqual({ value: true })
    expect(parseCell(flag, "no")).toEqual({ value: false })
    expect(parseCell(flag, 1)).toEqual({ value: true })
    expect(parseCell(flag, "можливо")).toEqual({ code: "invalid" })
  })

  it("дата: Excel, ISO і день.місяць.рік", () => {
    const date: ImportField = { key: "d", label: "D", type: "date" }
    const iso = { value: "2026-01-15" }
    expect(parseCell(date, new Date(Date.UTC(2026, 0, 15)))).toEqual(iso)
    expect(parseCell(date, "2026-01-15")).toEqual(iso)
    expect(parseCell(date, "15.01.2026")).toEqual(iso)
    expect(parseCell(date, "15/01/2026")).toEqual(iso)
  })

  it("неіснуюча дата — помилка, а не перехід на наступний місяць", () => {
    const date: ImportField = { key: "d", label: "D", type: "date" }
    expect(parseCell(date, "31.02.2026")).toEqual({ code: "invalid" })
    expect(parseCell(date, "завтра")).toEqual({ code: "invalid" })
  })

  it("перелік за значенням і підписом", () => {
    const kind: ImportField = {
      key: "k",
      label: "K",
      type: "enum",
      options: [{ value: "goods", label: "Товар" }],
    }
    expect(parseCell(kind, "товар")).toEqual({ value: "goods" })
    expect(parseCell(kind, "GOODS")).toEqual({ value: "goods" })
    expect(parseCell(kind, "послуга")).toEqual({ code: "invalid" })
  })

  it("свій parse замінює тип", () => {
    const custom: ImportField = {
      key: "c",
      label: "C",
      type: "number",
      parse: () => ({ code: "custom" }),
    }
    expect(parseCell(custom, 1)).toEqual({ code: "custom" })
  })

  it("текст: число стає рядком без хвоста", () => {
    expect(parseCell({ key: "t", label: "T" }, 380671234567)).toEqual({
      value: "380671234567",
    })
    expect(cellText(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01-15")
  })
})

describe("рядки файла", () => {
  const rows = [
    [null, null, null],
    ["Назва", "Пошта", "Ціна"],
    ["Кава", "a@b.example", "12,5"],
    [null, null, null],
    ["", "x@b.example", "abc"],
    ["Чай", null, null],
  ]
  const mapping = { 0: "name", 1: "email", 2: "price" }

  it("зберігає номер рядка з Excel і пропускає порожні", () => {
    const built = buildRows(rows, mapping, FIELDS)
    expect(built.rows).toEqual([
      { row: 3, values: { name: "Кава", email: "a@b.example", price: 12.5 } },
      { row: 6, values: { name: "Чай" } },
    ])
  })

  it("збирає помилки розбору й обов'язкові поля", () => {
    const { invalid } = buildRows(rows, mapping, FIELDS)
    expect([...invalid]).toEqual([
      [
        5,
        [
          { field: "price", code: "invalid" },
          { field: "name", code: "required" },
        ],
      ],
    ])
  })

  it("порожня клітинка не стає значенням: оновлення її не зітре", () => {
    const { rows: built } = buildRows(rows, mapping, FIELDS)
    expect(built[1]?.values).not.toHaveProperty("email")
  })

  it("об'єднує перевірки в порядку файла", () => {
    const built = buildRows(rows, mapping, FIELDS)
    const checked = mergeCheck(built, {
      rows: [
        { row: 3, action: "create" },
        {
          row: 6,
          action: "invalid",
          errors: [{ field: "name", code: "duplicate" }],
        },
      ],
    })
    expect(checked.map(({ row, action }) => [row, action])).toEqual([
      [3, "create"],
      [5, "invalid"],
      [6, "invalid"],
    ])
    expect(countActions(checked)).toEqual({
      create: 1,
      update: 0,
      skip: 0,
      invalid: 2,
    })
    expect(applicableRows(checked).map(({ row }) => row)).toEqual([3])
  })

  it("сервер пропустив рядок: це помилка рядка, а не тихий успіх", () => {
    const built = buildRows(rows, mapping, FIELDS)
    const checked = mergeCheck(built, {
      rows: [
        { row: 3, action: "create" },
        { row: 99, action: "create" },
      ],
    })
    expect(checked.map(({ row, action }) => [row, action])).toEqual([
      [3, "create"],
      [5, "invalid"],
      [6, "invalid"],
    ])
    expect(checked[2]?.errors).toEqual([{ code: "no_answer" }])
    expect(applicableRows(checked).map(({ row }) => row)).toEqual([3])
  })

  it("пробіли в клітинці не стирають поле запису", () => {
    const built = buildRows(
      [
        ["Назва", "Пошта", "Ціна"],
        ["Кава", "   ", " "],
      ],
      mapping,
      FIELDS,
    )
    expect(built.rows).toEqual([{ row: 2, values: { name: "Кава" } }])
  })

  it("короткий рядок CSV: помилка лишається у своїй колонці", () => {
    const short = [["Назва", "Пошта", "Ціна"], ["abc"]]
    expect(
      errorReportRows(
        short,
        [{ row: 2, action: "invalid", errors: [{ code: "invalid" }] }],
        (error) => error.code,
        "Помилка",
      ),
    ).toEqual([
      ["Назва", "Пошта", "Ціна", "Помилка"],
      ["abc", null, null, "invalid"],
    ])
  })

  it("файл помилок несе початкові клітинки й текст", () => {
    const built = buildRows(rows, mapping, FIELDS)
    const checked = mergeCheck(built, {
      rows: [
        { row: 3, action: "create" },
        { row: 6, action: "skip" },
      ],
    })
    expect(
      errorReportRows(rows, checked, (error) => error.code, "Помилка"),
    ).toEqual([
      ["Назва", "Пошта", "Ціна", "Помилка"],
      ["", "x@b.example", "abc", "invalid; required"],
    ])
  })

  it("службове: заголовок, кількість, приклад", () => {
    expect(headerRowIndex(rows)).toBe(1)
    expect(dataRowCount(rows)).toBe(3)
    expect(columnSample(rows, 1)).toBe("a@b.example")
    expect(columnSample(rows, 2)).toBe("12,5")
  })
})

describe("шапка над таблицею", () => {
  const report = [
    ["Звіт за жовтень", null, null],
    [null, null, null],
    ["Назва", "Пошта", "Ціна"],
    ["Кава", "a@b.example", "12,5"],
    ["", "c@d.example", "abc"],
  ]
  const fields = [
    { key: "name", label: "Назва", required: true },
    { key: "email", label: "Пошта" },
    { key: "price", label: "Ціна", type: "number" as const },
  ]
  const mapping = { 0: "name", 1: "email", 2: "price" }

  it("пропонує заповнені рядки з номером і клітинками", () => {
    expect(headerRowChoices(report).slice(0, 2)).toEqual([
      { index: 0, preview: "Звіт за жовтень" },
      { index: 2, preview: "Назва, Пошта, Ціна" },
    ])
  })

  it("показує лише перші рядки й обрізає довгі", () => {
    const long = Array.from({ length: HEADER_ROW_CHOICES + 5 }, () => [
      "x".repeat(80),
    ])
    const choices = headerRowChoices(long)
    expect(choices).toHaveLength(HEADER_ROW_CHOICES)
    expect(choices[0]?.preview).toHaveLength(61)
  })

  it("дані йдуть лише під вибраним рядком, номер лишається з Excel", () => {
    const built = buildRows(report, mapping, fields, 2)
    expect(built.rows).toEqual([
      { row: 4, values: { name: "Кава", email: "a@b.example", price: 12.5 } },
    ])
    expect([...built.invalid.keys()]).toEqual([5])
  })

  it("без вибору заголовок лишається першим заповненим рядком", () => {
    expect(dataRowCount(report)).toBe(3)
    expect(dataRowCount(report, 2)).toBe(2)
    expect(columnSample(report, 2)).toBe("Ціна")
    expect(columnSample(report, 2, 2)).toBe("12,5")
  })

  it("межі рахуються від вибраного рядка", () => {
    const sheet = { name: "A", rows: report, truncated: false }
    expect(sheetIssue(sheet, 2, 2)).toBeNull()
    expect(sheetIssue(sheet, 2)).toBe("too_many_rows")
    expect(sheetIssue(sheet, 10, 4)).toBe("no_rows")
  })

  it("файл помилок несе вибраний заголовок, а не шапку", () => {
    const checked = [
      { row: 5, action: "invalid" as const, errors: [{ code: "required" }] },
    ]
    expect(
      errorReportRows(report, checked, (error) => error.code, "Помилка", 2),
    ).toEqual([
      ["Назва", "Пошта", "Ціна", "Помилка"],
      ["", "c@d.example", "abc", "required"],
    ])
  })
})

describe("межі аркуша", () => {
  const sheet = (rows: (string | null)[][], truncated = false) => ({
    name: "A",
    rows,
    truncated,
  })

  it("без рядків даних", () => {
    expect(sheetIssue(sheet([["Назва"]]), 10)).toBe("no_rows")
  })

  it("забагато рядків і колонок", () => {
    expect(sheetIssue(sheet([["a"], ["1"]], true), 10)).toBe("too_many_rows")
    expect(sheetIssue(sheet([["a"], ["1"], ["2"]]), 1)).toBe("too_many_rows")
    const wide = Array.from({ length: IMPORT_MAX_COLUMNS + 1 }, () => "a")
    expect(sheetIssue(sheet([wide, wide]), 10)).toBe("too_many_columns")
  })

  it("звичайний аркуш", () => {
    expect(sheetIssue(sheet([["a"], ["1"]]), 10)).toBeNull()
  })
})

describe("показ", () => {
  it("шаблон: заголовки й приклад", () => {
    expect(templateRows(FIELDS)).toEqual([
      ["Назва", "Пошта", "Ціна"],
      ["Кава", null, null],
    ])
  })

  it("значення для перегляду", () => {
    const text = {
      yes: "Так",
      no: "Ні",
      number: (value: number) => `#${String(value)}`,
      date: (value: string) => `дата ${value}`,
    }
    const kind: ImportField = {
      key: "k",
      label: "K",
      options: [{ value: "goods", label: "Товар" }],
    }
    expect(fieldValueText(kind, "goods", text)).toBe("Товар")
    expect(fieldValueText(kind, "інше", text)).toBe("інше")
    expect(fieldValueText(kind, true, text)).toBe("Так")
    expect(fieldValueText(kind, 12.5, text)).toBe("#12.5")
    expect(fieldValueText(kind, undefined, text)).toBe("")
    expect(
      fieldValueText(
        { key: "d", label: "D", type: "date" },
        "2026-01-15",
        text,
      ),
    ).toBe("дата 2026-01-15")
  })
})
