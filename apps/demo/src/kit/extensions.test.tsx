import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { DataTableColumn } from "@/registry/lib/data-table-core"
import {
  extendSchema,
  useExtensionFields,
  withMockValues,
  type ExtensionColumn,
  type ExtensionColumnChange,
  type ExtensionField,
} from "@/registry/lib/extension-fields"
import type { ExtensionFormChanges } from "@/registry/lib/extension-form"
import {
  applyKeyedChanges,
  extensionValue,
  mapKeyedChanges,
  type KeyedChanges,
  type Placement,
} from "@/registry/lib/extensions"

import { invoicesExtension } from "@/extensions/K2-invoices"
import { invoiceSchema, makeInvoices, type Invoice } from "@/data/invoices"
import {
  NO_INVOICES_EXTENSION,
  useExtendedInvoiceColumns,
  type InvoiceColumnId,
} from "@/pages/invoice-extension"

/** Крок 1.2 (ADR-0020): злиття за ключем, поля розширення, колонки рахунків з розширенням. */

interface Item {
  id: string
  label: string
}

const ITEMS: readonly Item[] = ["a", "b", "c"].map((id) => ({
  id,
  label: id.toUpperCase(),
}))
const ids = (items: readonly Item[]) => items.map((item) => item.id).join()

describe("applyKeyedChanges", () => {
  it("без змін — той самий список", () => {
    expect(applyKeyedChanges(ITEMS)).toBe(ITEMS)
  })

  it("сховати: невідомий ключ пропускається, закріплений — лишається", () => {
    const changes: KeyedChanges<Item> = { hide: ["b", "zzz", "a"] }
    expect(ids(applyKeyedChanges(ITEMS, changes))).toBe("c")
    expect(ids(applyKeyedChanges(ITEMS, changes, { locked: ["a"] }))).toBe(
      "a,c",
    )
  })

  it("додати: у кінець, на початок, перед і після; без орієнтира — у кінець", () => {
    const add = (place?: Placement) =>
      ids(applyKeyedChanges(ITEMS, { add: [{ id: "x", label: "X", place }] }))
    expect(add()).toBe("a,b,c,x")
    expect(add("start")).toBe("x,a,b,c")
    expect(add({ before: "b" })).toBe("a,x,b,c")
    expect(add({ after: "b" })).toBe("a,b,x,c")
    expect(add({ after: "zzz" })).toBe("a,b,c,x")
    // Орієнтир сховано: `hide` іде перед `add`.
    expect(
      ids(
        applyKeyedChanges(ITEMS, {
          hide: ["b"],
          add: [{ id: "x", label: "X", place: { after: "b" } }],
        }),
      ),
    ).toBe("a,c,x")
  })

  it("кілька нових на одному місці — у порядку add", () => {
    const add = (place: Placement) =>
      ids(
        applyKeyedChanges(ITEMS, {
          add: [
            { id: "x", label: "X", place },
            { id: "y", label: "Y", place },
          ],
        }),
      )
    expect(add("start")).toBe("x,y,a,b,c")
    expect(add({ before: "b" })).toBe("a,x,y,b,c")
    expect(add({ after: "a" })).toBe("a,x,y,b,c")
    expect(add("end")).toBe("a,b,c,x,y")
  })

  it("додати з ключем модуля — заміна: на місці чи туди, куди вказано", () => {
    const replace = (place?: Placement) =>
      applyKeyedChanges(ITEMS, { add: [{ id: "b", label: "Нове B", place }] })
        .map((item) => item.label)
        .join()
    expect(replace()).toBe("A,Нове B,C")
    expect(replace("start")).toBe("Нове B,A,C")
    // Орієнтира немає (модуль перейменував ключ) чи орієнтир — сам елемент: заміна на місці.
    expect(replace({ after: "zzz" })).toBe("A,Нове B,C")
    expect(replace({ after: "b" })).toBe("A,Нове B,C")
  })

  it("закріплений не ховається й не замінюється, а переставити можна", () => {
    const result = applyKeyedChanges(
      ITEMS,
      {
        hide: ["a"],
        add: [{ id: "a", label: "Нове A" }],
        move: [{ id: "a", place: "end" }],
      },
      { locked: ["a"] },
    )
    expect(result.map((item) => item.label).join()).toBe("B,C,A")
  })

  it("ключі модуля — у hide, move і орієнтирах — перевіряє TypeScript", () => {
    type Letter = "a" | "b" | "c"
    const typed: readonly (Item & { id: Letter })[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]
    const added: Item = { id: "x", label: "X" }
    // @ts-expect-error — модуль не має ключа "zzz"
    applyKeyedChanges(typed, { hide: ["zzz"] })
    // @ts-expect-error — орієнтир теж ключ модуля
    applyKeyedChanges(typed, { add: [{ ...added, place: { after: "zzz" } }] })
    applyKeyedChanges(typed, {
      // @ts-expect-error — місце одне: або перед, або після
      add: [{ ...added, place: { after: "a", before: "b" } }],
    })
    expect(
      ids(
        applyKeyedChanges(typed, {
          add: [{ ...added, place: { after: "a" } }],
        }),
      ),
    ).toBe("a,x,b")
  })

  it("місце не потрапляє в елемент", () => {
    const [added] = applyKeyedChanges<Item>([], {
      add: [{ id: "x", label: "X", place: "end" }],
    })
    expect(added).toEqual({ id: "x", label: "X" })
  })

  it("переставити: за орієнтиром; невідомий орієнтир чи сам елемент — лишається", () => {
    const move = (changes: KeyedChanges<Item>["move"]) =>
      ids(applyKeyedChanges(ITEMS, { move: changes }))
    expect(move([{ id: "c", place: "start" }])).toBe("c,a,b")
    expect(move([{ id: "a", place: "end" }])).toBe("b,c,a")
    expect(move([{ id: "a", place: { after: "b" } }])).toBe("b,a,c")
    expect(move([{ id: "c", place: { before: "a" } }])).toBe("c,a,b")
    expect(move([{ id: "a", place: { after: "zzz" } }])).toBe("a,b,c")
    expect(move([{ id: "a", place: { after: "a" } }])).toBe("a,b,c")
    expect(move([{ id: "zzz", place: "start" }])).toBe("a,b,c")
  })

  it("mapKeyedChanges перетворює лише додані, місця й ключі — ті самі", () => {
    const changes: KeyedChanges<{ id: string; n: number }> = {
      add: [{ id: "x", n: 1, place: { after: "a" } }],
      hide: ["b"],
      move: [{ id: "c", place: "start" }],
    }
    const mapped = mapKeyedChanges(changes, ({ id, n }) => ({
      id,
      label: String(n),
    }))
    expect(mapped).toEqual({
      add: [{ id: "x", label: "1", place: { after: "a" } }],
      hide: ["b"],
      move: [{ id: "c", place: "start" }],
    })
    expect(ids(applyKeyedChanges(ITEMS, mapped))).toBe("c,a,x")
    expect(mapKeyedChanges(undefined, (item: Item) => item)).toBeUndefined()
  })
})

