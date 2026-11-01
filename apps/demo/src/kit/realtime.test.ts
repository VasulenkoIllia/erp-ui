import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/registry/lib/api"
import {
  connectRealtime,
  createRealtimeChannel,
  getRealtimeStatus,
  HEARTBEAT_TIMEOUT_MS,
  REALTIME_RESYNC,
  realtimeRetryDelay,
  RETRY_MAX_MS,
  STABLE_CONNECTION_MS,
  subscribeRealtime,
  type RealtimeEvent,
  type RealtimeOpen,
  type RealtimeStatus,
} from "@/registry/lib/realtime"

const encoder = new TextEncoder()
const EVENT: RealtimeEvent = {
  type: "invoices.updated",
  resource: "invoices",
  id: "inv-1",
  at: "2026-11-01T10:00:00.000Z",
}

/** Потік, керований тестом: `send` — байти, `close` — сервер закрив. */
function serverStream(headers = { "Content-Type": "text/event-stream" }) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
    },
  })
  return {
    response: new Response(body, { headers }),
    send(text: string) {
      controller.enqueue(encoder.encode(text))
    },
    close() {
      controller.close()
    },
  }
}

const message = (event: unknown, id?: string) =>
  `${id ? `id: ${id}\n` : ""}data: ${JSON.stringify(event)}\n\n`

function setup(open: RealtimeOpen, options?: { isResumed?: boolean }) {
  const events: RealtimeEvent[] = []
  const statuses: RealtimeStatus[] = []
  const onResync = vi.fn()
  const channel = createRealtimeChannel(
    open,
    {
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
      onResync,
    },
    options,
  )
  return { events, statuses, onResync, channel }
}

/** Дати мікрозадачам (читанню потоку) відпрацювати. */
const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("realtimeRetryDelay", () => {
  it("росте вдвічі, не більше межі, випадкова лише половина", () => {
    const top = () => 1
    expect(realtimeRetryDelay(0, 1000, top)).toBe(1000)
    expect(realtimeRetryDelay(3, 1000, top)).toBe(8000)
    expect(realtimeRetryDelay(20, 1000, top)).toBe(RETRY_MAX_MS)
    expect(realtimeRetryDelay(0, 1000, () => 0)).toBe(500)
  })
})

