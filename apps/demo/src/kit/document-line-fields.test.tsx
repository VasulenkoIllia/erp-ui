import { zodResolver } from "@hookform/resolvers/zod"
import {
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"

import { DocumentLinesEditor } from "@/registry/erp/document-lines-editor"
import {
  useDocumentLineFields,
  useDocumentLinesSchema,
  type DocumentLinesValues,
} from "@/registry/erp/document-lines-schema"
import {
  documentBodySchemaFor,
  savedDocumentBodyLineSchema,
  savedDocumentBodyLineSchemaWith,
  type DocumentBodyLine,
  type DocumentLine,
} from "@/registry/lib/document-lines"
import { computeDocumentTotals } from "@/registry/lib/document-totals"
import {
  extensionShape,
  type ExtensionField,
} from "@/registry/lib/extension-fields"
import {
  extensionFormLines,
  extensionPayloadLines,
} from "@/registry/lib/extension-form"
import { withLineMockValues } from "@/registry/lib/mock-documents"

import { ROW } from "./document-totals.fixtures"

/** Поля розширення рядка документа (ADR-0086): контракт, значення форми й запиту, засів, редактор. */

const HS_CODE: ExtensionField = {
  id: "hsCode",
  type: "text",
  label: { uk: "Код УКТЗЕД", en: "HS code" },
  mockValues: ["8471 30 00 00", "8443 32 10 00"],
}
const ORIGIN: ExtensionField = {
  id: "origin",
  type: "options",
  label: "Країна походження",
  options: [{ value: "UA", label: "Україна" }],
}
const LINE_FIELDS = [HS_CODE, ORIGIN]

const item = (id: string, patch: Record<string, unknown> = {}) =>
  ({ ...ROW, id, ...patch }) as DocumentLine
const section = (id: string): DocumentBodyLine => ({
  kind: "section",
  id,
  title: `Розділ ${id}`,
})
const body = (lines: DocumentBodyLine[]) => ({
  lines,
  discountPercent: 0,
  discountAmount: 0,
})

describe("контракт: поля розширення в рядку товару", () => {
  const shape = extensionShape(LINE_FIELDS)

  it("тіло документа зберігає значення полів рядка; без полів розширення — відкидає їх, як було", () => {
    const value = body([
      item("1", { hsCode: "8471 30 00 00", origin: "UA" }),
      section("s1"),
      item("2"),
    ])
    const parsed = documentBodySchemaFor(2, shape).parse(value)
    expect(parsed.lines[0]).toMatchObject({
      hsCode: "8471 30 00 00",
      origin: "UA",
    })
    expect(parsed.lines[1]).toEqual(section("s1"))
    expect(parsed.lines[2]).not.toHaveProperty("hsCode")
    expect(documentBodySchemaFor(2).parse(value).lines[0]).not.toHaveProperty(
      "hsCode",
    )
  })

  it("значення не того типу чи поза списком — помилка біля поля рядка", () => {
    const result = documentBodySchemaFor(2, shape).safeParse(
      body([item("1", { hsCode: 8471, origin: "PL" })]),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "lines.0.hsCode",
      "lines.0.origin",
    ])
  })

  it("збережені рядки: значення полів лишаються поруч із сумами сервера", () => {
    const totals = computeDocumentTotals([ROW], 2)?.lines[0]
    const saved = { ...ROW, totals, hsCode: "8471 30 00 00" }
    expect(savedDocumentBodyLineSchemaWith(shape).parse(saved)).toMatchObject({
      hsCode: "8471 30 00 00",
      totals,
    })
    expect(savedDocumentBodyLineSchemaWith(undefined)).toBe(
      savedDocumentBodyLineSchema,
    )
    expect(savedDocumentBodyLineSchemaWith({})).toBe(
      savedDocumentBodyLineSchema,
    )
  })

  it("ключ поля рядка, що збігається з полем рядка кіта, — помилка розробника й у схемі форми", () => {
    const clash = extensionShape([{ ...HS_CODE, id: "price" }])
    expect(() => documentBodySchemaFor(2, clash)).toThrow(
      'extension line field "price" clashes',
    )
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      expect(() =>
        renderHook(() => useDocumentLinesSchema("UAH", clash)),
      ).toThrow('extension line field "price" clashes')
    } finally {
      quiet.mockRestore()
    }
  })
})

