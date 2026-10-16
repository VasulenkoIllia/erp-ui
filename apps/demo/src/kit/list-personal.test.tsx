import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CoreAdminContext,
  type DataProvider,
  type GetListParams,
  type Identifier,
} from "ra-core"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { PinToggle } from "@/registry/erp/pin-toggle"
import { ApiError } from "@/registry/lib/api"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import type { ListSettings } from "@/registry/lib/list-settings"
import type { ListDefaults } from "@/registry/lib/list-state"
import { isPinned, PIN_LIMIT_CODE } from "@/registry/lib/pins"
import {
  ListReport,
  useListReport,
  type ListReportProps,
} from "@/registry/templates/list-report"

/** Крок 1.3b (ADR-0024): запам'ятаний розмір сторінки й закріплення в List Report. */

interface Row {
  id: string
  name: string
  pinned?: boolean
}

const TOTAL = 45
const ROWS: Row[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: `r-${String(i + 1)}`,
  name: `Запис ${String(i + 1)}`,
}))
const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "name", order: "ASC" },
  sortFields: ["name"],
}
const COLUMNS: DataTableColumn<Row>[] = [
  { id: "name", header: "Назва", cell: (row) => row.name, card: "title" },
]

type Deferred = { resolve: () => void; reject: (error: unknown) => void }

function fakeServer({
  settings = (): Promise<ListSettings> => Promise.resolve({ perPage: null }),
  pinned = [] as string[],
} = {}) {
  const pins = [...pinned]
  const pending: Deferred[] = []
  const getList = vi.fn((resource: string, params: GetListParams) => {
    // Збережені види (`me/views`) — без жодного.
    if (resource !== "records") return Promise.resolve({ data: [], total: 0 })
    const { page = 1, perPage = 20 } = params.pagination ?? {}
    const rows = [
      ...pins.flatMap((id) => {
        const row = ROWS.find((other) => other.id === id)
        return row ? [{ ...row, pinned: true }] : []
      }),
      ...ROWS.filter((row) => !pins.includes(row.id)),
    ]
    const start = (page - 1) * perPage
    return Promise.resolve({
      data: rows.slice(start, start + perPage),
      total: rows.length,
    })
  })
  const getListSettings = vi.fn(settings)
  const saveListSettings = vi.fn((_resource: string, patch: ListSettings) =>
    Promise.resolve({ perPage: patch.perPage }),
  )
  const setPinned = vi.fn(
    (_resource: string, id: Identifier, next: boolean) =>
      new Promise<void>((resolve, reject) => {
        pending.push({
          resolve: () => {
            if (next) pins.push(String(id))
            else pins.splice(pins.indexOf(String(id)), 1)
            resolve()
          },
          reject,
        })
      }),
  )
  return {
    provider: {
      getList,
      getListSettings,
      saveListSettings,
      setPinned,
    } as unknown as DataProvider,
    getList,
    getListSettings,
    saveListSettings,
    setPinned,
    pending,
    perPages: () =>
      getList.mock.calls
        .filter(([resource]) => resource === "records")
        .map(([, params]) => params.pagination?.perPage),
  }
}

type Server = ReturnType<typeof fakeServer>

function Page(props: Partial<ListReportProps<Row>>) {
  const [params, setParams] = useState(() => new URLSearchParams())
  const onParamsChange = useCallback((next: URLSearchParams) => {
    setParams(next)
  }, [])
  const report = useListReport({
    resource: "records",
    params,
    onParamsChange,
    defaults: DEFAULTS,
    tabs: [],
  })
  return (
    <ListReport<Row>
      report={report}
      tableLabel="Записи компанії"
      columns={COLUMNS}
      getRowId={(row) => row.id}
      mode="pages"
      isPinned={isPinned}
      {...props}
    />
  )
}

function renderWith(server: Server, ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <CoreAdminContext dataProvider={server.provider} queryClient={queryClient}>
      {ui}
    </CoreAdminContext>,
  )
}

