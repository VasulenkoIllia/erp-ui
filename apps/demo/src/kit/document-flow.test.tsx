import { QueryClient } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import { MemoryRouter } from "react-router"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { z } from "zod"

import {
  DocumentFlow,
  DocumentFlowView,
  type DocumentFlowType,
} from "@/registry/erp/document-flow"
import { ApiError, createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  DOCUMENT_FLOW_LIMIT,
  documentFlowSchema,
  documentFlowSteps,
  type DocumentFlow as DocumentFlowData,
  type DocumentFlowNode,
} from "@/registry/lib/document-links"
import { documentLifecycleSchema } from "@/registry/lib/document-lifecycle"
import {
  createDocumentFlowHandlers,
  documentFlowSource,
} from "@/registry/lib/mock-document-flow"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Крок UI13 (ADR-0061): контракт потоку документів, мок `GET /<ресурс>/:id/flow` за зв'язками й
 * компонент — позначки без права й видаленого, поточний документ, стани.
 */
const BASE = "http://erp.test/api/v1"

const docSchema = recordBaseSchema
  .extend({
    number: z.string().nullable(),
    date: z.string(),
    status: z.string(),
    quoteId: z.string().nullable().optional(),
  })
  .extend(documentLifecycleSchema.shape)
type Doc = z.infer<typeof docSchema>

const doc = (id: string, number: string | null, extra: Partial<Doc> = {}) =>
  ({
    id,
    version: 1,
    number,
    date: "2026-11-01",
    status: "submitted",
    docStatus: "submitted",
    ...extra,
  }) satisfies Doc

const quotes = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "quotes",
  schema: docSchema,
  data: () => [doc("q1", "ПРО-1", { date: "2026-10-20" })],
})
const orders = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "orders",
  schema: docSchema,
  data: () => [
    doc("o2", "ЗАМ-2", {
      quoteId: "q1",
      docStatus: "cancelled",
      amendedBy: "o3",
    }),
    doc("o3", null, {
      date: "2026-11-02",
      docStatus: "draft",
      amendedFrom: "o2",
    }),
    // Виправлену копію видалили: посилання лишилось, запису немає.
    doc("o4", "ЗАМ-4", { quoteId: "q-gone", date: "2026-11-03" }),
    doc("o9", "ЗАМ-9", { date: "2026-11-04" }),
  ],
})

const fields = (record: Doc) => ({
  number: record.number,
  date: record.date,
  status: record.status,
  docStatus: record.docStatus,
})
const orderLinks = (record: Doc) => [
  ...(record.quoteId
    ? [{ kind: "basedOn" as const, resource: "quotes", id: record.quoteId }]
    : []),
  ...(record.amendedFrom
    ? [
        {
          kind: "amendedFrom" as const,
          resource: "orders",
          id: record.amendedFrom,
        },
      ]
    : []),
]

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [
      user("full", ["quotes:*", "orders:*"]),
      user("orders", ["orders:read"]),
      user("quotes", ["quotes:read"]),
    ],
  }),
  ...createDocumentFlowHandlers({
    baseUrl: BASE,
    sources: [
      documentFlowSource({ resource: "quotes", db: quotes.db, node: fields }),
      documentFlowSource({
        resource: "orders",
        db: orders.db,
        node: fields,
        links: orderLinks,
      }),
    ],
  }),
  ...quotes.handlers,
  ...orders.handlers,
)
const data = createDataProvider(createApiClient({ baseUrl: BASE }))

