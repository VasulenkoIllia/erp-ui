import { QueryClient } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { CoreAdminContext, useGetList, type DataProvider } from "ra-core"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { useCardRecord } from "@/registry/hooks/use-card-record"
import { companyScope } from "@/registry/lib/company-scope"

/**
 * `useCardRecord().isFresh` (ADR-0083): QR-код і аркуш друку — лише з відповіді власного запиту картки. ra-core
 * кладе рядки списку того самого ресурсу в кеш карток (`setQueryData`), і `isFetchedAfterMount` від цього
 * стає true ще до відповіді картки.
 */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const ROW = { id: "inv-1", total: 100 }

function setup() {
  const card = deferred<{ data: typeof ROW & { paidTotal: number } }>()
  const dataProvider = {
    getOne: () => card.promise,
    getList: () => Promise.resolve({ data: [ROW], total: 1 }),
  } as unknown as DataProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CoreAdminContext queryClient={queryClient} dataProvider={dataProvider}>
      {children}
    </CoreAdminContext>
  )
  const hook = renderHook(
    () => {
      const record = useCardRecord<typeof ROW>("sales-invoices", "inv-1")
      // Список того самого ресурсу на тій самій сторінці: його рядок потрапляє в кеш картки.
      const list = useGetList("sales-invoices", { meta: companyScope(null) })
      return { record, list }
    },
    { wrapper },
  )
  return { hook, card }
}

describe("useCardRecord: свіжість", () => {
  it("рядок списку в кеші картки не робить її свіжою, доки не прийде відповідь картки", async () => {
    const { hook, card } = setup()
    await waitFor(() => {
      expect(hook.result.current.list.data).toHaveLength(1)
    })
    expect(hook.result.current.record.record).toEqual(ROW)
    expect(hook.result.current.record.isFresh).toBe(false)

    await act(async () => {
      card.resolve({ data: { ...ROW, paidTotal: 40 } })
      await card.promise
    })
    await waitFor(() => {
      expect(hook.result.current.record.isFresh).toBe(true)
    })
    expect(hook.result.current.record.record).toEqual({
      ...ROW,
      paidTotal: 40,
    })
  })
})
