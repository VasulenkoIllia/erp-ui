import { QueryClient } from "@tanstack/react-query"
import type * as React from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import {
  CoreAdminContext,
  type DataProvider,
  type GetListParams,
  type SortPayload,
} from "ra-core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useWindowedList } from "@/registry/hooks/use-windowed-list"
import { companyScope, setCompanyId } from "@/registry/lib/company-scope"

interface Row {
  id: string
  n: number
}

const TOTAL = 10_000
const SORT: SortPayload = { field: "n", order: "ASC" }

/**
 * Сервер на 10 000 рядків. Сторінки з `held` не відповідають, доки їх не відпустити, а з
 * `failing` — відмовляють: так видно стани між запитом і відповіддю.
 */
function fakeServer() {
  const held = new Map<number, () => void>()
  const holding = new Set<number>()
  const failing = new Set<number>()
  let withTotal = true
  const getList = vi.fn(async (_resource: string, params: GetListParams) => {
    const page = params.pagination?.page ?? 1
    const perPage = params.pagination?.perPage ?? 25
    const q = (params.filter as { q?: string }).q
    if (holding.has(page))
      await new Promise<void>((resolve) => {
        held.set(page, resolve)
      })
    if (failing.has(page)) throw new Error("server")
    const total = q ? 50 : TOTAL
    const start = (page - 1) * perPage
    const data = Array.from(
      { length: Math.max(Math.min(perPage, total - start), 0) },
      (_, i) => ({ id: `${q ?? "r"}-${String(start + i)}`, n: start + i }),
    )
    return withTotal ? { data, total } : { data, pageInfo: {} }
  })
  const provider = { getList } as unknown as DataProvider
  return {
    provider,
    getList,
    hold: (page: number) => holding.add(page),
    fail: (page: number) => failing.add(page),
    heal: (page: number) => failing.delete(page),
    withoutTotal: () => {
      withTotal = false
    },
    release: (page: number) => {
      holding.delete(page)
      held.get(page)?.()
    },
    pagesRequested: () =>
      getList.mock.calls.map(([, params]) => params.pagination?.page),
  }
}

function wrapperFor(server: ReturnType<typeof fakeServer>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <CoreAdminContext
        dataProvider={server.provider}
        queryClient={queryClient}
      >
        {children}
      </CoreAdminContext>
    )
  }
}

function renderList(
  server: ReturnType<typeof fakeServer>,
  initial: { filter?: Record<string, unknown> } = {},
) {
  return renderHook(
    ({ filter }: { filter?: Record<string, unknown> }) =>
      useWindowedList<Row>("rows", { sort: SORT, filter }),
    { initialProps: initial, wrapper: wrapperFor(server) },
  )
}

afterEach(() => {
  setCompanyId(null)
})

