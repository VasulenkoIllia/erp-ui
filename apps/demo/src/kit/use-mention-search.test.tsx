import type { ReactNode } from "react"

import { renderHook } from "@testing-library/react"
import { CoreAdminContext, type DataProvider } from "ra-core"
import { describe, expect, it, vi } from "vitest"

import { useMentionSearch } from "@/registry/hooks/use-mention-search"
import { MENTION_FETCHED } from "@/registry/lib/mention-menu"

function setup(data: Record<string, unknown>[]) {
  const getList = vi.fn(() => Promise.resolve({ data, total: data.length }))
  const dataProvider = { getList } as unknown as DataProvider
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CoreAdminContext dataProvider={dataProvider}>{children}</CoreAdminContext>
  )
  const { result } = renderHook(() => useMentionSearch(), { wrapper })
  return { getList, search: result.current }
}

describe("useMentionSearch", () => {
  it("шукає в довіднику людей, запит іде зі скасуванням", async () => {
    const { getList, search } = setup([])
    const { signal } = new AbortController()
    await search("ол", signal)
    expect(getList).toHaveBeenCalledWith("users", {
      pagination: { page: 1, perPage: MENTION_FETCHED },
      sort: { field: "name", order: "ASC" },
      filter: { q: "ол" },
      signal,
    })
  })

  it("порожній запит без `q`: довідник віддає першу сторінку", async () => {
    const { getList, search } = setup([])
    await search("", new AbortController().signal)
    expect(getList).toHaveBeenCalledWith(
      "users",
      expect.objectContaining({ filter: {} }),
    )
  })

  it("запис довідника без статусу лишається, заблокований зникає", async () => {
    const { search } = setup([
      { id: 1, name: "Олена", email: "olena@firma.example" },
      { id: "u2", name: "Іван", email: "ivan@firma.example", status: "active" },
      { id: "u3", name: "Тарас", status: "blocked" },
    ])
    await expect(search("", new AbortController().signal)).resolves.toEqual([
      { id: "1", label: "Олена", hint: "olena@firma.example" },
      { id: "u2", label: "Іван", hint: "ivan@firma.example" },
    ])
  })
})
