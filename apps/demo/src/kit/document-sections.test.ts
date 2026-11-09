import { describe, expect, it } from "vitest"

import { sectionSums } from "@/registry/erp/document-lines-preview"
import {
  copiedDocumentLines,
  documentBodySchemaFor,
  itemLinesOf,
  NOTE_TEXT_MAX,
  savedDocumentBodyLineSchema,
  SECTION_TITLE_MAX,
  type DocumentBodyLine,
  type DocumentLine,
} from "@/registry/lib/document-lines"
import { computeDocumentTotals } from "@/registry/lib/document-totals"

import { ROW, VAT_20 } from "./document-totals.fixtures"

/** Розділи й нотатки в рядках документа (UI05b, ADR-0060): контракт, підсумки, суми розділів. */

const section = (id: string, title = `Розділ ${id}`): DocumentBodyLine => ({
  kind: "section",
  id,
  title,
})
const note = (id: string, text = "Гарантія 12 місяців"): DocumentBodyLine => ({
  kind: "note",
  id,
  text,
})
const item = (
  id: string,
  price: string,
  patch: Partial<DocumentLine> = {},
): DocumentBodyLine => ({ ...ROW, id, price, ...patch })

const body = (lines: DocumentBodyLine[], discountAmount = 0) => ({
  lines,
  discountPercent: 0,
  discountAmount,
})

describe("контракт розділів і нотаток", () => {
  it("тіло документа приймає розділи й нотатки серед рядків, порядок — порядок масиву", () => {
    const value = body([
      item("0", "5"),
      section("s1"),
      item("1", "10"),
      note("n1"),
      section("s2"),
      item("2", "20"),
    ])
    const parsed = documentBodySchemaFor(2).parse(value)
    expect(parsed.lines.map((line) => line.kind)).toEqual([
      "item",
      "section",
      "item",
      "note",
      "section",
      "item",
    ])
  })

  it("назва розділу й текст нотатки обов'язкові, з межею довжини", () => {
    const schema = documentBodySchemaFor(2)
    for (const line of [
      section("s", " "),
      section("s", "я".repeat(SECTION_TITLE_MAX + 1)),
      note("n", ""),
      note("n", "я".repeat(NOTE_TEXT_MAX + 1)),
      { kind: "group", id: "g", title: "Інше" },
      { ...ROW, kind: undefined },
    ])
      expect(schema.safeParse(body([line as DocumentBodyLine])).success).toBe(
        false,
      )
  })

  it("підсумки й межі сум бачать лише рядки товарів", () => {
    const lines = [section("s1"), item("1", "100"), note("n1"), item("2", "50")]
    expect(itemLinesOf(lines).map((line) => line.id)).toEqual(["1", "2"])
    // Знижка документа 150,01 ₴ більша за суму рядків 150 ₴: розділ і нотатка її не збільшують.
    const issues = documentBodySchemaFor(2).safeParse(body(lines, 15_001)).error
      ?.issues
    expect(issues?.map((issue) => issue.path)).toEqual([["discountAmount"]])
    expect(
      documentBodySchemaFor(2).safeParse(body(lines, 15_000)).success,
    ).toBe(true)
  })

  it("збережені рядки: суми сервера лише в рядках товарів", () => {
    const totals = computeDocumentTotals([ROW], 2)?.lines[0]
    expect(
      savedDocumentBodyLineSchema.safeParse({ ...ROW, totals }).success,
    ).toBe(true)
    expect(savedDocumentBodyLineSchema.safeParse(ROW).success).toBe(false)
    expect(savedDocumentBodyLineSchema.safeParse(section("s")).success).toBe(
      true,
    )
  })
})

describe("суми розділів", () => {
  it("сума колонки «Сума» рядків розділу: знижка рядка вже врахована, податок зверху — ні", () => {
    const sums = sectionSums(
      [
        item("0", "999"),
        section("s1"),
        item("1", "100", {
          quantity: "2",
          tax: { ...VAT_20, name: "ПДВ 20%" },
        }),
        note("n1"),
        item("2", "50", { discountPercent: 10 }),
        section("s2"),
        section("s3"),
        item("3", "10", { discountAmount: 500 }),
      ],
      2,
    )
    // Рядок до першого розділу ні до якого розділу не належить.
    expect([...sums]).toEqual([
      ["s1", 20_000 + 4_500],
      ["s2", 0],
      ["s3", 500],
    ])
  })

  it("рядок, який ще не порахувати, у суму розділу не йде", () => {
    const sums = sectionSums(
      [
        section("s1"),
        item("1", "100"),
        item("2", ""),
        item("3", "10", { discountAmount: 5_000 }),
      ],
      2,
    )
    expect(sums.get("s1")).toBe(10_000)
  })

  it("збережений документ лише для читання: сума розділу з сум рядків сервера", () => {
    // Сервер порахував інакше (тут — за кількістю 3): показуємо його числа, а не свої.
    const totals = computeDocumentTotals([{ ...ROW, quantity: "3" }], 2)
      ?.lines[0]
    const lines = [section("s1"), { ...ROW, totals }]
    expect(sectionSums(lines, 2).get("s1")).toBe(1_000)
    expect(sectionSums(lines, 2, true).get("s1")).toBe(3_000)
  })
})

describe("копія рядків для нової форми (ADR-0067)", () => {
  it("ті самі рядки, розділи й нотатки в тому самому порядку з новими id, без сум сервера", () => {
    const lines = [section("s1"), item("l1", "100"), note("n1")]
    const sums = computeDocumentTotals(itemLinesOf(lines), 2, body(lines))
    if (!sums) throw new Error("totals")
    const saved = savedDocumentBodyLineSchema
      .array()
      .parse(
        lines.map((line, index) =>
          line.kind === "item"
            ? { ...line, totals: sums.lines[index - 1] }
            : line,
        ),
      )
    const copied = copiedDocumentLines(saved)
    expect(copied.map((line) => line.kind)).toEqual(["section", "item", "note"])
    expect(copied.some((line) => "totals" in line)).toBe(false)
    const ids = copied.map((line) => line.id)
    expect(ids.some((id) => ["s1", "l1", "n1"].includes(id))).toBe(false)
    expect(new Set(ids).size).toBe(3)
    expect(copied[1]).toMatchObject({ kind: "item", price: "100" })
    expect(documentBodySchemaFor(2).safeParse(body(copied)).success).toBe(true)
  })
})