describe("значення форми й запиту", () => {
  const lines = [
    item("1", { hsCode: "8471 30 00 00" }),
    section("s1"),
    item("2"),
  ]

  it("форма: у рядку товару — значення полів для форми, порожні — порожні; розділ — без них", () => {
    const form = extensionFormLines(LINE_FIELDS, lines)
    expect(form[0]).toMatchObject({ hsCode: "8471 30 00 00" })
    expect(form[1]).toEqual(section("s1"))
    expect(form[2]).toHaveProperty("hsCode")
    expect(form[2]).toHaveProperty("origin")
    expect(extensionFormLines([], lines)).toEqual(lines)
  })

  it("запит: порожнє поле розширення — `null`, заповнене — як є", () => {
    const payload = extensionPayloadLines(
      LINE_FIELDS,
      extensionFormLines(LINE_FIELDS, lines),
    )
    expect(payload[0]).toMatchObject({ hsCode: "8471 30 00 00", origin: null })
    expect(payload[2]).toMatchObject({ hsCode: null, origin: null })
    expect(payload[1]).toEqual(section("s1"))
  })
})

describe("засів моків: `mockValues` полів рядка", () => {
  it("рядки товарів по черзі через документи, хоч `id` рядків у документах однакові", () => {
    const documents = [
      { id: "d1", lines: [item("1"), section("s1"), item("2")] },
      { id: "d2", lines: [item("1")] },
    ]
    const seeded = withLineMockValues(documents, [HS_CODE])
    expect(
      seeded.map((document) =>
        document.lines.map((line) =>
          "hsCode" in line ? line.hsCode : line.kind,
        ),
      ),
    ).toEqual([
      ["8471 30 00 00", "section", "8443 32 10 00"],
      ["8471 30 00 00"],
    ])
    expect(withLineMockValues(documents, undefined)).toBe(documents)
  })
})

function Editor({
  initial,
  onSubmit,
  readOnly,
}: {
  initial: DocumentLinesValues
  onSubmit: (values: DocumentLinesValues) => void
  readOnly?: boolean
}) {
  const lineExt = useDocumentLineFields(LINE_FIELDS)
  const schema = useDocumentLinesSchema("UAH", lineExt.shape)
  const form = useForm<DocumentLinesValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: { ...initial, lines: lineExt.formLines(initial.lines) },
  })
  return (
    <form
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          onSubmit({ ...values, lines: lineExt.payloadLines(values.lines) })
        })(event)
      }
    >
      <DocumentLinesEditor
        form={form}
        currency="UAH"
        units={[]}
        taxes={[]}
        lineFields={lineExt.fields}
        readOnly={readOnly}
      />
      <button type="submit">Зберегти</button>
    </form>
  )
}

describe("редактор рядків із полями розширення", () => {
  it("поле під назвою з підписом; новий рядок — з порожнім полем; значення йдуть у запит", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(values: DocumentLinesValues) => void>()
    render(
      <Editor
        initial={body([
          item("1", { name: "Ноутбук", hsCode: "8471 30 00 00" }),
        ])}
        onSubmit={onSubmit}
      />,
    )
    const first = screen.getByRole("group", { name: "Рядок 1" })
    expect(within(first).getByLabelText("Код УКТЗЕД")).toHaveValue(
      "8471 30 00 00",
    )
    expect(
      within(first).getByRole("combobox", { name: "Країна походження" }),
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Додати рядок" }))
    const added = screen.getByRole("group", { name: "Рядок 2" })
    expect(within(added).getByLabelText("Код УКТЗЕД")).toHaveValue("")
    await user.type(within(added).getByLabelText("Назва"), "Принтер")
    await user.type(within(added).getByLabelText("Код УКТЗЕД"), "8443")
    const price = within(added).getByLabelText("Ціна")
    await user.clear(price)
    await user.type(price, "10")

    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce()
    })
    expect(onSubmit.mock.calls[0]?.[0].lines).toMatchObject([
      { name: "Ноутбук", hsCode: "8471 30 00 00", origin: null },
      { name: "Принтер", hsCode: "8443", origin: null },
    ])
  })

  it("лише для читання: значення без підказки, порожнє поле не схоже на незаповнене для введення", () => {
    render(
      <Editor
        initial={body([item("1", { hsCode: "8471 30 00 00" }), item("2")])}
        onSubmit={() => undefined}
        readOnly
      />,
    )
    const filled = within(screen.getByRole("group", { name: "Рядок 1" }))
    expect(filled.getByLabelText("Код УКТЗЕД")).toHaveValue("8471 30 00 00")
    const empty = within(
      screen.getByRole("group", { name: "Рядок 2" }),
    ).getByLabelText("Код УКТЗЕД")
    expect(empty).toHaveAttribute("readonly")
    expect(empty).not.toHaveAttribute("placeholder")
  })
})