describe("createRealtimeChannel", () => {
  it("передає події й пропускає чужий формат, не зупиняючись", async () => {
    const stream = serverStream()
    const { events, statuses, channel } = setup(() =>
      Promise.resolve(stream.response),
    )
    await settle()
    expect(statuses).toEqual(["connecting", "open"])
    stream.send("data: не json\n\n")
    stream.send(message({ type: "x" }))
    stream.send(message(EVENT))
    await settle()
    expect(events).toEqual([EVENT])
    channel.stop()
    await channel.done
  })

  it("після обриву підключається знову з Last-Event-ID і просить перечитати", async () => {
    const first = serverStream()
    const second = serverStream()
    const open = vi
      .fn<RealtimeOpen>()
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response)
    const { statuses, onResync, channel } = setup(open)
    await settle()
    expect(onResync).not.toHaveBeenCalled()
    first.send(message(EVENT, "41"))
    await settle()
    first.close()
    await settle()
    expect(statuses.at(-1)).toBe("retrying")
    await vi.advanceTimersByTimeAsync(1000)
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[1]?.[0].lastEventId).toBe("41")
    expect(statuses.at(-1)).toBe("open")
    expect(onResync).toHaveBeenCalledTimes(1)
    channel.stop()
    await channel.done
  })

  it("пауза росте, і поле retry сервера її задає", async () => {
    const first = serverStream()
    const open = vi
      .fn<RealtimeOpen>()
      .mockResolvedValueOnce(first.response)
      .mockRejectedValue(new ApiError(0, { code: "offline", message: "" }))
    const { channel } = setup(open)
    await settle()
    first.send("retry: 5000\n\n")
    await settle()
    first.close()
    await settle()
    await vi.advanceTimersByTimeAsync(5000)
    expect(open).toHaveBeenCalledTimes(2)
    // Друга пауза вдвічі більша: 10 с за найбільшого випадкового множника.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(open).toHaveBeenCalledTimes(3)
    channel.stop()
    await channel.done
  })

  it("сервер, що приймає й одразу закриває, не скидає паузу", async () => {
    const open = vi.fn<RealtimeOpen>(() => {
      const stream = serverStream()
      stream.close()
      return Promise.resolve(stream.response)
    })
    const { channel } = setup(open)
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    // Паузи 1 + 2 + 4 + 8 + 16 + 30 с: без межі було б до 60 спроб.
    expect(open.mock.calls.length).toBeLessThan(10)
    channel.stop()
    await channel.done
  })

  it("стійке з'єднання скидає лічильник спроб", async () => {
    const first = serverStream()
    const second = serverStream()
    const third = serverStream()
    const open = vi
      .fn<RealtimeOpen>()
      .mockRejectedValueOnce(new ApiError(503, { code: "server", message: "" }))
      .mockRejectedValueOnce(new ApiError(503, { code: "server", message: "" }))
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response)
      .mockResolvedValueOnce(third.response)
    const { channel } = setup(open)
    await vi.advanceTimersByTimeAsync(3000)
    expect(open).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(STABLE_CONNECTION_MS)
    first.send(": ping\n\n")
    await settle()
    first.close()
    await settle()
    // Спроби рахуються знову з першої: 1 с, а не 8.
    await vi.advanceTimersByTimeAsync(1000)
    expect(open).toHaveBeenCalledTimes(4)
    channel.stop()
    await channel.done
  })

  it.each([401, 403, 404, 405, 501])(
    "статус %i: каналу немає, спроб більше немає",
    async (status) => {
      const open = vi.fn<RealtimeOpen>(() =>
        Promise.reject(new ApiError(status, { code: "x", message: "" })),
      )
      const { statuses, channel } = setup(open)
      await channel.done
      expect(statuses).toEqual(["connecting", "off"])
      await vi.advanceTimersByTimeAsync(120_000)
      expect(open).toHaveBeenCalledTimes(1)
    },
  )

  it("відповідь не потік подій (проксі дав сторінку): каналу немає", async () => {
    const { statuses, channel } = setup(() =>
      Promise.resolve(new Response("<html>", { status: 200 })),
    )
    await channel.done
    expect(statuses.at(-1)).toBe("off")
  })

  it("мовчання довше за межу обриває з'єднання, серцебиття продовжує його", async () => {
    const first = serverStream()
    const second = serverStream()
    const open = vi
      .fn<RealtimeOpen>()
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response)
    const { statuses, channel } = setup(open)
    await settle()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS - 1000)
    first.send(": ping\n\n")
    await settle()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS - 1000)
    expect(statuses.at(-1)).toBe("open")
    await vi.advanceTimersByTimeAsync(1000)
    expect(statuses.at(-1)).toBe("retrying")
    await vi.advanceTimersByTimeAsync(1000)
    expect(open).toHaveBeenCalledTimes(2)
    channel.stop()
    await channel.done
  })

  it("wake перериває паузу, stop зупиняє цикл", async () => {
    const first = serverStream()
    const open = vi
      .fn<RealtimeOpen>()
      .mockResolvedValueOnce(first.response)
      .mockRejectedValue(new ApiError(503, { code: "server", message: "" }))
    const { channel } = setup(open)
    await settle()
    first.close()
    await settle()
    channel.wake()
    await settle()
    expect(open).toHaveBeenCalledTimes(2)
    channel.stop()
    await channel.done
    await vi.advanceTimersByTimeAsync(120_000)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it("канал від іншої вкладки: перше з'єднання теж перечитує", async () => {
    const stream = serverStream()
    const { onResync, channel } = setup(
      () => Promise.resolve(stream.response),
      { isResumed: true },
    )
    await settle()
    expect(onResync).toHaveBeenCalledTimes(1)
    channel.stop()
    await channel.done
  })
})

