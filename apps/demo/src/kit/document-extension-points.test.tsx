import { QueryClient } from "@tanstack/react-query"
import { render, renderHook, screen, within } from "@testing-library/react"
import { CoreAdminContext } from "ra-core"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { PrintPreview } from "@/registry/erp/print-preview"
import {
  PrintExtensionFields,
  PrintSheetBlocks,
  useSheetBlocks,
  useSheetLineDetails,
  type ExtensionSheetBlock,
  type SheetSlotProps,
} from "@/registry/erp/print-sheet-blocks"
import {
  groupFormItems,
  RecordFormFields,
  type RecordFormItem,
} from "@/registry/erp/record-form"
import type { RowSelection } from "@/registry/hooks/use-row-selection"
import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import type { DocumentLine } from "@/registry/lib/document-lines"
import type { ExtensionField } from "@/registry/lib/extension-fields"
import type { KeyedChanges } from "@/registry/lib/extensions"
import {
  createModuleSheetT,
  type ModuleStrings,
} from "@/registry/lib/i18n-namespaces"
import { createModuleContext } from "@/registry/lib/module"
import type { ListReportState } from "@/registry/templates/list-report"
import {
  ROW_ACTIONS_COLUMN,
  useListSlots,
  type BulkSlotProps,
  type ExtensionRowAction,
  type ListRowSlotProps,
  type ListSlotsExtension,
} from "@/registry/templates/list-report-slots"

/**
 * Точки розширення документа (ADR-0086, частина друга): дії рядка й масові дії списку, групи полів
 * форми, блоки аркуша й поля розширення на ньому, назва аркуша рядками модуля мовою документа.
 */

interface Doc {
  id: string
  number: string
  deniedActions?: Record<string, string>
}

const RESOURCE = "docs"

