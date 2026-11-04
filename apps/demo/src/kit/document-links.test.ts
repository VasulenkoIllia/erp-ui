import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"

import { ApiError, createApiClient } from "@/registry/lib/api"
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  DOCUMENT_FLOW_LIMIT,
  documentFlowSchema,
  documentFlowSteps,
  type DocumentFlow,
  type DocumentFlowNode,
} from "@/registry/lib/document-links"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { signInMock } from "@/registry/lib/mocks"

import {
  BASE,
  doc,
  flowHandlers,
  orders,
  quotes,
} from "./document-flow.fixtures"

/**
 * Крок UI13 (ADR-0061): контракт потоку документів (`lib/document-links`) і мок
 * `GET /<ресурс>/:id/flow` — обхід у обидва боки, позначки без права й видаленого, межа, порядок.
 */
const server = setupServer(...flowHandlers)
const data = createDataProvider(createApiClient({ baseUrl: BASE }))

const summary = (flow: DocumentFlow) =>
  flow.documents.map((node) => `${node.resource}:${node.id}:${node.access}`)
const deleted = (resource: string, id: string): DocumentFlowNode => ({
  resource,
  id,
  access: "deleted",
})

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  quotes.db.reset()
  orders.db.reset()
  resetScenarios()
  signInMock("full")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("контракт потоку", () => {
  it("документ без права: лише тип, номер і зв'язки, решту полів кіт відкидає", () => {
    const flow = documentFlowSchema.parse({
      documents: [
        {
          resource: "invoices",
          id: "i1",
          access: "forbidden",
          number: "РАХ-1",
          date: "2026-11-01",
          total: { amount: 100, currency: "UAH" },
          links: [{ kind: "basedOn", resource: "orders", id: "o1" }],
        },
      ],
    })
    expect(flow).toEqual({
      documents: [
        {
          resource: "invoices",
          id: "i1",
          access: "forbidden",
          number: "РАХ-1",
          links: [{ kind: "basedOn", resource: "orders", id: "o1" }],
        },
      ],
      truncated: false,
    })
  })

  it("дата не ISO, валюта не з трьох літер чи невідомий доступ — помилка схеми, а не збій показу", () => {
    const granted = (extra: object) => ({
      documents: [
        {
          resource: "orders",
          id: "o1",
          access: "granted",
          number: "ЗАМ-1",
          ...extra,
        },
      ],
    })
    expect(documentFlowSchema.safeParse(granted({ date: "n/a" })).success).toBe(
      false,
    )
    expect(
      documentFlowSchema.safeParse(
        granted({ total: { amount: 1, currency: "1$A" } }),
      ).success,
    ).toBe(false)
    expect(
      documentFlowSchema.safeParse({
        documents: [{ resource: "orders", id: "o1", access: "hidden" }],
      }).success,
    ).toBe(false)
  })

  it("межа: рівно 100 — не обрізано, більше — обрізано; повтор документа відкидається", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => deleted("orders", String(i)))
    expect(
      documentFlowSchema.parse({ documents: many(DOCUMENT_FLOW_LIMIT) })
        .truncated,
    ).toBe(false)
    const cut = documentFlowSchema.parse({
      documents: many(DOCUMENT_FLOW_LIMIT + 5),
    })
    expect(cut.documents).toHaveLength(DOCUMENT_FLOW_LIMIT)
    expect(cut.truncated).toBe(true)
    const twice = documentFlowSchema.parse({
      documents: [deleted("orders", "1"), deleted("orders", "1")],
    })
    expect(twice.documents).toHaveLength(1)
  })

  it("кроки — за типом у порядку першої появи", () => {
    const steps = documentFlowSteps([
      deleted("orders", "1"),
      deleted("invoices", "2"),
      deleted("orders", "3"),
    ])
    expect(
      steps.map((step) => [step.resource, step.documents.map((d) => d.id)]),
    ).toEqual([
      ["orders", ["1", "3"]],
      ["invoices", ["2"]],
    ])
  })
})

describe("мок GET /<ресурс>/:id/flow", () => {
  it("від виправленої копії в обидва боки: тип за типом, у типі за датою, копія того самого дня — після першого", async () => {
    const flow = await data.getDocumentFlow("orders", "o3")
    expect(summary(flow)).toEqual([
      "quotes:q1:granted",
      "orders:o2:granted",
      "orders:o3:granted",
      "orders:o5:granted",
    ])
    expect(flow.documents[2]).toMatchObject({
      number: null,
      docStatus: "draft",
      links: [{ kind: "amendedFrom", resource: "orders", id: "o2" }],
    })
    // Від пропозиції той самий ланцюг: обхід іде й за зворотними зв'язками.
    expect(summary(await data.getDocumentFlow("quotes", "q1"))).toEqual(
      summary(flow),
    )
  })

  it("ланцюг із п'яти копій того самого дня від середньої — від першої до останньої", async () => {
    orders.db.all().push(
      ...[1, 2, 3, 4, 5].map((n) =>
        doc(`x${String(n)}`, `ЗАМ-X${String(n)}`, {
          date: "2026-11-07",
          ...(n > 1 && { amendedFrom: `x${String(n - 1)}` }),
        }),
      ),
    )
    expect(summary(await data.getDocumentFlow("orders", "x3"))).toEqual(
      [1, 2, 3, 4, 5].map((n) => `orders:x${String(n)}:granted`),
    )
  })

  it("без права на пропозиції — позначка з номером без полів; запису немає — видалений; ресурсу без джерела немає в потоці", async () => {
    signInMock("orders")
    const flow = await data.getDocumentFlow("orders", "o2")
    expect(flow.documents[0]).toEqual({
      resource: "quotes",
      id: "q1",
      access: "forbidden",
      number: "ПРО-1",
      links: [],
    })
    expect(summary(await data.getDocumentFlow("orders", "o4"))).toEqual([
      "quotes:q-gone:deleted",
      "orders:o4:granted",
    ])
    expect(summary(await data.getDocumentFlow("orders", "o9"))).toEqual([
      "orders:o9:granted",
    ])
  })

  it("без права на ресурс запиту — 403, невідомий документ — 404, сценарій — помилка", async () => {
    signInMock("quotes")
    await expect(data.getDocumentFlow("orders", "o2")).rejects.toMatchObject({
      status: 403,
    })
    signInMock("full")
    await expect(data.getDocumentFlow("orders", "nope")).rejects.toMatchObject({
      status: 404,
    })
    setScenario("error", "orders")
    await expect(data.getDocumentFlow("orders", "o2")).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it("понад межу — `truncated`, документ запиту перший і в межі", async () => {
    orders.db
      .all()
      .push(
        ...Array.from({ length: DOCUMENT_FLOW_LIMIT + 1 }, (_, i) =>
          doc(`x${String(i)}`, `ЗАМ-X${String(i)}`, { quoteId: "q1" }),
        ),
      )
    const flow = await data.getDocumentFlow("orders", "o5")
    expect(flow.documents).toHaveLength(DOCUMENT_FLOW_LIMIT)
    expect(flow.truncated).toBe(true)
    expect(summary(flow)).toContain("orders:o5:granted")
  })
})