describe("useWindowedList", () => {
  it("рядки вікна — у кеші getOne для картки, якщо там ще нічого немає (ADR-0019)", async () => {
    const server = fakeServer()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const key = (id: string) => [
      "rows",
      "getOne",
      { id, meta: companyScope(null) },
    ]
    const detailed = { id: "r-1", n: 1, lines: [] }
    queryClient.setQueryData(key("r-1"), detailed)
    const { result } = renderHook(
      () => useWindowedList<Row>("rows", { sort: SORT }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <CoreAdminContext
            dataProvider={server.provider}
            queryClient={queryClient}
          >
            {children}
          </CoreAdminContext>
        ),
      },
    )
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    expect(queryClient.getQueryData(key("r-0"))).toEqual({ id: "r-0", n: 0 })
    expect(queryClient.getQueryData(key("r-1"))).toBe(detailed)
  })

  it("спершу — перше вікно; рядки за ним — у стані «вантажиться»", async () => {
    const server = fakeServer()
    const { result } = renderList(server)
    expect(result.current.isPending).toBe(true)
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    expect(result.current.isPending).toBe(false)
    expect(result.current.rowAt(0)?.n).toBe(0)
    expect(result.current.rowAt(99)?.n).toBe(99)
    expect(result.current.rowAt(100)).toBeUndefined()
    expect(result.current.windowAt(150)).toMatchObject({
      status: "loading",
      first: 100,
      last: 199,
    })
    expect(server.pagesRequested()).toEqual([1])
  })

  it("стрибок у кінець просить лише останнє вікно й не повертає до первинного завантаження", async () => {
    const server = fakeServer()
    const { result } = renderList(server)
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    server.hold(100)
    act(() => {
      result.current.setRange(9_990, 9_999)
    })
    await waitFor(() => {
      expect(server.pagesRequested()).toContain(100)
    })
    // Вікно 1 більше не спостерігається, а 100 ще летить: кількість — з попередніх вікон.
    expect(result.current.isPending).toBe(false)
    expect(result.current.rowCount).toBe(TOTAL)
    expect(result.current.isLoadingRows).toBe(true)
    expect(server.pagesRequested()).not.toContain(50)
    act(() => {
      server.release(100)
    })
    await waitFor(() => {
      expect(result.current.rowAt(9_999)?.n).toBe(9_999)
    })
  })

  it("новий фільтр: поки відповідь летить, видно попередні рядки", async () => {
    const server = fakeServer()
    const { result, rerender } = renderList(server)
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    const before = result.current.listKey
    server.hold(1)
    rerender({ filter: { q: "x" } })
    expect(result.current.listKey).not.toBe(before)
    expect(result.current.isPending).toBe(false)
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.rowCount).toBe(TOTAL)
    expect(result.current.rowAt(0)?.id).toBe("r-0")
    act(() => {
      server.release(1)
    })
    await waitFor(() => {
      expect(result.current.rowCount).toBe(50)
    })
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.rowAt(0)?.id).toBe("x-0")
  })

  it("інша компанія: попередніх рядків не показує", async () => {
    const server = fakeServer()
    const { result } = renderList(server)
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    server.hold(1)
    act(() => {
      setCompanyId("kovalenko")
    })
    expect(result.current.isPending).toBe(true)
    expect(result.current.rowAt(0)).toBeUndefined()
    act(() => {
      server.release(1)
    })
    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })
  })

  it("вікно, що не завантажилось, не валить список і має повтор", async () => {
    const server = fakeServer()
    const { result } = renderList(server)
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    server.fail(3)
    act(() => {
      result.current.setRange(240, 260)
    })
    await waitFor(() => {
      expect(result.current.windowAt(250)?.status).toBe("error")
    })
    expect(result.current.error).toBeUndefined()
    // Вікно 1 уже поза екраном, але з кешу.
    expect(result.current.rowAt(0)?.n).toBe(0)
    server.heal(3)
    const failed = result.current.windowAt(250)
    act(() => {
      if (failed?.status === "error") failed.retry()
    })
    await waitFor(() => {
      expect(result.current.rowAt(250)?.n).toBe(250)
    })
  })

  it("прокрутка в межах тих самих вікон не змінює стан хука", async () => {
    const server = fakeServer()
    let renders = 0
    const { result } = renderHook(
      () => {
        renders += 1
        return useWindowedList<Row>("rows", { sort: SORT })
      },
      { wrapper: wrapperFor(server) },
    )
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    const before = renders
    act(() => {
      result.current.setRange(10, 30)
      result.current.setRange(11, 31)
      result.current.setRange(12, 32)
    })
    // React може раз викликати хук, щоб порівняти стан, але без змін далі не йде.
    expect(renders).toBeLessThanOrEqual(before + 1)
    expect(server.pagesRequested()).toEqual([1])
  })

  it("сервер перестав відповідати — помилка списку; поки йде повтор — рядки з кешу", async () => {
    const server = fakeServer()
    const { result } = renderList(server)
    await waitFor(() => {
      expect(result.current.rowCount).toBe(TOTAL)
    })
    server.fail(1)
    act(() => {
      result.current.refetch()
    })
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
    })
    server.heal(1)
    server.hold(1)
    act(() => {
      result.current.refetch()
    })
    await waitFor(() => {
      expect(result.current.error).toBeUndefined()
    })
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.rowAt(0)?.n).toBe(0)
    act(() => {
      server.release(1)
    })
    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
    })
  })

  it("той самий фільтр з іншим порядком полів — той самий список; «Оновити» — лише його вікна", async () => {
    const server = fakeServer()
    const { result, rerender } = renderList(server, {
      filter: { q: "x", status: "paid" },
    })
    await waitFor(() => {
      expect(result.current.rowCount).toBe(50)
    })
    const key = result.current.listKey
    rerender({ filter: { status: "paid", q: "x" } })
    expect(result.current.listKey).toBe(key)

    rerender({ filter: { q: "y" } })
    await waitFor(() => {
      expect(result.current.rowAt(0)?.id).toBe("y-0")
    })
    server.getList.mockClear()
    act(() => {
      result.current.refetch()
    })
    await waitFor(() => {
      expect(server.getList).toHaveBeenCalled()
    })
    const filters = server.getList.mock.calls.map(
      ([, params]) => (params.filter as { q?: string }).q,
    )
    expect(filters).toEqual(["y"])
  })

  it("сервер без total — помилка, а не вічне завантаження", async () => {
    const server = fakeServer()
    server.withoutTotal()
    const { result } = renderList(server)
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
    })
    expect(result.current.isPending).toBe(false)
  })

  it("помилка першого вікна — помилка всього списку", async () => {
    const server = fakeServer()
    server.fail(1)
    const { result } = renderList(server)
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
    })
    expect(result.current.isPending).toBe(false)
    expect(result.current.rowCount).toBe(0)
  })
})
