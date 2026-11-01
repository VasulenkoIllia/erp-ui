import { QueryClient } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  INBOX_QUERY_KEYS,
  NOTIFICATIONS_RESOURCE,
} from "@/registry/lib/notifications"
import {
  connectRealtime,
  REALTIME_RESYNC,
  type RealtimeEvent,
  type RealtimeOpen,
} from "@/registry/lib/realtime"
import {
  REALTIME_FLUSH_MS,
  syncRealtimeCache,
} from "@/registry/lib/realtime-cache"

import { timelineEventType, timelineQueryKey } from "@/registry/lib/timeline"

const encoder = new TextEncoder()

const event = (type: string, resource: string): RealtimeEvent => ({
  type,
  resource,
  id: "1",
  at: "2026-11-01T10:00:00.000Z",
})

/** Подія в застосунку йде тим самим шляхом, що від сервера: через потік каналу. */
function liveChannel() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
    },
  })
  const open: RealtimeOpen = () =>
    Promise.resolve(
      new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    )
  return {
    stop: connectRealtime({ open, accountId: "u-1", companyId: "cache-test" }),
    send: async (...events: RealtimeEvent[]) => {
      for (const item of events)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`))
      await vi.advanceTimersByTimeAsync(0)
    },
  }
}

function setup() {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")
  const stopSync = syncRealtimeCache(queryClient)
  const channel = liveChannel()
  return {
    queryClient,
    invalidate,
    send: channel.send,
    stop: () => {
      channel.stop()
      stopSync()
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  // Без Web Locks канал відкривається одразу, без черги.
  vi.stubGlobal("navigator", {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("syncRealtimeCache", () => {
  it("сотні подій ресурсу — одне перечитування", async () => {
    const { invalidate, send, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    await send(
      ...Array.from({ length: 300 }, () =>
        event("invoices.updated", "invoices"),
      ),
      event("contacts.created", "contacts"),
    )
    expect(invalidate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS)
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["invoices"] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contacts"] })
    stop()
  })

  it("подія сповіщень перечитує кеш дзвіночка", async () => {
    const { invalidate, send, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    await send(event("notifications.created", NOTIFICATIONS_RESOURCE))
    await vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: INBOX_QUERY_KEYS.all,
    })
    stop()
  })

  it("подія запису оновлює й стрічку: ключ починається з ресурсу", async () => {
    const { queryClient, send, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    const key = timelineQueryKey({ resource: "invoices", id: "1" })
    queryClient.setQueryData(key, [])
    await send(event("invoices.updated", "invoices"))
    await vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS)
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    stop()
  })

  it("подія стрічки не чіпає кеш списків ресурсу", async () => {
    const { invalidate, send, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    await send(event(timelineEventType("invoices"), "invoices"))
    await vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS)
    expect(invalidate).not.toHaveBeenCalled()
    stop()
  })

  it("подія не про запис кеш не чіпає", async () => {
    const { invalidate, send, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    await send(event("invoices.locked", "invoices"))
    await vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS)
    expect(invalidate).not.toHaveBeenCalled()
    stop()
  })

  it("відновлення перечитує все, крім ключів кіта", async () => {
    const { queryClient, send, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    queryClient.setQueryData(["invoices"], [])
    queryClient.setQueryData(["erp-ui", "me"], {})
    queryClient.setQueryData(INBOX_QUERY_KEYS.all, [])
    await send(event(REALTIME_RESYNC, "realtime"))
    expect(queryClient.getQueryState(["invoices"])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(INBOX_QUERY_KEYS.all)?.isInvalidated).toBe(
      true,
    )
    expect(queryClient.getQueryState(["erp-ui", "me"])?.isInvalidated).toBe(
      false,
    )
    stop()
  })

  it("після зупинки відкладене перечитування не спрацьовує", async () => {
    const { invalidate, send, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    await send(event("invoices.updated", "invoices"))
    stop()
    await vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
