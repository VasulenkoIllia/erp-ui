import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CoreAdminContext,
  type DataProvider,
  type GetListParams,
} from "ra-core"
import { useCallback, useState } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { DataTableColumn } from "@/registry/lib/data-table-core"
import type { ListDefaults, ListTab } from "@/registry/lib/list-state"
import {
  SAVED_VIEWS_RESOURCE,
  type SavedView,
} from "@/registry/lib/saved-views"
import {
  ListReport,
  useListReport,
  type ListReportProps,
} from "@/registry/templates/list-report"

/** Крок 1.1 (ADR-0022): шаблон List Report — склад, порядок за ключами, джерела, вибір. */

interface Row {
  id: string
  name: string
  status: "active" | "archived"
}

const TOTAL = 45
const ROWS: Row[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: `r-${String(i + 1)}`,
  name: `Запис ${String(i + 1)}`,
  status: i % 3 === 0 ? "archived" : "active",
}))

const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "name", order: "ASC" },
  sortFields: ["name"],
}
const TABS: ListTab[] = [
  { id: "all", label: "Усі", filter: {} },
  { id: "archived", label: "Архів", filter: { status: "archived" } },
]
const COLUMNS: DataTableColumn<Row>[] = [
  { id: "name", header: "Назва", cell: (row) => row.name, card: "title" },
  { id: "status", header: "Стан", cell: (row) => row.status },
]

/**
 * Сервер: записи з фільтром за статусом і види `/me/views`. Види можна притримати: так видно, що
 * до виду за замовчуванням список не вантажиться.
 */
function fakeServer({ views = [] as SavedView[] } = {}) {
  let releaseViews: (() => void) | null = null
  let holdViews = false
  const getList = vi.fn(async (resource: string, params: GetListParams) => {
    if (resource === SAVED_VIEWS_RESOURCE) {
      if (holdViews)
        await new Promise<void>((resolve) => {
          releaseViews = resolve
        })
      return { data: views, total: views.length }
    }
    const status = (params.filter as { status?: string }).status
    const all = status ? ROWS.filter((row) => row.status === status) : ROWS
    const { page = 1, perPage = 25 } = params.pagination ?? {}
    const start = (page - 1) * perPage
    return { data: all.slice(start, start + perPage), total: all.length }
  })
  return {
    provider: { getList } as unknown as DataProvider,
    getList,
    holdViews: () => {
      holdViews = true
    },
    releaseViews: () => {
      releaseViews?.()
    },
    rowRequests: () =>
      getList.mock.calls.filter(
        ([resource, params]) =>
          resource === "records" && params.pagination?.perPage !== 1,
      ),
  }
}

type PageProps = Partial<ListReportProps<Row>> & {
  initial?: string
  tabs?: ListTab[]
}

function Page({ initial = "", tabs = TABS, ...props }: PageProps) {
  const [params, setParams] = useState(() => new URLSearchParams(initial))
  const onParamsChange = useCallback((next: URLSearchParams) => {
    setParams(next)
  }, [])
  const report = useListReport({
    resource: "records",
    params,
    onParamsChange,
    defaults: DEFAULTS,
    tabs,
  })
  return (
    <ListReport<Row>
      report={report}
      title="Записи"
      tabsLabel="Стан запису"
      tableLabel="Записи компанії"
      columns={COLUMNS}
      getRowId={(row) => row.id}
      mode="pages"
      {...props}
    />
  )
}

function renderPage(server: ReturnType<typeof fakeServer>, props: PageProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <CoreAdminContext dataProvider={server.provider} queryClient={queryClient}>
      <Page {...props} />
    </CoreAdminContext>,
  )
}

beforeAll(() => {
  // jsdom не прокручує, а таблиця прокручує на початок після іншої сторінки.
  Element.prototype.scrollTo = vi.fn()
})

