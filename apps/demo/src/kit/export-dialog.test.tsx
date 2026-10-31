import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext, type RaRecord } from "ra-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ExportDialog } from "@/registry/erp/export-dialog"
import { ApiError } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import type { ExportColumn } from "@/registry/lib/exports"
import { Toaster } from "@/registry/ui/sonner"
import { waitForDialogFocus } from "@/test/dialog-focus"

interface Row extends RaRecord {
  name: string
  price: number
}

const COLUMNS: ExportColumn<Row>[] = [
  { id: "name", label: "Назва", value: (row) => row.name },
  { id: "price", label: "Ціна", value: (row) => row.price },
  { id: "note", label: "Нотатка", value: () => "x", optional: true },
]

const RECORDS: Row[] = [
  { id: "1", name: "Кава", price: 10 },
  { id: "2", name: "Чай", price: 5 },
]

function setup({
  getList = vi.fn(() =>
    Promise.resolve({ data: RECORDS, total: RECORDS.length }),
  ) as unknown as ErpDataProvider["getList"],
  selectedIds,
  maxRows,
}: {
  getList?: ErpDataProvider["getList"]
  selectedIds?: string[]
  maxRows?: number
} = {}) {
  const onOpenChange = vi.fn()
  render(
    <CoreAdminContext dataProvider={{ getList } as unknown as ErpDataProvider}>
      <ExportDialog<Row>
        open
        onOpenChange={onOpenChange}
        resource="products"
        title="Товари"
        fileName="products"
        columns={COLUMNS}
        filter={{ active: true }}
        selectedIds={selectedIds}
        maxRows={maxRows}
      />
      <Toaster />
    </CoreAdminContext>,
  )
  return { getList, onOpenChange }
}

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: "Експортувати" }))

let saved: Blob[] = []

beforeEach(() => {
  saved = []
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    saved.push(blob as Blob)
    return "blob:test"
  })
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    () => undefined,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ExportDialog", () => {
  it("збирає записи за фільтром і зберігає файл", async () => {
    const { getList, onOpenChange } = setup()
    await waitForDialogFocus()
    await submit()
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(vi.mocked(getList).mock.calls[0]?.[1]).toMatchObject({
      filter: { active: true },
      pagination: { page: 1, perPage: 500 },
    })
    expect(saved).toHaveLength(1)
    expect(await screen.findByText("Експортовано 2 записи")).toBeInTheDocument()
  })

  it("необов'язкова колонка не вибрана, усі вимикаються разом", async () => {
    setup()
    await waitForDialogFocus()
    expect(screen.getByRole("checkbox", { name: "Нотатка" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Назва" })).toBeChecked()
    // Перший клік вибирає решту, другий знімає всі.
    await userEvent.click(screen.getByRole("checkbox", { name: "Усі колонки" }))
    await userEvent.click(screen.getByRole("checkbox", { name: "Усі колонки" }))
    await submit()
    expect(
      await screen.findByText("Виберіть хоча б одну колонку"),
    ).toBeInTheDocument()
    expect(saved).toHaveLength(0)
  })

  it("вибір обсягу видно лише з вибраними записами, типово — вибране", async () => {
    const { getList } = setup({ selectedIds: ["1", "2"] })
    await waitForDialogFocus()
    expect(
      screen.getByRole("combobox", { name: "Що експортувати" }),
    ).toHaveTextContent("Вибране (2 записи)")
    await submit()
    await waitFor(() => {
      expect(vi.mocked(getList).mock.calls[0]?.[1]).toMatchObject({
        filter: { id: ["1", "2"] },
      })
    })
  })

  it("над межею пояснює, а файла немає", async () => {
    setup({ maxRows: 1 })
    await waitForDialogFocus()
    await submit()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Забагато записів: 2. У файл вміщується до 1.",
    )
    expect(saved).toHaveLength(0)
  })

  it("порожній список: повідомлення замість порожнього файла", async () => {
    setup({
      getList: vi.fn(() =>
        Promise.resolve({ data: [], total: 0 }),
      ) as unknown as ErpDataProvider["getList"],
    })
    await waitForDialogFocus()
    await submit()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Немає записів для експорту",
    )
    expect(saved).toHaveLength(0)
  })

  it("сервер віддав менше, ніж обіцяв: файла немає, причина видна", async () => {
    const { onOpenChange } = setup({
      getList: vi.fn(() =>
        Promise.resolve({ data: [], total: 5 }),
      ) as unknown as ErpDataProvider["getList"],
    })
    await waitForDialogFocus()
    await submit()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сервер віддав 0 із 5 записів",
    )
    expect(saved).toHaveLength(0)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("закриття прибирає стару помилку", async () => {
    setup({
      getList: vi.fn(() =>
        Promise.resolve({ data: [], total: 5 }),
      ) as unknown as ErpDataProvider["getList"],
    })
    await waitForDialogFocus()
    await submit()
    await screen.findByRole("alert")
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("збій сервера показує причину, а діалог лишається", async () => {
    const { onOpenChange } = setup({
      getList: vi.fn(() =>
        Promise.reject(new ApiError(403, { code: "forbidden", message: "No" })),
      ) as unknown as ErpDataProvider["getList"],
    })
    await waitForDialogFocus()
    await submit()
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("закриття під час збору скасовує запит і файла немає", async () => {
    let release = (): void => undefined
    const getList = vi.fn(
      (_resource: string, { signal }: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          release = () => {
            resolve({ data: RECORDS, total: RECORDS.length })
          }
          expect(signal).toBeDefined()
        }),
    )
    const { onOpenChange } = setup({
      getList: getList as unknown as ErpDataProvider["getList"],
    })
    await waitForDialogFocus()
    await submit()
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    const signal = (getList.mock.calls[0]?.[1] as { signal: AbortSignal })
      .signal
    expect(signal.aborted).toBe(true)
    release()
    await Promise.resolve()
    expect(saved).toHaveLength(0)
  })
})