describe("change: властивість елемента без заміни (ADR-0026)", () => {
  type LabelChange = Pick<Item, "label">
  const change = (
    changes: KeyedChanges<Item, string, LabelChange>,
    locked: string[] = [],
  ) => applyKeyedChanges(ITEMS, changes, { locked })

  it("змінює лише вказане; невідомий ключ і порожні властивості — без змін", () => {
    const result = change({
      change: [
        { id: "b", label: "Бе" },
        { id: "zzz", label: "?" },
        { id: "c", label: undefined },
      ],
    })
    expect(result.map((item) => item.label)).toEqual(["A", "Бе", "C"])
    // Елемент модуля не мутується: той самий масив модуля можна збирати знову.
    expect(ITEMS[1]?.label).toBe("B")
    expect(result[2]).toBe(ITEMS[2])
  })

  it("після add і до move; закріплений теж змінюється, а ключ і місце — ні", () => {
    const result = change(
      {
        add: [{ id: "x", label: "X", place: "start" }],
        change: [
          { id: "x", label: "Ікс" },
          { id: "a", label: "Альфа" },
        ],
        move: [{ id: "a", place: "end" }],
      },
      ["a"],
    )
    expect(ids(result)).toBe("x,b,c,a")
    expect(result.map((item) => item.label)).toEqual(["Ікс", "B", "C", "Альфа"])
  })

  it("без типу змін (C = never) change не пропускає TypeScript", () => {
    // @ts-expect-error — тип списку без change: властивість не можна змінити.
    const changes: KeyedChanges<Item> = { change: [{ id: "a", label: "?" }] }
    expect(changes.change).toHaveLength(1)
  })

  it("ключі й властивості змін перевіряє TypeScript", () => {
    const form: ExtensionFormChanges<"name" | "city"> = {
      change: [
        // @ts-expect-error — поля «cty» у формі модуля немає
        { id: "cty", label: { uk: "Місто", en: "City" } },
        // @ts-expect-error — у полі форми змінюють підпис і підказку, а не тип
        { id: "city", type: "text" },
      ],
    }
    const columns: KeyedChanges<
      ExtensionColumn,
      "city",
      ExtensionColumnChange
    > = {
      change: [
        // @ts-expect-error — пріоритет — число
        { id: "city", priority: "high" },
        // @ts-expect-error — поведінку на вузькому екрані лишає модуль
        { id: "city", overflow: "hide" },
      ],
    }
    const wrong: KeyedChanges<Item, string, { label: number }> = {
      change: [{ id: "a", label: 1 }],
    }
    // @ts-expect-error — властивість іншого типу, ніж у елемента модуля
    expect(applyKeyedChanges(ITEMS, wrong)).toHaveLength(3)
    expect(form.change).toHaveLength(2)
    expect(columns.change).toHaveLength(2)
  })

  it("mapKeyedChanges перетворює change окремою функцією", () => {
    const changes: KeyedChanges<Item, string, { n: number }> = {
      change: [{ id: "a", n: 1 }],
    }
    const mapped = mapKeyedChanges(
      changes,
      (item) => item,
      ({ id, n }) => ({ id, label: String(n) }),
    )
    expect(mapped?.change).toEqual([{ id: "a", label: "1" }])
    expect(applyKeyedChanges(ITEMS, mapped)[0]?.label).toBe("1")
  })
})