describe("ListReport: склад і порядок за ключами", () => {
  it("шапка з h1 і діями, вкладки з лічильниками, дії біля фільтрів — у порядку списку", async () => {
    const server = fakeServer()
    renderPage(server, {
      description: <p>Пояснення списку</p>,
      actions: [
        { id: "import", node: <button type="button">Імпорт</button> },
        { id: "create", node: <button type="button">Створити</button> },
      ],
      toolbar: [
        { id: "density", node: <button type="button">Щільність</button> },
      ],
    })
    expect(
      screen.getByRole("heading", { level: 1, name: "Записи" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Пояснення списку")).toBeInTheDocument()

    const header = screen
      .getByRole("heading", { level: 1 })
      .closest("header") as HTMLElement
    expect(
      within(header)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Імпорт", "Створити"])

    const tabs = screen.getByRole("tablist", { name: "Стан запису" })
    await waitFor(() => {
      expect(
        within(tabs).getByRole("tab", { name: /^Архів/ }),
      ).toHaveTextContent("Архів15")
    })
    // Меню видів — перед діями панелі.
    const bar = document.querySelector(
      '[data-slot="filter-bar"]',
    ) as HTMLElement
    const labels = within(bar)
      .getAllByRole("button")
      .map((button) => button.textContent)
    expect(labels.findIndex((label) => label?.includes("Вид"))).toBeLessThan(
      labels.indexOf("Щільність"),
    )
  })

  it("без шапки, вкладок, фільтрів і масових дій — нічого зайвого", async () => {
    const server = fakeServer()
    // Шапку ставить сторінка (ListReportHeader), список — без h1.
    renderPage(server, { tabs: [], title: undefined })
    await screen.findByText("Запис 1")
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^Фільтри/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })
})

describe("ListReport: джерела й стан", () => {
  it("сторінки: перша сторінка з сервера, вкладка фільтрує запит, повернення — знову з першої", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderPage(server, {})
    await screen.findByText("Запис 1")
    expect(screen.getByText("1-20 з 45")).toBeInTheDocument()
    expect(server.rowRequests().at(-1)?.[1].pagination).toEqual({
      page: 1,
      perPage: 20,
    })
    await user.click(screen.getByRole("button", { name: "Наступна сторінка" }))
    await screen.findByText("21-40 з 45")

    await user.click(screen.getByRole("tab", { name: /^Архів/ }))
    await waitFor(() => {
      expect(screen.getByText("1-15 з 15")).toBeInTheDocument()
    })
    expect(server.rowRequests().at(-1)?.[1].filter).toEqual({
      status: "archived",
    })

    // A → B → A: збережена сторінка 2 не оживає.
    await user.click(screen.getByRole("tab", { name: /^Усі/ }))
    await screen.findByText("1-20 з 45")
  })

  it("прокрутка: вікно по 100 рядків", async () => {
    const server = fakeServer()
    renderPage(server, { mode: "scroll" })
    await waitFor(() => {
      expect(server.rowRequests().at(-1)?.[1].pagination).toEqual({
        page: 1,
        perPage: 100,
      })
    })
  })

  it("відкрили начисто — до виду за замовчуванням список не вантажиться", async () => {
    const server = fakeServer({
      views: [
        {
          id: "v-archived",
          version: 1,
          resource: "records",
          name: "Архів",
          params: "tab=archived",
          isDefault: true,
        },
      ],
    })
    server.holdViews()
    renderPage(server, {})
    expect(
      await screen.findByRole("status", { name: "Завантаження даних" }),
    ).toBeInTheDocument()
    expect(server.rowRequests()).toHaveLength(0)

    server.releaseViews()
    await waitFor(() => {
      expect(screen.getByText("1-15 з 15")).toBeInTheDocument()
    })
    expect(
      server.rowRequests().every(([, params]) => {
        const filter = params.filter as { status?: string }
        return filter.status === "archived"
      }),
    ).toBe(true)
  })

  it("масові дії: прапорці й кнопки з кількістю вибраних у порядку списку", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderPage(server, {
      bulk: {
        rowLabel: (row) => row.name,
        actions: [
          {
            id: "archive",
            render: (count) => (
              <button type="button">{`В архів (${String(count)})`}</button>
            ),
          },
          {
            id: "export",
            render: (count) => (
              <button type="button">{`Експорт (${String(count)})`}</button>
            ),
          },
        ],
      },
    })
    await user.click(
      await screen.findByRole("checkbox", { name: "Вибрати Запис 1" }),
    )
    await user.click(screen.getByRole("checkbox", { name: "Вибрати Запис 2" }))
    const archive = screen.getByRole("button", { name: "В архів (2)" })
    const exportButton = screen.getByRole("button", { name: "Експорт (2)" })
    expect(
      archive.compareDocumentPosition(exportButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
