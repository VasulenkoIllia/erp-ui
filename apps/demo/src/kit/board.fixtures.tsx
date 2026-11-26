/* eslint-disable react-refresh/only-export-components -- помічники тестів, а не модуль для гарячого оновлення */
import { QueryClient } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import {
  CoreAdminContext,
  type AuthProvider,
  type DataProvider,
  type GetListParams,
} from "@/registry/lib/ra-core"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { afterEach, beforeEach, vi } from "vitest"

import { ApiError } from "@/registry/lib/api"
import type { ListDefaults } from "@/registry/lib/list-state"
import { SAVED_VIEWS_RESOURCE } from "@/registry/lib/saved-views"
import type {
  ListSettings,
  ListSettingsPatch,
} from "@/registry/lib/list-settings"
import { Board, type BoardOptions } from "@/registry/templates/board"
import {
  ListReport,
  useListReport,
  type ListReportContentProps,
  type ListReportLayout,
} from "@/registry/templates/list-report"
import { Toaster } from "@/registry/ui/sonner"

/** Спільне для тестів дошки (крок UI07a, ADR-0100): угоди, сервер угод, сторінка зі списком і дошкою. */

export interface Deal {
  id: string
  version: number
  title: string
  stage: string
  amount: number
  owner: string
  deniedActions?: Record<string, string>
}

const DEFAULTS: Omit<ListDefaults, "layouts"> = {
  tab: "all",
  sort: { field: "title", order: "ASC" },
  sortFields: ["title"],
}
const COLUMNS = [
  { id: "new", label: "Нові" },
  { id: "won", label: "Виграно" },
  { id: "lost", label: "Програно", collapsed: true },
]

function makeDeals(): Deal[] {
  const deal = (index: number, stage: string): Deal => ({
    id: `d-${String(index)}`,
    version: 1,
    title: `Угода ${String(index).padStart(2, "0")}`,
    stage,
    amount: 1000,
    owner: index % 2 ? "u-1" : "u-2",
  })
  return [
    ...Array.from({ length: 25 }, (_, i) => deal(i + 1, "new")),
    deal(26, "won"),
    deal(27, "won"),
    deal(28, "lost"),
  ]
}

/** Сервер угод: фільтр за етапом і пошуком, суми за `sumOf`, налаштування списку, зміна й створення. */
export function fakeServer({ sums = true } = {}) {
  let deals = makeDeals()
  let settings: ListSettings = { perPage: null }
  const getList = vi.fn((resource: string, params: GetListParams) => {
    if (resource === SAVED_VIEWS_RESOURCE)
      return Promise.resolve({ data: [], total: 0 })
    const filter = params.filter as { stage?: string; q?: string }
    const found = deals.filter(
      (deal) =>
        (!filter.stage || deal.stage === filter.stage) &&
        (!filter.q || deal.title.includes(filter.q)),
    )
    const { perPage = 25 } = params.pagination ?? {}
    const sumOf = (params.meta as { sumOf?: string[] } | undefined)?.sumOf
    return Promise.resolve({
      data: found.slice(0, perPage),
      total: found.length,
      ...(sums && sumOf
        ? { meta: { sums: { amount: found.length * 1000 } } }
        : {}),
    })
  })
  const update = vi.fn(
    (
      _resource: string,
      { id, data }: { id: string; data: Partial<Deal>; previousData?: Deal },
    ): Promise<{ data: Deal }> => {
      // Змінена угода — першою: сервер сортує за часом зміни.
      const previous = deals.find((deal) => deal.id === id) as Deal
      const updated = { ...previous, ...data, version: previous.version + 1 }
      deals = [updated, ...deals.filter((deal) => deal.id !== id)]
      return Promise.resolve({ data: updated })
    },
  )
  const create = vi.fn(
    (_resource: string, { data }: { data: Partial<Deal> }) => {
      if (data.title === "Дубль")
        return Promise.reject(
          new ApiError(422, {
            code: "validation",
            message: "Validation failed",
            fieldErrors: { title: "Така угода вже є" },
          }),
        )
      const created = { ...(data as Deal), id: "d-new", version: 1 }
      deals = [created, ...deals]
      return Promise.resolve({ data: created })
    },
  )
  const saveListSettings = vi.fn(
    (_resource: string, patch: ListSettingsPatch) => {
      settings = { ...settings, ...patch }
      return Promise.resolve(settings)
    },
  )
  return {
    provider: {
      getList,
      update,
      create,
      getListSettings: () => Promise.resolve(settings),
      saveListSettings,
    } as unknown as DataProvider,
    getList,
    update,
    create,
    saveListSettings,
    columnRequests: (stage: string) =>
      getList.mock.calls
        .map(([, params]) => params)
        .filter(
          (params) => (params.filter as { stage?: string }).stage === stage,
        ),
  }
}

export const allowAll: AuthProvider = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  checkAuth: () => Promise.resolve(),
  checkError: () => Promise.resolve(),
  getPermissions: () => Promise.resolve(),
  canAccess: () => Promise.resolve(true),
}

export function readOnly(): AuthProvider {
  return {
    ...allowAll,
    canAccess: ({ action }) => Promise.resolve(action === "read"),
  }
}

/** Опції дошки й ширина контейнера тесту: `beforeEach` у `useBoardTestSetup` скидає їх. */
export const boardTest: {
  options: Partial<BoardOptions<Deal>>
  width: number
} = { options: {}, width: 1200 }

function DealsBoard(props: ListReportContentProps) {
  return (
    <Board<Deal>
      {...props}
      field="stage"
      columns={COLUMNS}
      cardLabel={(deal) => deal.title}
      renderCard={(deal) => <p>{deal.title}</p>}
      sum={{ field: "amount", format: (value) => `${String(value)} грн` }}
      quickCreate={{ field: "title", label: "Назва угоди" }}
      {...boardTest.options}
    />
  )
}

const LAYOUTS: ListReportLayout[] = [
  { id: "board", label: "Дошка", component: DealsBoard },
]

function Page() {
  const [params, setParams] = useState(() => new URLSearchParams())
  const onParamsChange = useCallback((next: URLSearchParams) => {
    setParams(next)
  }, [])
  const report = useListReport({
    resource: "deals",
    params,
    onParamsChange,
    defaults: DEFAULTS,
    layouts: LAYOUTS,
  })
  return (
    <ListReport<Deal>
      report={report}
      title="Угоди"
      tableLabel="Угоди компанії"
      searchPlaceholder="Пошук угод"
      columns={[]}
    />
  )
}

export function renderBoard(
  server: ReturnType<typeof fakeServer>,
  authProvider: AuthProvider = allowAll,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <CoreAdminContext
      dataProvider={server.provider}
      authProvider={authProvider}
      queryClient={queryClient}
    >
      <Page />
      <Toaster />
    </CoreAdminContext>,
  )
}

/** Назва колонки з кількістю: «Нові, 25» (jsdom додає пробіли між вкладеними елементами). */
export const columnName = (label: string, count: number) =>
  new RegExp(`^${label}\\s*,\\s*${String(count)}$`)
export const column = (name: RegExp) =>
  screen
    .getByRole("heading", { level: 2, name })
    .closest("[data-kanban-column]") as HTMLElement
export const cards = (stage: string) =>
  Array.from(
    document.querySelectorAll(`[data-kanban-cards="${stage}"] > li`),
    (item) => item.textContent,
  )

export function setupBoardTests() {
  beforeEach(() => {
    boardTest.options = {}
    boardTest.width = 1200
    toast.dismiss()
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => boardTest.width,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
}
