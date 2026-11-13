import { QueryClient } from "@tanstack/react-query"
import { render, renderHook, screen, waitFor } from "@testing-library/react"
import { CoreAdminContext } from "ra-core"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { EditLockNotice } from "@/registry/erp/edit-lock-notice"
import { useEditSession } from "@/registry/hooks/use-edit-session"
import {
  useRecordAccess,
  type RecordAccess,
} from "@/registry/hooks/use-record-access"
import type { ErpAuthProvider, Me } from "@/registry/lib/auth"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import type { EditLockState } from "@/registry/lib/edit-lock"

/**
 * Спільний шар документа (ADR-0086): сеанс редагування сторінки форми — право, позначка сервера й
 * блокування «Редагує …» разом; слова модуля для кодів позначки сервера в `useRecordAccess`.
 */
const ME = { id: "u-me", name: "Я" } as Me
const FREE: EditLockState = { holder: null, expiresAt: null }
const MINE: EditLockState = {
  holder: { id: ME.id, name: ME.name },
  expiresAt: "2026-11-01T10:02:00.000Z",
}
const THEIRS: EditLockState = {
  holder: { id: "u-other", name: "Марта Шевчук" },
  expiresAt: "2026-11-01T10:02:00.000Z",
}
const ALLOWED: RecordAccess = { isPending: false, canAccess: true }
const DENIED = "Немає права змінювати рахунки"

function Session({
  access,
  hasRecord = true,
}: {
  access: RecordAccess
  hasRecord?: boolean
}) {
  const session = useEditSession({
    resource: "sales-invoices",
    id: "7",
    access,
    hasRecord,
    deniedReason: DENIED,
  })
  return (
    <>
      <EditLockNotice holder={session.holder} />
      <p data-testid="reason">{session.reason ?? "немає"}</p>
      <p data-testid="mode">{session.readOnly ? "читання" : "зміна"}</p>
      <p data-testid="pending">{session.isPending ? "так" : "ні"}</p>
    </>
  )
}

function setup(
  access: RecordAccess,
  {
    hasRecord,
    lock = FREE,
    take = () => Promise.resolve(MINE),
  }: {
    hasRecord?: boolean
    lock?: EditLockState
    take?: () => Promise<EditLockState>
  } = {},
) {
  const dataProvider = {
    getEditLock: vi.fn(() => Promise.resolve(lock)),
    takeEditLock: vi.fn(take),
    releaseEditLock: vi.fn(() => Promise.resolve()),
  } as unknown as ErpDataProvider
  const authProvider = {
    getMe: vi.fn(() => Promise.resolve(ME)),
    checkError: vi.fn(() => Promise.resolve()),
  } as unknown as ErpAuthProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <CoreAdminContext
      dataProvider={dataProvider}
      authProvider={authProvider}
      queryClient={queryClient}
    >
      <Session access={access} hasRecord={hasRecord} />
    </CoreAdminContext>,
  )
  return { dataProvider }
}

describe("useEditSession", () => {
  it("право й вільний запис: лише читання, поки блокування не взято, далі — зміна", async () => {
    let resolve: (state: EditLockState) => void = () => undefined
    const { dataProvider } = setup(ALLOWED, {
      take: () =>
        new Promise((done) => {
          resolve = done
        }),
    })
    await waitFor(() => {
      expect(dataProvider.takeEditLock).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId("mode")).toHaveTextContent("читання")
    expect(screen.getByTestId("reason")).toHaveTextContent("немає")
    resolve(MINE)
    await waitFor(() => {
      expect(screen.getByTestId("mode")).toHaveTextContent("зміна")
    })
  })

  it("збій блокування: форма однаково стає доступною", async () => {
    setup(ALLOWED, { take: () => Promise.reject(new Error("network")) })
    await waitFor(() => {
      expect(screen.getByTestId("mode")).toHaveTextContent("зміна")
    })
  })

  it("без права ролі — причина модуля, блокування не береться", async () => {
    const { dataProvider } = setup({ isPending: false, canAccess: false })
    expect(screen.getByTestId("reason")).toHaveTextContent(DENIED)
    expect(screen.getByTestId("mode")).toHaveTextContent("читання")
    await waitFor(() => {
      expect(dataProvider.getEditLock).toHaveBeenCalled()
    })
    expect(dataProvider.takeEditLock).not.toHaveBeenCalled()
  })

  it("запис забороняє зміну — причина запису замість причини без права", () => {
    setup({
      isPending: false,
      canAccess: false,
      recordReason: "Виставлений рахунок не змінюють",
    })
    expect(screen.getByTestId("reason")).toHaveTextContent(
      "Виставлений рахунок не змінюють",
    )
  })

  it("права ще невідомі — без причини й без блокування", () => {
    const { dataProvider } = setup({ isPending: true, canAccess: false })
    expect(screen.getByTestId("pending")).toHaveTextContent("так")
    expect(screen.getByTestId("reason")).toHaveTextContent("немає")
    expect(dataProvider.takeEditLock).not.toHaveBeenCalled()
  })

  it("запису ще немає — блокування не береться", async () => {
    const { dataProvider } = setup(ALLOWED, { hasRecord: false })
    await waitFor(() => {
      expect(dataProvider.getEditLock).toHaveBeenCalled()
    })
    expect(dataProvider.takeEditLock).not.toHaveBeenCalled()
  })

  it("запис редагує інша людина — смуга, причина й лише читання", async () => {
    setup(ALLOWED, { lock: THEIRS, take: () => Promise.resolve(THEIRS) })
    await waitFor(() => {
      expect(screen.getByTestId("reason")).toHaveTextContent(
        "Запис зараз редагує Марта Шевчук",
      )
    })
    expect(screen.getByRole("status")).toHaveTextContent(/Марта Шевчук/)
    expect(screen.getByTestId("mode")).toHaveTextContent("читання")
  })
})

describe("useRecordAccess: слова модуля", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CoreAdminContext
      authProvider={
        {
          checkAuth: () => Promise.resolve(),
          canAccess: () => Promise.resolve(true),
        } as unknown as ErpAuthProvider
      }
      queryClient={new QueryClient()}
    >
      {children}
    </CoreAdminContext>
  )
  const moduleText = (action: string, code: string) =>
    action === "update" && code === "submitted"
      ? "Виставлений рахунок не змінюють"
      : undefined

  it("код, який модуль пояснює сам, — його словами; інший — текстом кіта", async () => {
    const { result } = renderHook(
      () => ({
        own: useRecordAccess({
          resource: "sales-invoices",
          action: "update",
          record: { deniedActions: { update: "submitted" } },
          moduleText,
        }),
        kit: useRecordAccess({
          resource: "sales-invoices",
          action: "update",
          record: { deniedActions: { update: "shared" } },
          moduleText,
        }),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(result.current.own.isPending).toBe(false)
    })
    expect(result.current.own).toMatchObject({
      canAccess: false,
      recordReason: "Виставлений рахунок не змінюють",
    })
    expect(result.current.kit.canAccess).toBe(false)
    expect(result.current.kit.recordReason).not.toBe(
      "Виставлений рахунок не змінюють",
    )
    expect(result.current.kit.recordReason).toBeTruthy()
  })
})
