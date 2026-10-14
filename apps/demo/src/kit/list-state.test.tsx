import { act, renderHook } from "@testing-library/react"
import { useCallback, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { STANDARD_VIEW, useListState } from "@/registry/hooks/use-list-state"
import type { FilterDefinition } from "@/registry/lib/filters"
import type { ListDefaults, ListTab } from "@/registry/lib/list-state"
import type { SavedView } from "@/registry/lib/saved-views"

const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
  sortFields: ["date", "number"],
}
const TABS: ListTab[] = [
  { id: "all", label: "Усі", filter: {} },
  { id: "overdue", label: "Прострочені", filter: { status: "overdue" } },
]

const view = (patch: Partial<SavedView>): SavedView => ({
  id: "v1",
  version: 1,
  resource: "invoices",
  name: "Прострочені",
  params: "tab=overdue&client=A",
  isDefault: false,
  ...patch,
})

const FILTERS: FilterDefinition[] = [
  {
    kind: "options",
    id: "client",
    field: "client",
    label: "Клієнт",
    options: [],
  },
  {
    kind: "money-range",
    id: "amount",
    field: "amount",
    label: "Сума",
    currency: "UAH",
  },
]

/** Адреса в стані: як `useSearchParams` роутера. */
function renderList(
  initial: string,
  views?: SavedView[],
  {
    viewsFailed = false,
    filters,
  }: { viewsFailed?: boolean; filters?: FilterDefinition[] } = {},
) {
  const changes = vi.fn<(params: string, replace: boolean) => void>()
  const hook = renderHook(
    ({ views: current }: { views?: SavedView[] }) => {
      const [params, setParams] = useState(() => new URLSearchParams(initial))
      const onParamsChange = useCallback(
        (next: URLSearchParams, { replace }: { replace: boolean }) => {
          changes(next.toString(), replace)
          setParams(next)
        },
        [],
      )
      return {
        params: params.toString(),
        list: useListState({
          params,
          onParamsChange,
          defaults: DEFAULTS,
          tabs: TABS,
          filters,
          views: current,
          viewsFailed,
        }),
      }
    },
    { initialProps: { views } },
  )
  return { ...hook, changes }
}

describe("hooks/use-list-state", () => {
  it("відкрили начисто — чекає на види й застосовує вид за замовчуванням заміною", () => {
    const { result, rerender, changes } = renderList("")
    expect(result.current.list.isReady).toBe(false)
    rerender({ views: [view({ isDefault: true })] })
    expect(changes).toHaveBeenCalledWith("view=v1&tab=overdue&client=A", true)
    expect(result.current.list.isReady).toBe(true)
    expect(result.current.list.activeView?.id).toBe("v1")
    expect(result.current.list.isModified).toBe(false)
    expect(result.current.list.queryFilter).toEqual({
      client: "A",
      status: "overdue",
    })
  })

  it("без виду за замовчуванням чи з помилкою видів — одразу «Стандартний»", () => {
    expect(renderList("", []).result.current.list.isReady).toBe(true)
    expect(
      renderList("", undefined, { viewsFailed: true }).result.current.list
        .isReady,
    ).toBe(true)
    const { result, changes } = renderList("", [])
    expect(result.current.list.activeView).toBeNull()
    expect(result.current.list.isFiltered).toBe(false)
    expect(changes).not.toHaveBeenCalled()
  })

  it("зміни — новий запис в історії з тим самим видом; «змінено»", () => {
    const { result, changes } = renderList("view=v1&tab=overdue&client=A", [
      view({}),
    ])
    act(() => {
      result.current.list.setTab("all")
    })
    expect(changes).toHaveBeenLastCalledWith("view=v1&client=A", false)
    expect(result.current.list.isModified).toBe(true)
    expect(result.current.list.isFiltered).toBe(true)
    act(() => {
      result.current.list.setFilter(
        { client: "A", q: "агро" },
        { replace: true },
      )
    })
    expect(changes).toHaveBeenLastCalledWith(
      "view=v1&client=A&q=%D0%B0%D0%B3%D1%80%D0%BE",
      true,
    )
    expect(result.current.list.viewParams).toBe(
      "client=A&q=%D0%B0%D0%B3%D1%80%D0%BE",
    )
  })

  it("повторний вибір виду повертає збережений стан; «Стандартний» і відв'язка", () => {
    const saved = view({})
    const { result, changes } = renderList("view=v1&client=B", [saved])
    expect(result.current.list.isModified).toBe(true)
    act(() => {
      result.current.list.applyView(saved)
    })
    expect(changes).toHaveBeenLastCalledWith(
      "view=v1&tab=overdue&client=A",
      false,
    )
    expect(result.current.list.isModified).toBe(false)
    act(() => {
      result.current.list.detachView("v1")
    })
    expect(changes).toHaveBeenLastCalledWith(
      `view=${STANDARD_VIEW}&tab=overdue&client=A`,
      true,
    )
    expect(result.current.list.activeView).toBeNull()
    act(() => {
      result.current.list.applyView(null)
    })
    expect(result.current.params).toBe(`view=${STANDARD_VIEW}`)
    expect(result.current.list.isModified).toBe(false)
  })

  it("дія, після якої адреса порожня, — view=standard: вид за замовчуванням її не перекриває", () => {
    const { result, changes } = renderList("tab=overdue", [
      view({ isDefault: true }),
    ])
    act(() => {
      result.current.list.setTab("all")
    })
    expect(changes).toHaveBeenLastCalledWith(`view=${STANDARD_VIEW}`, false)
    expect(result.current.params).toBe(`view=${STANDARD_VIEW}`)
    expect(result.current.list.state.tab).toBe("all")
  })

  it("після відповіді сервера — стан на цей момент: відв'язка лише свого виду, відновлення без підміни", () => {
    const { result } = renderList("view=v1&tab=overdue&client=A", [view({})])
    // Замикання з моменту кліку «Видалити вид».
    const atClick = result.current.list
    act(() => {
      result.current.list.setFilter({ client: "B" })
    })
    act(() => {
      atClick.detachView("v1")
    })
    expect(result.current.params).toBe(
      `view=${STANDARD_VIEW}&tab=overdue&client=B`,
    )
    act(() => {
      atClick.attachView(view({ id: "v2" }))
    })
    expect(result.current.params).toBe("view=v2&tab=overdue&client=B")
    // Людина вже на іншому виді: ні відв'язки, ні підміни.
    act(() => {
      atClick.detachView("v1")
      atClick.attachView(view({ id: "v3" }))
    })
    expect(result.current.params).toBe("view=v2&tab=overdue&client=B")
  })

  it("з описом фільтрів: чужі ключі, повтори й те, що не розібрати, у стан не йдуть; сортування — лише за дозволеним полем", () => {
    const { result } = renderList(
      "client=A&client=A&amount_gte=99999999999999999999&amount_lte=500&utm_source=mail&__proto__=x&q=a&q=b&sort=-secret",
      [],
      { filters: FILTERS },
    )
    const expected = { client: ["A"], amount_lte: 500, q: "a" }
    expect(result.current.list.state.filter).toEqual(expected)
    expect(result.current.list.queryFilter).toEqual(expected)
    expect(result.current.list.state.sort).toEqual(DEFAULTS.sort)
  })
})