/** Web Locks у межах тесту: черга за назвою, як у браузері. */
function installLocks() {
  const queues = new Map<string, Promise<unknown>>()
  const request = vi.fn(
    (
      name: string,
      { signal }: { signal: AbortSignal },
      run: () => Promise<void>,
    ) => {
      const previous = queues.get(name) ?? Promise.resolve()
      const next = previous.then(() =>
        signal.aborted
          ? Promise.reject(new DOMException("Aborted", "AbortError"))
          : run(),
      )
      queues.set(
        name,
        next.catch(() => undefined),
      )
      return next
    },
  )
  vi.stubGlobal("navigator", { locks: { request } })
  return request
}

describe("connectRealtime: одна вкладка", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("друга вкладка не відкриває каналу й отримує події першої", async () => {
    installLocks()
    const stream = serverStream()
    const openFirst = vi.fn<RealtimeOpen>(() =>
      Promise.resolve(stream.response),
    )
    const stopFirst = connectRealtime({ open: openFirst, companyId: "a" })
    await settle()
    expect(openFirst).toHaveBeenCalledTimes(1)

    const openSecond = vi.fn<RealtimeOpen>(() =>
      Promise.resolve(serverStream().response),
    )
    const heard: RealtimeEvent[] = []
    const stopListening = subscribeRealtime((event) => heard.push(event))
    const stopSecond = connectRealtime({ open: openSecond, companyId: "a" })
    await settle()
    expect(openSecond).not.toHaveBeenCalled()

    stream.send(message(EVENT))
    vi.useRealTimers()
    await vi.waitFor(() => {
      expect(heard.length).toBeGreaterThan(0)
    })
    stopFirst()
    stopSecond()
    stopListening()
  })

  it("власник закрився: канал переходить до наступної вкладки й перечитує", async () => {
    installLocks()
    const first = serverStream()
    const stopFirst = connectRealtime({
      open: () => Promise.resolve(first.response),
      companyId: "b",
    })
    await settle()
    const second = serverStream()
    const openSecond = vi.fn<RealtimeOpen>(() =>
      Promise.resolve(second.response),
    )
    const stopSecond = connectRealtime({ open: openSecond, companyId: "b" })
    await settle()
    expect(openSecond).not.toHaveBeenCalled()
    vi.useRealTimers()
    first.send(message(EVENT))
    // Друга вкладка має почути власника, щоб перехід рахувався відновленням.
    const heard: string[] = []
    const stopListening = subscribeRealtime(({ type }) => heard.push(type))
    await vi.waitFor(() => {
      expect(heard).toContain(EVENT.type)
    })
    stopFirst()
    await vi.waitFor(() => {
      expect(openSecond).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(heard).toContain(REALTIME_RESYNC)
    })
    stopSecond()
    stopListening()
  })

  it("без Web Locks кожна вкладка тримає свій канал", async () => {
    vi.stubGlobal("navigator", {})
    const open = vi.fn<RealtimeOpen>(() =>
      Promise.resolve(serverStream().response),
    )
    const stop = connectRealtime({ open, companyId: "c" })
    await settle()
    expect(open).toHaveBeenCalledTimes(1)
    expect(getRealtimeStatus()).toBe("open")
    stop()
    expect(getRealtimeStatus()).toBe("idle")
  })

  it("зупинка до отримання замка не відкриває каналу", async () => {
    installLocks()
    const hold = serverStream()
    const stopHolder = connectRealtime({
      open: () => Promise.resolve(hold.response),
      companyId: "d",
    })
    await settle()
    const open = vi.fn<RealtimeOpen>()
    const stop = connectRealtime({ open, companyId: "d" })
    stop()
    stopHolder()
    await settle()
    expect(open).not.toHaveBeenCalled()
  })
})
