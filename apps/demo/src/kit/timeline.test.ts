import { describe, expect, it, vi } from "vitest"

import { createApiClient } from "@/registry/lib/api"
import {
  TIMELINE_POLL_MS,
  createTimelineApi,
  timelineEntriesOf,
  timelineEntrySchema,
  timelineEventType,
  timelineQueryKey,
  type TimelinePage,
} from "@/registry/lib/timeline"

/** Контракт стрічки запису (ADR-0053): розбір записів, сторінки, адреси запитів. */
const BASE = {
  id: "e1",
  at: "2026-11-01T10:00:00.000Z",
  author: { id: "u-1", name: "Олена" },
}
const TARGET = { resource: "invoices", id: "inv/1" }

const page = (...ids: string[]): TimelinePage => ({
  total: 10,
  data: ids.map((id) => ({
    ...BASE,
    id,
    kind: "other",
    text: id,
  })),
})

function apiWith(body: unknown = { data: [], total: 0 }, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
    ),
  )
  return { fetch, api: createTimelineApi(createApiClient({ fetch })) }
}

const lastCall = (fetch: ReturnType<typeof apiWith>["fetch"]) => {
  const [url, init] = fetch.mock.calls.at(-1) ?? []
  return { url: url as string, init }
}

describe("timelineEntrySchema", () => {
  it("простий рядок стає документом", () => {
    const entry = timelineEntrySchema.parse({
      ...BASE,
      kind: "note",
      version: 1,
      body: "Перший рядок\nДругий рядок",
    })
    expect(entry.kind === "note" && entry.body.content).toHaveLength(2)
  })

  it("небезпечне посилання в документі зникає, текст лишається", () => {
    const entry = timelineEntrySchema.parse({
      ...BASE,
      kind: "message",
      direction: "incoming",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "клік",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      },
    })
    expect(JSON.stringify(entry)).not.toContain("javascript")
    expect(JSON.stringify(entry)).toContain("клік")
  })

  it("невідомий вид стає `other` зі своїм текстом", () => {
    expect(
      timelineEntrySchema.parse({
        ...BASE,
        kind: "invoice_paid",
        text: "Оплачено",
      }),
    ).toMatchObject({ kind: "other", text: "Оплачено" })
  })

  it("запис, що не пройшов схему, не ламає стрічку", () => {
    expect(
      timelineEntrySchema.parse({
        ...BASE,
        kind: "note",
        version: 1,
        body: 42,
      }),
    ).toMatchObject({ kind: "other" })
  })

  it("запис без автора й часу сторінку ламає: це вже інший контракт", () => {
    expect(() => timelineEntrySchema.parse({ kind: "note" })).toThrow()
  })
})

describe("timelineEntriesOf", () => {
  it("новий запис зсуває сторінки: рядок на межі не двоїться", () => {
    expect(
      timelineEntriesOf([page("c", "b"), page("b", "a")]).map(({ id }) => id),
    ).toEqual(["c", "b", "a"])
  })
})

describe("createTimelineApi", () => {
  it("читання фонове, фільтр `all` не йде в запит, id кодується", async () => {
    const { api, fetch } = apiWith()
    await api.list(TARGET, "all", 2, 20)
    const { url, init } = lastCall(fetch)
    expect(url).toBe("/api/v1/invoices/inv%2F1/timeline?page=2&perPage=20")
    expect(new Headers(init?.headers).get("X-Background-Request")).toBe("1")
  })

  it("фільтр вузить запит за видом", async () => {
    const { api, fetch } = apiWith()
    await api.list(TARGET, "note", 1, 20)
    expect(lastCall(fetch).url).toContain("kind=note")
  })

  it("запис — звичайний запит із `requestId`, сесію продовжує", async () => {
    const { api, fetch } = apiWith({
      ...BASE,
      kind: "note",
      version: 1,
      body: "Текст",
    })
    await api.post(TARGET, {
      requestId: "r-1",
      kind: "note",
      body: { type: "doc", content: [] },
    })
    const { url, init } = lastCall(fetch)
    expect(url).toBe("/api/v1/invoices/inv%2F1/timeline")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toMatchObject({ requestId: "r-1" })
    expect(new Headers(init?.headers).has("X-Background-Request")).toBe(false)
  })

  it("файл іде формою з ключем ідемпотентності", async () => {
    const { api, fetch } = apiWith({
      ...BASE,
      kind: "file",
      file: { id: "f", name: "a.pdf", size: 1, url: "https://files.example/a" },
    })
    await api.uploadFile(TARGET, new File(["a"], "a.pdf"), "r-2")
    const { url, init } = lastCall(fetch)
    expect(url).toBe("/api/v1/invoices/inv%2F1/files")
    const form = init?.body as FormData
    expect(form.get("requestId")).toBe("r-2")
    expect((form.get("file") as File).name).toBe("a.pdf")
  })

  it("підписник: `PUT`, `DELETE`, відповідь без тіла", async () => {
    const { api, fetch } = apiWith(null, 204)
    await api.follow(TARGET, "u-1")
    expect(lastCall(fetch).init?.method).toBe("PUT")
    await api.unfollow(TARGET, "u-1")
    expect(lastCall(fetch).url).toBe("/api/v1/invoices/inv%2F1/followers/u-1")
    expect(lastCall(fetch).init?.method).toBe("DELETE")
  })
})

describe("ключі й події", () => {
  it("ключ кешу починається з ресурсу: подія запису оновлює й стрічку", () => {
    expect(timelineQueryKey(TARGET)[0]).toBe("invoices")
  })

  it("подія не збігається з подіями запису: кеш списку вона не чіпає", () => {
    expect(timelineEventType("invoices")).toBe("invoices.timeline")
    expect(TIMELINE_POLL_MS).toBeGreaterThan(0)
  })
})
