import { QueryClient } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { CoreAdminContext, useGetList, type DataProvider } from "ra-core"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { useCardRecord } from "@/registry/hooks/use-card-record"
import { companyScope } from "@/registry/lib/company-scope"

/**
 * `useCardRecord().isFresh` (ADR-0083): QR-код і аркуш друку — лише з відповіді власного запиту картки. ra-core
 * кладе рядки списку того самого ресурсу в кеш карток (`setQueryData`): від цього `isFetchedAfterMount` стає
 * true ще до відповіді картки, а помилка картки стирається.
 */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const ROW = { id: "inv-1", total: 100 }
type Card = { data: typeof ROW & { paidTotal: number } }

function setup() {
  const cards: ReturnType<typeof deferred<Card>>[] = []
  // Кожне читання списку — новий рядок: ra-core пише кеш картки, лише коли дані списку змінились.
  let listed = 0
  const dataProvider = {
    getOne: () => {
      const card = deferred<Card>()
      cards.push(card)
      return card.promise
    },
    getList: () => {
      listed += 1
      return Promise.resolve({ data: [{ ...ROW, listed }], total: 1 })
    },
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
  const answer = async (index: number, paidTotal: number) => {
    await act(async () => {
      cards[index]?.resolve({ data: { ...ROW, paidTotal } })
      await cards[index]?.promise
    })
  }
  return { hook, cards, answer }
}

describe("useCardRecord: свіжість", () => {
  it("рядок списку в кеші картки не робить її свіжою, доки не прийде відповідь картки", async () => {
    const { hook, answer } = setup()
    await waitFor(() => {
      expect(hook.result.current.list.data).toHaveLength(1)
    })
    expect(hook.result.current.record.record).toEqual({ ...ROW, listed: 1 })
    expect(hook.result.current.record.isFresh).toBe(false)

    await answer(0, 40)
    await waitFor(() => {
      expect(hook.result.current.record.isFresh).toBe(true)
    })
    expect(hook.result.current.record.record).toEqual({
      ...ROW,
      paidTotal: 40,
    })
  })

  it("збій картки: перечитаний список не робить запис свіжим, лише повтор картки", async () => {
    const { hook, cards, answer } = setup()
    await waitFor(() => {
      expect(hook.result.current.list.data).toHaveLength(1)
    })
    await act(async () => {
      cards[0]?.reject(new Error("server"))
      await cards[0]?.promise.catch(() => undefined)
    })
    await waitFor(() => {
      expect(hook.result.current.record.failure).toBeDefined()
    })
    // Список перечитали: ra-core знову кладе рядок у кеш картки й стирає її помилку.
    await act(async () => {
      await hook.result.current.list.refetch()
    })
    await waitFor(() => {
      expect(hook.result.current.record.failure).toBeUndefined()
    })
    expect(hook.result.current.record.isFresh).toBe(false)

    act(() => {
      hook.result.current.record.retry()
    })
    await waitFor(() => {
      expect(cards).toHaveLength(2)
    })
    expect(hook.result.current.record.isFresh).toBe(false)
    await answer(1, 40)
    await waitFor(() => {
      expect(hook.result.current.record.isFresh).toBe(true)
    })
  })
})