const pageSize = () =>
  screen.getByRole("combobox", { name: "Рядків на сторінці" })

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("ListReport: запам'ятаний розмір сторінки", () => {
  it("збережений розмір — перший і єдиний запит рядків; вибір діє одразу й зберігається", async () => {
    const user = userEvent.setup()
    const server = fakeServer({
      settings: () => Promise.resolve({ perPage: 50 }),
    })
    renderWith(server, <Page />)
    await screen.findByText("1-45 з 45")
    expect(server.perPages()).toEqual([50])
    expect(pageSize()).toHaveTextContent("50")

    await user.click(pageSize())
    await user.click(await screen.findByRole("option", { name: "10" }))
    await screen.findByText("1-10 з 45")
    expect(server.perPages().at(-1)).toBe(10)
    expect(server.saveListSettings).toHaveBeenCalledWith("records", {
      perPage: 10,
    })
  })

  it("два швидкі вибори зберігаються по черзі: на сервері лишається останній", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    const saves: (() => void)[] = []
    server.saveListSettings.mockImplementation(
      (_resource, patch) =>
        new Promise((resolve) => {
          saves.push(() => {
            resolve({ perPage: patch.perPage })
          })
        }),
    )
    renderWith(server, <Page />)
    await screen.findByText("1-20 з 45")
    for (const size of ["10", "50"]) {
      await user.click(pageSize())
      await user.click(await screen.findByRole("option", { name: size }))
    }
    await screen.findByText("1-45 з 45")
    expect(server.saveListSettings).toHaveBeenCalledOnce()
    saves[0]?.()
    await waitFor(() => {
      expect(server.saveListSettings).toHaveBeenCalledTimes(2)
    })
    expect(server.saveListSettings).toHaveBeenLastCalledWith("records", {
      perPage: 50,
    })
    saves[1]?.()
    await waitFor(() => {
      expect(pageSize()).toHaveTextContent("50")
    })
  })

  it("налаштування не прочитались чи розмір не з запропонованих — типовий 20", async () => {
    for (const settings of [
      () =>
        Promise.reject(new ApiError(500, { code: "internal", message: "" })),
      () => Promise.resolve({ perPage: 30 }),
    ]) {
      const server = fakeServer({ settings })
      const { unmount } = renderWith(server, <Page />)
      await screen.findByText("1-20 з 45")
      expect(server.perPages()).toEqual([20])
      unmount()
    }
  })

  it("без вибору розміру (`perPageOptions={[]}`) і в режимі прокрутки — без налаштувань", async () => {
    const server = fakeServer()
    const { unmount } = renderWith(server, <Page perPageOptions={[]} />)
    await screen.findByText("1-20 з 45")
    expect(
      screen.queryByRole("combobox", { name: "Рядків на сторінці" }),
    ).not.toBeInTheDocument()
    unmount()
    renderWith(server, <Page mode="scroll" />)
    await waitFor(() => {
      expect(server.perPages().at(-1)).toBe(100)
    })
    expect(server.getListSettings).not.toHaveBeenCalled()
  })
})

describe("ListReport і PinToggle: закріплення", () => {
  it("закріплені позначені; поки запит іде — вибраний стан і жодного повтору; далі оголошення й новий порядок", async () => {
    const user = userEvent.setup()
    const server = fakeServer({ pinned: ["r-3"] })
    const pinColumn: DataTableColumn<Row> = {
      id: "pin",
      header: "Закріплення",
      cell: (row) => (
        <PinToggle resource="records" record={row} name={row.name} />
      ),
      card: "actions",
    }
    renderWith(server, <Page columns={[pinColumn, ...COLUMNS]} />)
    const pinned = await screen.findByRole("button", {
      name: "Закріпити вгорі: Запис 3",
    })
    expect(pinned).toHaveAttribute("aria-pressed", "true")
    expect(pinned.closest("[data-pinned]")).not.toBeNull()

    const toggle = screen.getByRole("button", {
      name: "Закріпити вгорі: Запис 7",
    })
    expect(toggle.closest("[data-pinned]")).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(toggle).toHaveAttribute("aria-busy", "true")
    await user.click(toggle)
    expect(server.setPinned).toHaveBeenCalledOnce()
    expect(server.setPinned).toHaveBeenCalledWith("records", "r-7", true)

    server.pending[0]?.resolve()
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "Запис 7: закріплено вгорі списку",
      )
    })
    await waitFor(() => {
      expect(
        screen
          .getByRole("button", { name: "Закріпити вгорі: Запис 7" })
          .closest("[data-pinned]"),
      ).not.toBeNull()
    })
  })

  it("збережено, а запис не перечитали — кнопка показує збережене", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderWith(
      server,
      <PinToggle
        resource="records"
        record={{ id: "r-1" }}
        name="Запис 1"
        variant="button"
      />,
    )
    const button = screen.getByRole("button", { name: "Закріпити вгорі" })
    await user.click(button)
    server.pending[0]?.resolve()
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy")
    })
    expect(button).toHaveAttribute("aria-pressed", "true")
  })

  it.each([
    [
      new ApiError(422, { code: PIN_LIMIT_CODE, message: "" }),
      "Закріплено найбільше можливих записів. Відкріпіть один, щоб закріпити інший.",
    ],
    [
      new ApiError(0, { code: "offline", message: "" }),
      /^Не вдалося змінити закріплення: /,
    ],
  ])(
    "помилка %# — сповіщення, кнопка повертається в збережений стан",
    async (error, text) => {
      const user = userEvent.setup()
      const toastError = vi.spyOn(toast, "error")
      const server = fakeServer()
      renderWith(
        server,
        <PinToggle
          resource="records"
          record={{ id: "r-1" }}
          name="Запис 1"
          variant="button"
        />,
      )
      const button = screen.getByRole("button", { name: "Закріпити вгорі" })
      await user.click(button)
      server.pending[0]?.reject(error)
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-pressed", "false")
      })
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(text))
    },
  )
})