const summary = (flow: DocumentFlowData) =>
  flow.documents.map((node) => `${node.resource}:${node.id}:${node.access}`)

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
  it("документ без права: лише тип і номер, решту полів кіт відкидає", () => {
    const flow = documentFlowSchema.parse({
      documents: [
        {
          resource: "invoices",
          id: "i1",
          access: "forbidden",
          number: "РАХ-1",
          date: "2026-11-01",
          total: { amount: 100, currency: "UAH" },
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
        },
      ],
      truncated: false,
    })
  })

  it("довша за межу відповідь обрізається й вважається обрізаною; невідомий доступ — помилка", () => {
    const many = Array.from({ length: DOCUMENT_FLOW_LIMIT + 5 }, (_, i) => ({
      resource: "orders",
      id: `o${String(i)}`,
      access: "deleted",
    }))
    const flow = documentFlowSchema.parse({ documents: many })
    expect(flow.documents).toHaveLength(DOCUMENT_FLOW_LIMIT)
    expect(flow.truncated).toBe(true)
    expect(
      documentFlowSchema.safeParse({
        documents: [{ resource: "orders", id: "o1", access: "hidden" }],
      }).success,
    ).toBe(false)
  })

  it("кроки — за типом у порядку першої появи", () => {
    const node = (resource: string, id: string): DocumentFlowNode => ({
      resource,
      id,
      access: "deleted",
    })
    const steps = documentFlowSteps([
      node("orders", "1"),
      node("invoices", "2"),
      node("orders", "3"),
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
  it("від виправленої копії в обидва боки: пропозиція, скасоване замовлення, копія — тип за типом, у типі за датою", async () => {
    const flow = await data.getDocumentFlow("orders", "o3")
    expect(summary(flow)).toEqual([
      "quotes:q1:granted",
      "orders:o2:granted",
      "orders:o3:granted",
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

  it("без права на пропозиції — позначка з номером без полів; запису немає — видалений", async () => {
    signInMock("orders")
    const flow = await data.getDocumentFlow("orders", "o2")
    expect(flow.documents[0]).toEqual({
      resource: "quotes",
      id: "q1",
      access: "forbidden",
      number: "ПРО-1",
      links: [],
    })
    const gone = await data.getDocumentFlow("orders", "o4")
    expect(summary(gone)).toEqual([
      "quotes:q-gone:deleted",
      "orders:o4:granted",
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

  it("понад межу — `truncated` і не більше DOCUMENT_FLOW_LIMIT документів", async () => {
    const extra = Array.from({ length: DOCUMENT_FLOW_LIMIT + 1 }, (_, i) =>
      doc(`x${String(i)}`, `ЗАМ-X${String(i)}`, { quoteId: "q1" }),
    )
    orders.db.all().push(...extra)
    const flow = await data.getDocumentFlow("quotes", "q1")
    expect(flow.documents).toHaveLength(DOCUMENT_FLOW_LIMIT)
    expect(flow.truncated).toBe(true)
  })
})

const TYPES: Record<string, DocumentFlowType> = {
  quotes: { label: "Пропозиція", href: (id) => `/quotes/${id}` },
  orders: { label: "Замовлення", href: (id) => `/orders/${id}` },
  invoices: { label: "Рахунок" },
}

const SAMPLE: DocumentFlowData = {
  truncated: false,
  documents: [
    {
      resource: "quotes",
      id: "q1",
      access: "granted",
      number: "ПРО-1",
      date: "2026-10-20",
      docStatus: "submitted",
      total: { amount: 120_000, currency: "UAH" },
    },
    {
      resource: "orders",
      id: "o1",
      access: "granted",
      number: "ЗАМ-1",
      docStatus: "submitted",
      links: [{ kind: "basedOn", resource: "quotes", id: "q1" }],
    },
    {
      resource: "invoices",
      id: "i1",
      access: "forbidden",
      number: "РАХ-1",
      links: [{ kind: "basedOn", resource: "orders", id: "o1" }],
    },
    { resource: "invoices", id: "i2", access: "deleted", number: null },
  ],
}

function renderView(
  props: Partial<Parameters<typeof DocumentFlowView>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <DocumentFlowView
        resource="orders"
        id="o1"
        types={TYPES}
        flow={SAMPLE}
        {...props}
      />
    </MemoryRouter>,
  )
}

const item = (step: string, index = 0) => {
  const found = within(screen.getByRole("list", { name: step })).getAllByRole(
    "listitem",
  )[index]
  if (!found) throw new Error(`${step}: no item ${String(index)}`)
  return found
}

describe("DocumentFlowView", () => {
  it("кроки за типами, посилання на картки, поточний документ без посилання", () => {
    renderView()
    const flow = screen.getByRole("list", { name: "Потік документів" })
    expect(
      within(flow)
        .getAllByRole("listitem")
        .filter((li) => li.dataset.slot === "document-flow-step"),
    ).toHaveLength(3)
    expect(
      within(item("Пропозиція")).getByRole("link", { name: "ПРО-1" }),
    ).toHaveAttribute("href", "/quotes/q1")
    expect(item("Пропозиція")).toHaveTextContent("Проведено")
    const current = item("Замовлення")
    expect(current).toHaveAttribute("aria-current", "page")
    expect(current).toHaveTextContent("Цей документ")
    expect(current).toHaveTextContent("На підставі ПРО-1")
    expect(within(current).queryByRole("link")).toBeNull()
  })

  it("без права — «Немає доступу» без посилання; видалений — позначка й «Без номера»", () => {
    renderView()
    const forbidden = item("Рахунок", 0)
    expect(forbidden).toHaveTextContent("РАХ-1")
    expect(forbidden).toHaveTextContent("Немає доступу")
    expect(forbidden).toHaveTextContent("На підставі ЗАМ-1")
    expect(within(forbidden).queryByRole("link")).toBeNull()
    const deleted = item("Рахунок", 1)
    expect(deleted).toHaveTextContent("Без номера")
    expect(deleted).toHaveTextContent("Видалено")
    expect(within(deleted).queryByRole("link")).toBeNull()
  })

  it("лише поточний документ — пояснення, а не порожній список", () => {
    renderView({
      flow: { documents: SAMPLE.documents.slice(1, 2), truncated: false },
    })
    expect(screen.queryByRole("list")).toBeNull()
    expect(
      screen.getByText(/Пов'язаних документів ще немає/),
    ).toBeInTheDocument()
  })

  it("помилка й офлайн — повідомлення з повтором; немає права — без повтору", async () => {
    const onRetry = vi.fn()
    const { rerender } = renderView({
      flow: undefined,
      error: new ApiError(500, { code: "server", message: "boom" }),
      onRetry,
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося завантажити пов'язані документи.",
    )
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(onRetry).toHaveBeenCalledOnce()
    const view = (error: ApiError) => (
      <MemoryRouter>
        <DocumentFlowView
          resource="orders"
          id="o1"
          types={TYPES}
          flow={undefined}
          error={error}
          onRetry={onRetry}
        />
      </MemoryRouter>
    )
    rerender(view(new ApiError(0, { code: "offline", message: "offline" })))
    expect(screen.getByRole("alert")).toHaveTextContent("Немає з'єднання")
    rerender(view(new ApiError(403, { code: "forbidden", message: "no" })))
    expect(
      screen.getByText("Немає права бачити пов'язані документи."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("завантаження — скелетон; збій оновлення — дані лишаються з повідомленням; обрізаний — підпис", () => {
    const { rerender } = renderView({ flow: undefined })
    expect(
      screen.getByRole("status", {
        name: "Завантаження пов'язаних документів",
      }),
    ).toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <DocumentFlowView
          resource="orders"
          id="o1"
          types={TYPES}
          flow={{ ...SAMPLE, truncated: true }}
          error={new ApiError(0, { code: "offline", message: "offline" })}
          onRetry={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося оновити пов'язані документи",
    )
    expect(screen.getByRole("link", { name: "ПРО-1" })).toBeInTheDocument()
    expect(screen.getByText(/Показано не всі/)).toBeInTheDocument()
  })
})

describe("DocumentFlow", () => {
  it("бере потік із сервера й позначає поточний документ", async () => {
    render(
      <MemoryRouter>
        <CoreAdminContext
          dataProvider={data}
          queryClient={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <DocumentFlow resource="orders" id="o3" types={TYPES} />
        </CoreAdminContext>
      </MemoryRouter>,
    )
    const step = await screen.findByRole("list", { name: "Замовлення" })
    expect(within(step).getByRole("link", { name: "ЗАМ-2" })).toHaveAttribute(
      "href",
      "/orders/o2",
    )
    expect(within(step).getAllByRole("listitem")[1]).toHaveTextContent(
      "Виправлена копія ЗАМ-2",
    )
  })
})