const meWith = (permissions: string[]): Me => ({
  id: "u1",
  name: "Оксана",
  email: "o@example.com",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

function withMe(permissions: string[], node: React.ReactNode) {
  const queryClient = new QueryClient()
  queryClient.setQueryData<Me>(ME_QUERY_KEY, meWith(permissions))
  return <CoreAdminContext queryClient={queryClient}>{node}</CoreAdminContext>
}

const quietErrors = <T,>(run: () => T): T => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
  try {
    return run()
  } finally {
    spy.mockRestore()
  }
}

describe("useListSlots: дії рядка й масові дії розширення", () => {
  const selection: RowSelection = {
    state: {} as RowSelection["state"],
    isSelected: () => false,
    toggle: () => undefined,
    setRows: () => undefined,
    selectAll: () => undefined,
    clear: () => undefined,
  }
  const report = {
    resource: RESOURCE,
    selection,
    list: { queryFilter: { status: "issued" } },
  } as unknown as Pick<ListReportState, "resource" | "selection" | "list">
  const COLUMNS: readonly DataTableColumn<Doc>[] = [
    { id: "number", header: "Номер", cell: (row) => row.number },
  ]
  type BulkId = "submit" | "delete"
  const BULK = {
    rowLabel: (row: Doc) => `документ ${row.number}`,
    actions: [
      { id: "submit" as const, render: () => <button>Провести</button> },
      { id: "delete" as const, render: () => <button>Видалити</button> },
    ],
  }
  const NO_BULK = { rowLabel: BULK.rowLabel, actions: [] }

  function PrintRow({ record, resource }: ListRowSlotProps<Doc>) {
    return (
      <button>
        Друк {record.number} ({resource})
      </button>
    )
  }
  function ArchiveRow({ record }: ListRowSlotProps<Doc>) {
    return <button>Архів {record.number}</button>
  }
  function ExportBulk({ count, filter, resource }: BulkSlotProps) {
    return (
      <button>
        Вивантажити {count} {resource} {String(filter.status)}
      </button>
    )
  }

  function List({
    extension,
    bulk = BULK,
    rows,
  }: {
    extension: ListSlotsExtension<Doc, BulkId> | undefined
    bulk?: typeof BULK | typeof NO_BULK
    rows: Doc[]
  }) {
    const slots = useListSlots<Doc, BulkId>(report, COLUMNS, bulk, extension)
    return (
      <>
        <p data-testid="columns">
          {slots.columns.map((column) => column.id).join(",")}
        </p>
        {rows.map((row) => (
          <div key={row.id} data-testid={`row-${row.id}`}>
            {slots.columns.at(-1)?.cell(row)}
          </div>
        ))}
        <div data-testid="bulk">
          {slots.bulk
            ? slots.bulk.actions.map((action) => (
                <React.Fragment key={action.id}>
                  {action.render(3)}
                </React.Fragment>
              ))
            : "без вибору"}
        </div>
      </>
    )
  }

  const ROW_ACTIONS: KeyedChanges<ExtensionRowAction<Doc>, never> = {
    add: [
      { id: "print", component: PrintRow },
      {
        id: "archive",
        component: ArchiveRow,
        access: "archive",
        place: "start",
      },
    ],
  }

  it("без розширення — ті самі колонки й масові дії модуля", () => {
    const { result } = renderHook(() =>
      useListSlots<Doc, BulkId>(report, COLUMNS, BULK, undefined),
    )
    expect(result.current.columns).toBe(COLUMNS)
    expect(result.current.bulk?.actions.map((action) => action.id)).toEqual([
      "submit",
      "delete",
    ])
  })

  it("дії рядка — колонка в кінці; компонент отримує запис і ресурс, дія з правом — лише з правом", () => {
    render(
      withMe(
        [`${RESOURCE}:read`],
        <List
          extension={{ rowActions: ROW_ACTIONS }}
          rows={[{ id: "d1", number: "1" }]}
        />,
      ),
    )
    expect(screen.getByTestId("columns")).toHaveTextContent(
      `number,${ROW_ACTIONS_COLUMN}`,
    )
    const row = screen.getByTestId("row-d1")
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Друк 1 (docs)"])
  })

  it("дія рядка з правом: є з правом, немає, коли запис її забороняє (`deniedActions`)", () => {
    render(
      withMe(
        [`${RESOURCE}:*`],
        <List
          extension={{ rowActions: ROW_ACTIONS }}
          rows={[
            { id: "d1", number: "1" },
            { id: "d2", number: "2", deniedActions: { archive: "locked" } },
          ]}
        />,
      ),
    )
    expect(
      within(screen.getByTestId("row-d1"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Архів 1", "Друк 1 (docs)"])
    expect(
      within(screen.getByTestId("row-d2"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Друк 2 (docs)"])
  })

  it("дія рядка, що впала, зникає лише сама", () => {
    const Broken = () => {
      throw new Error("slot")
    }
    quietErrors(() =>
      render(
        withMe(
          [`${RESOURCE}:*`],
          <List
            extension={{
              rowActions: {
                add: [
                  { id: "broken", component: Broken },
                  { id: "print", component: PrintRow },
                ],
              },
            }}
            rows={[{ id: "d1", number: "1" }]}
          />,
        ),
      ),
    )
    expect(
      within(screen.getByTestId("row-d1"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Друк 1 (docs)"])
  })

  it("масові дії: розширення додає свою з кількістю й фільтром, ховає й переставляє дію модуля", () => {
    render(
      withMe(
        [`${RESOURCE}:*`],
        <List
          extension={{
            bulkActions: {
              add: [{ id: "export", component: ExportBulk, place: "start" }],
              hide: ["delete"],
            },
          }}
          rows={[]}
        />,
      ),
    )
    expect(
      within(screen.getByTestId("bulk"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Вивантажити 3 docs issued", "Провести"])
  })

  it("масова дія з правом — лише з правом (`export` кіт зводить до читання, тож тут `approve`)", () => {
    render(
      withMe(
        [`${RESOURCE}:read`],
        <List
          extension={{
            bulkActions: {
              add: [{ id: "export", component: ExportBulk, access: "approve" }],
            },
          }}
          rows={[]}
        />,
      ),
    )
    expect(
      within(screen.getByTestId("bulk"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Провести", "Видалити"])
  })

  it("модуль без масових дій: дія розширення вмикає вибір; без дій зовсім — вибору немає", () => {
    const { unmount } = render(
      withMe(
        [`${RESOURCE}:*`],
        <List
          bulk={NO_BULK}
          extension={{
            bulkActions: { add: [{ id: "export", component: ExportBulk }] },
          }}
          rows={[]}
        />,
      ),
    )
    expect(screen.getByTestId("bulk")).toHaveTextContent(
      "Вивантажити 3 docs issued",
    )
    unmount()
    render(
      withMe(
        [`${RESOURCE}:*`],
        <List bulk={NO_BULK} extension={{}} rows={[]} />,
      ),
    )
    expect(screen.getByTestId("bulk")).toHaveTextContent("без вибору")
  })
})

describe("групи полів форми", () => {
  const field = (id: string, label: string): RecordFormItem => ({
    id,
    label,
    render: ({ label: text }) => <label>{text}</label>,
  })
  const ITEMS = [
    field("name", "Назва"),
    field("contract", "Договір"),
    field("signed", "Підписано"),
    field("manager", "Менеджер"),
  ]

  it("поле — у першій групі, що його називає; невідомий ключ пропускає, порожня група зникає", () => {
    const split = groupFormItems(ITEMS, [
      { id: "contract", title: "Договір", fields: ["signed", "contract"] },
      { id: "again", title: "Ще раз", fields: ["contract", "hidden"] },
      { id: "team", title: "Команда", fields: ["manager"] },
    ])
    expect(split.rest.map((item) => item.id)).toEqual(["name"])
    expect(
      split.groups.map(({ group, items }) => [
        group.id,
        items.map((item) => item.id),
      ]),
    ).toEqual([
      ["contract", ["signed", "contract"]],
      ["team", ["manager"]],
    ])
  })

  it("без груп — усі поля однією сіткою, як було", () => {
    expect(groupFormItems(ITEMS).rest).toEqual(ITEMS)
    render(<RecordFormFields items={ITEMS} />)
    expect(screen.queryByRole("group")).toBeNull()
    expect(screen.getAllByText(/./).map((node) => node.textContent)).toEqual([
      "Назва",
      "Договір",
      "Підписано",
      "Менеджер",
    ])
  })

  it("група — набір полів із назвою й описом після полів без групи", () => {
    render(
      <RecordFormFields
        items={ITEMS}
        groups={[
          {
            id: "contract",
            title: "Договір",
            description: "Умови з клієнтом",
            fields: ["contract", "signed"],
          },
        ]}
      />,
    )
    const group = screen.getByRole("group", { name: "Договір" })
    expect(group).toHaveAttribute("data-slot", "record-form-group")
    expect(within(group).getByText("Умови з клієнтом")).toBeVisible()
    expect(
      within(group)
        .getAllByText(/^(Договір|Підписано|Назва|Менеджер)$/)
        .filter((node) => node.tagName === "LABEL")
        .map((node) => node.textContent),
    ).toEqual(["Договір", "Підписано"])
    // Поля без групи — першими, перед групою.
    const labels = [...document.querySelectorAll("label")].map(
      (node) => node.textContent,
    )
    expect(labels).toEqual(["Назва", "Менеджер", "Договір", "Підписано"])
  })
})

describe("аркуш: блоки зі змінами розширення", () => {
  type BlockId = "title" | "lines" | "totals"
  const record: Doc = { id: "d1", number: "РХ-1" }
  const BLOCKS = [
    { id: "title" as const, node: <h2>Рахунок</h2> },
    { id: "lines" as const, node: <p>Рядки</p> },
    { id: "totals" as const, node: <p>Разом</p> },
  ]
  function Terms({ record: doc, resource }: SheetSlotProps<Doc>) {
    return (
      <p>
        Умови {doc.number} ({resource})
      </p>
    )
  }
  function Sheet({
    changes,
  }: {
    changes: KeyedChanges<ExtensionSheetBlock<Doc>, BlockId> | undefined
  }) {
    const blocks = useSheetBlocks(BLOCKS, {
      record,
      resource: RESOURCE,
      changes,
    })
    return (
      <div data-testid="sheet">
        <PrintSheetBlocks blocks={blocks} />
      </div>
    )
  }
  const texts = () =>
    [...screen.getByTestId("sheet").children].map((node) => node.textContent)

  it("без змін — блоки модуля по порядку", () => {
    render(<Sheet changes={undefined} />)
    expect(texts()).toEqual(["Рахунок", "Рядки", "Разом"])
  })

  it("блок проекту після підсумків із записом і ресурсом; блок модуля сховано й переставлено", () => {
    render(
      <Sheet
        changes={{
          add: [{ id: "terms", component: Terms, place: { after: "totals" } }],
          hide: ["lines"],
          move: [{ id: "title", place: "end" }],
        }}
      />,
    )
    expect(texts()).toEqual(["Разом", "Умови РХ-1 (docs)", "Рахунок"])
  })

  it("блок проекту, що впав, зникає сам, аркуш лишається", () => {
    const Broken = () => {
      throw new Error("block")
    }
    quietErrors(() =>
      render(
        <Sheet changes={{ add: [{ id: "broken", component: Broken }] }} />,
      ),
    )
    expect(texts()).toEqual(["Рахунок", "Рядки", "Разом"])
  })
})

describe("аркуш: поля розширення мовою документа", () => {
  const FIELDS: readonly ExtensionField[] = [
    { id: "contract", type: "text", label: { uk: "Договір", en: "Contract" } },
    { id: "signed", type: "date", label: { uk: "Підписано", en: "Signed" } },
    {
      id: "vat",
      type: "boolean",
      label: { uk: "Платник ПДВ", en: "VAT payer" },
    },
    {
      id: "tax",
      type: "options",
      label: { uk: "Оподаткування", en: "Taxation" },
      options: [
        { value: "single", label: { uk: "Єдиний податок", en: "Single tax" } },
      ],
    },
    { id: "limit", type: "number", label: { uk: "Ліміт", en: "Limit" } },
    { id: "note", type: "text", label: "Нотатка" },
  ]
  const RECORD = {
    contract: "№ 15/2026",
    signed: "2026-11-04",
    vat: false,
    tax: "single",
    limit: 12500.5,
    note: "",
  }
  const SHOWN = [
    { id: "tax" },
    { id: "contract" },
    { id: "signed" },
    { id: "vat" },
    { id: "limit" },
    { id: "note" },
    { id: "missing" },
  ]
  const entries = (root: HTMLElement) =>
    // Групи розрядів і дробу Intl — нерозривні пробіли: у звірці — звичайні.
    [...root.querySelectorAll("dl > div")].map((node) =>
      (node.textContent ?? "").replace(/\s/gu, " "),
    )

  it("ключі `print.fields` по порядку; порожнє значення й невідомий ключ не друкуються", () => {
    render(
      <PrintExtensionFields record={RECORD} fields={FIELDS} shown={SHOWN} />,
    )
    const list = document.querySelector('[data-slot="print-extension-fields"]')
    expect(list).not.toBeNull()
    expect(entries(document.body)).toEqual([
      "Оподаткування: Єдиний податок",
      "Договір: № 15/2026",
      "Підписано: 04.11.2026",
      "Платник ПДВ: Ні",
      "Ліміт: 12 500,5",
    ])
  })

  it("нічого показати — блоку немає", () => {
    const { container } = render(
      <PrintExtensionFields record={{}} fields={FIELDS} shown={SHOWN} />,
    )
    expect(container).toBeEmptyDOMElement()
    render(
      <PrintExtensionFields
        record={RECORD}
        fields={FIELDS}
        shown={undefined}
      />,
    )
    expect(
      document.querySelector('[data-slot="print-extension-fields"]'),
    ).toBeNull()
  })

  it("англійський аркуш в українському інтерфейсі: підписи, «No», числа й дати англійською", async () => {
    render(
      <PrintPreview title="Invoice 1" language="en">
        <PrintExtensionFields record={RECORD} fields={FIELDS} shown={SHOWN} />
      </PrintPreview>,
    )
    const list = await screen.findByText(
      (_, node) => node?.getAttribute("data-slot") === "print-extension-fields",
    )
    expect(entries(list)).toEqual([
      "Taxation: Single tax",
      "Contract: № 15/2026",
      "Signed: 04/11/2026",
      "VAT payer: No",
      "Limit: 12,500.5",
    ])
  })

  it("поля рядка під назвою: «Код УКТЗЕД: …» лише в рядках зі значенням; без полів — `undefined`", () => {
    const hsCode: ExtensionField = {
      id: "hsCode",
      type: "text",
      label: { uk: "Код УКТЗЕД", en: "HS code" },
    }
    const { result } = renderHook(() => useSheetLineDetails([hsCode]))
    const details = result.current
    if (!details) throw new Error("details")
    const line = { kind: "item", id: "l1", name: "Ноутбук" } as DocumentLine
    render(
      <div data-testid="with">
        {details({ ...line, hsCode: "8471 30 00 00" } as DocumentLine)}
      </div>,
    )
    expect(screen.getByTestId("with")).toHaveTextContent(
      "Код УКТЗЕД: 8471 30 00 00",
    )
    expect(details(line)).toBeNull()
    expect(
      renderHook(() => useSheetLineDetails(undefined)).result.current,
    ).toBeUndefined()
    expect(
      renderHook(() => useSheetLineDetails([])).result.current,
    ).toBeUndefined()
  })
})

describe("createModuleSheetT: рядки модуля мовою документа", () => {
  interface SheetMessages {
    readonly sheet: { readonly title: string; readonly due: string }
  }
  interface SheetExtension {
    readonly strings?: ModuleStrings<SheetMessages>
  }
  const [SheetContext, useSheetModule] = createModuleContext<{
    extension: SheetExtension
    paths: Record<string, never>
    preload: () => void
  }>("X2-sheet", "createSheetModule")
  const UK: SheetMessages = {
    sheet: { title: "Рахунок на оплату", due: "Сплатити до {{date}}" },
  }
  const EN: SheetMessages = {
    sheet: { title: "Invoice", due: "Due by {{date}}" },
  }

  function provide(strings: ModuleStrings<SheetMessages> | undefined) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <SheetContext.Provider
          value={{
            extension: { strings },
            paths: {},
            preload: () => undefined,
          }}
        >
          {children}
        </SheetContext.Provider>
      )
    }
  }

  it("українська — одразу, з перевизначеннями `strings` розширення", () => {
    const useSheetT = createModuleSheetT<SheetMessages>(
      "X2-sheet-uk",
      UK,
      () => Promise.resolve(EN),
      useSheetModule,
    )
    const { result } = renderHook(() => useSheetT("uk"), {
      wrapper: provide({ uk: { sheet: { title: "Рахунок-фактура" } } }),
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.t("sheet.title")).toBe("Рахунок-фактура")
    expect(result.current.t("sheet.due", { date: "4 листопада" })).toBe(
      "Сплатити до 4 листопада",
    )
  })

  it("англійська вантажиться без призупинення: спершу `isLoading`, потім рядки англійською", async () => {
    const loadEn = vi.fn(() => Promise.resolve(EN))
    const useSheetT = createModuleSheetT<SheetMessages>(
      "X2-sheet-en",
      UK,
      loadEn,
      useSheetModule,
    )
    function Title() {
      const { t, isLoading } = useSheetT("en")
      return <h2>{isLoading ? "чекаємо" : t("sheet.title")}</h2>
    }
    render(<Title />, { wrapper: provide(undefined) })
    expect(screen.getByRole("heading")).toHaveTextContent("чекаємо")
    expect(
      await screen.findByRole("heading", { name: "Invoice" }),
    ).toBeVisible()
    expect(loadEn).toHaveBeenCalledTimes(1)
  })

  it("англійська не довантажилась — запасна українська, без нових запитів на кожен рендер", async () => {
    const loadEn = vi.fn(() => Promise.reject(new Error("offline")))
    const useSheetT = createModuleSheetT<SheetMessages>(
      "X2-sheet-offline",
      UK,
      loadEn,
      useSheetModule,
    )
    function Title() {
      const { t, isLoading } = useSheetT("en")
      return <h2>{isLoading ? "чекаємо" : t("sheet.title")}</h2>
    }
    const { rerender } = render(<Title />, { wrapper: provide(undefined) })
    expect(
      await screen.findByRole(
        "heading",
        { name: "Рахунок на оплату" },
        { timeout: 3000 },
      ),
    ).toBeVisible()
    const calls = loadEn.mock.calls.length
    rerender(<Title />)
    expect(screen.getByRole("heading")).toHaveTextContent("Рахунок на оплату")
    expect(loadEn).toHaveBeenCalledTimes(calls)
  })
})