const FIELDS: readonly ExtensionField[] = [
  { id: "manager", type: "text", label: { uk: "Менеджер", en: "Manager" } },
  { id: "limit", type: "number", label: "Ліміт" },
  { id: "signed", type: "date", label: "Підписано" },
  { id: "vat", type: "boolean", label: "Платник ПДВ", required: true },
  {
    id: "tax",
    type: "options",
    label: "Оподаткування",
    options: [{ value: "single", label: { uk: "Єдиний податок", en: "Flat" } }],
  },
]

describe("поля розширення", () => {
  const invoice = makeInvoices(1)[0]

  it("схема пропускає нові поля й перевіряє їх; необов'язкові можуть бути порожні", () => {
    const schema = extendSchema(invoiceSchema, FIELDS)
    const full = {
      ...invoice,
      manager: "Ірина",
      limit: 10,
      signed: "2026-10-01",
      vat: true,
      tax: "single",
    }
    expect(schema.parse(full)).toEqual(full)
    expect(schema.parse({ ...invoice, vat: false, manager: null })).toEqual({
      ...invoice,
      vat: false,
      manager: null,
    })
    const bad = schema.safeParse({
      ...invoice,
      signed: "01.10.2026",
      tax: "vat",
    })
    expect(bad.error?.issues.map((issue) => issue.path.join()).sort()).toEqual([
      "signed",
      "tax",
      "vat",
    ])
    // Без розширення zod нові поля відкидає.
    expect(invoiceSchema.parse(full)).toEqual(invoice)
  })

  it("поле з ключем поля модуля — помилка розробника", () => {
    expect(() =>
      extendSchema(invoiceSchema, [{ id: "client", type: "text", label: "" }]),
    ).toThrow(/client/)
  })

  it("значення для моків — по колу; поля без них не чіпаються", () => {
    const records = withMockValues(makeInvoices(3), [
      { id: "manager", type: "text", label: "", mockValues: ["A", null] },
      { id: "limit", type: "number", label: "" },
    ])
    expect(records.map((record) => record.manager)).toEqual(["A", null, "A"])
    expect(records[0]).not.toHaveProperty("limit")
  })

  it("поле двічі з одним ключем — помилка розробника", () => {
    expect(() =>
      extendSchema(invoiceSchema, [
        { id: "manager", type: "text", label: "" },
        { id: "manager", type: "number", label: "" },
      ]),
    ).toThrow(/manager/)
  })

  it("значення з запису модуля — extensionValue", () => {
    expect(extensionValue({ manager: "Ірина" }, "manager")).toBe("Ірина")
    expect(extensionValue({}, "manager")).toBeUndefined()
    expect(extensionValue({}, "toString")).toBeUndefined()
    expect(extensionValue(null, "manager")).toBeUndefined()
  })

  it("текстом мовою інтерфейсу; колонка й поле шапки; невідоме поле — помилка", () => {
    const { result } = renderHook(() => useExtensionFields(FIELDS))
    const { text, column, entry } = result.current
    const [manager, limit, signed, vat, tax] = FIELDS
    expect(text(manager, "Ірина")).toBe("Ірина")
    expect(text(manager, "")).toBeNull()
    expect(text(limit, 12500)).toBe("12\u00a0500")
    expect(text(limit, "12")).toBeNull()
    expect(text(signed, "2026-10-01")).toBe("01.10.2026")
    expect(text(vat, false)).toBe("Ні")
    expect(text(tax, "single")).toBe("Єдиний податок")
    expect(text(tax, "other")).toBe("other")

    const col = column({ id: "manager", priority: 7 })
    expect(col).toMatchObject({
      id: "manager",
      header: "Менеджер",
      priority: 7,
    })
    expect(col.cell({ manager: "Ірина" })).toBe("Ірина")
    expect(col.cell({})).toBe("—")
    expect(column({ id: "vat", header: "ПДВ" }).header).toBe("ПДВ")
    expect(entry({ id: "tax" }, { tax: "single" })).toEqual({
      id: "tax",
      label: "Оподаткування",
      value: "Єдиний податок",
    })
    expect(() => column({ id: "zzz" })).toThrow(/zzz/)
  })

  it("зміна колонки модуля: назва мовою інтерфейсу, решта — як задано", () => {
    const { result } = renderHook(() => useExtensionFields(FIELDS))
    expect(
      result.current.columnChange({
        id: "city",
        header: { uk: "Місто клієнта", en: "Client city" },
        priority: 9,
      }),
    ).toEqual({ id: "city", header: "Місто клієнта", priority: 9 })
    expect(result.current.columnChange({ id: "city", grow: 2 })).toEqual({
      id: "city",
      header: undefined,
      grow: 2,
    })
  })

  it("той самий результат між рендерами: від нього залежать колонки списку", () => {
    const { result, rerender } = renderHook(() => useExtensionFields(FIELDS))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

describe("колонки рахунків з розширенням", () => {
  const COLUMNS: readonly (DataTableColumn<Invoice> & {
    id: InvoiceColumnId
  })[] = [
    { id: "number", header: "№", cell: (row) => row.number },
    { id: "client", header: "Клієнт", cell: (row) => row.client },
    { id: "amount", header: "Сума", cell: (row) => row.amount },
  ]

  it("без розширення — колонки модуля як є", () => {
    const { result } = renderHook(() =>
      useExtendedInvoiceColumns(COLUMNS, NO_INVOICES_EXTENSION),
    )
    expect(result.current).toBe(COLUMNS)
  })

  it("з розширенням — «Менеджер» після «Клієнт», той самий масив між рендерами", () => {
    const { result, rerender } = renderHook(() =>
      useExtendedInvoiceColumns(COLUMNS, invoicesExtension),
    )
    const first = result.current
    expect(first.map((column) => column.id)).toEqual([
      "number",
      "client",
      "manager",
      "amount",
    ])
    rerender()
    expect(result.current).toBe(first)
  })
})
