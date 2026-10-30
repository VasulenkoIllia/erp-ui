import { onlineManager, QueryClient } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { CoreAdminContext, type DataProvider } from "ra-core"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ME_QUERY_KEY, type ErpAuthProvider } from "@/registry/lib/auth"
import { companyScope } from "@/registry/lib/company-scope"
import {
  INVITATION_QUERY_KEYS,
  type Invitation,
} from "@/registry/lib/invitations"
import { useTeamProgress } from "@/registry/modules/A1-company/components/use-team-progress"

/**
 * Пункт «Колеги» чек-листа A1 (ADR-0044): що рахується зробленим, коли стан не відомий і чому проект
 * без запрошень не бачить запитів до цих адрес навіть під час «Спробувати ще».
 */
const invitation = (status: Invitation["status"]) =>
  ({ id: status, status }) as Invitation

function setup({
  invitations = () => Promise.resolve([]),
  total = 1,
  canReadUsers = true,
}: {
  invitations?: () => Promise<Invitation[]>
  total?: number
  canReadUsers?: boolean
} = {}) {
  const list = vi.fn(invitations)
  const getList = vi.fn(() => Promise.resolve({ data: [], total }))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(ME_QUERY_KEY, {
    id: "u1",
    name: "Іван",
    email: "i@example.com",
    roles: [],
    permissions: canReadUsers ? ["users:read"] : [],
    companies: [],
    companyId: null,
    factors: [],
  })
  const authProvider = {
    invitations: { list },
  } as unknown as ErpAuthProvider
  const dataProvider = { getList } as unknown as DataProvider
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CoreAdminContext
      authProvider={authProvider}
      dataProvider={dataProvider}
      queryClient={queryClient}
    >
      {children}
    </CoreAdminContext>
  )
  return { list, getList, queryClient, wrapper }
}

afterEach(() => {
  onlineManager.setOnline(true)
})

describe("useTeamProgress", () => {
  it("проект без запрошень: жодного запиту, зокрема під час повтору", async () => {
    const { list, getList, wrapper } = setup()
    const { result } = renderHook(() => useTeamProgress(false), { wrapper })
    expect(result.current).toMatchObject({
      isPending: false,
      failure: undefined,
      hasTeam: false,
    })
    act(() => {
      result.current.retry()
    })
    await act(() => Promise.resolve())
    expect(list).not.toHaveBeenCalled()
    expect(getList).not.toHaveBeenCalled()
  })

  it("прострочене запрошення не рахується: на нього вже ніхто не відповість", async () => {
    const { wrapper } = setup({
      invitations: () => Promise.resolve([invitation("expired")]),
    })
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })
    expect(result.current.hasTeam).toBe(false)
  })

  it("запрошення, що чекає, чи друга людина роблять пункт готовим", async () => {
    const invited = setup({
      invitations: () => Promise.resolve([invitation("pending")]),
    })
    const first = renderHook(() => useTeamProgress(true), {
      wrapper: invited.wrapper,
    })
    await waitFor(() => {
      expect(first.result.current.hasTeam).toBe(true)
    })

    const joined = setup({ total: 2 })
    const second = renderHook(() => useTeamProgress(true), {
      wrapper: joined.wrapper,
    })
    await waitFor(() => {
      expect(second.result.current.hasTeam).toBe(true)
    })
  })

  it("поки люди не прийшли, стан не відомий: пункт не блимає «незробленим»", async () => {
    const { wrapper, getList } = setup()
    let release: (value: { data: never[]; total: number }) => void = () =>
      undefined
    getList.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(getList).toHaveBeenCalled()
    })
    expect(result.current.isPending).toBe(true)
    act(() => {
      release({ data: [], total: 1 })
    })
    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })
  })

  it("без права читати людей список не запитується", async () => {
    const { wrapper, getList } = setup({ canReadUsers: false })
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })
    expect(getList).not.toHaveBeenCalled()
  })

  it("перший збій — стан помилки, а збій перечитування не ховає те, що вже є", async () => {
    let attempt = 0
    const { wrapper } = setup({
      invitations: () => {
        attempt += 1
        return attempt === 2
          ? Promise.resolve([invitation("pending")])
          : Promise.reject(new Error(`Збій ${String(attempt)}`))
      },
    })
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(result.current.failure).toBeInstanceOf(Error)
    })
    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(result.current.hasTeam).toBe(true)
    })
    expect(result.current.failure).toBeUndefined()
    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(attempt).toBe(3)
    })
    await act(() => Promise.resolve())
    expect(result.current.failure).toBeUndefined()
    expect(result.current.hasTeam).toBe(true)
  })

  it("запрошення впало, але людей уже видно: пункт відомий, збою немає", async () => {
    const { wrapper } = setup({
      invitations: () => Promise.reject(new Error("Збій")),
      total: 3,
    })
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(result.current.hasTeam).toBe(true)
    })
    expect(result.current.failure).toBeUndefined()
    expect(result.current.isPending).toBe(false)
  })

  it("запрошення, що чекає, вирішує пункт, поки люди ще в дорозі", async () => {
    const { wrapper, getList } = setup({
      invitations: () => Promise.resolve([invitation("pending")]),
    })
    getList.mockImplementation(() => new Promise(() => undefined))
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(result.current.hasTeam).toBe(true)
    })
    expect(result.current.isPending).toBe(false)
  })

  it("запрошення в кеші, а людей без мережі не прочитати: стан offline", async () => {
    onlineManager.setOnline(false)
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(
      [...INVITATION_QUERY_KEYS.list, companyScope(null)],
      [],
    )
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(result.current.failure).toMatchObject({ status: 0 })
    })
  })

  it("без мережі запит на паузі: стан offline, а не вічне завантаження", async () => {
    onlineManager.setOnline(false)
    const { wrapper } = setup()
    const { result } = renderHook(() => useTeamProgress(true), { wrapper })
    await waitFor(() => {
      expect(result.current.failure).toMatchObject({ status: 0 })
    })
  })
})
