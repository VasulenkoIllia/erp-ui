/**
 * Пропозиції й замовлення для тестів потоку документів (UI13, ADR-0061): мок `GET /<ресурс>/:id/flow`
 * на двох ресурсах, дія `amend` над замовленнями й користувачі з різними правами.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"
import { documentLifecycleSchema } from "@/registry/lib/document-lifecycle"
import {
  createDocumentFlowHandlers,
  documentFlowSource,
} from "@/registry/lib/mock-document-flow"
import { createTransitionHandlers } from "@/registry/lib/mock-transitions"
import {
  createPlatformHandlers,
  createResourceHandlers,
  type MockUser,
} from "@/registry/lib/mocks"

export const BASE = "http://erp.test/api/v1"

const docSchema = recordBaseSchema
  .extend({
    number: z.string().nullable(),
    date: z.string(),
    status: z.string(),
    quoteId: z.string().nullable().optional(),
    /** Рахунок, на підставі якого замовлення: у моку немає джерела рахунків. */
    invoiceId: z.string().nullable().optional(),
  })
  .extend(documentLifecycleSchema.shape)
export type Doc = z.infer<typeof docSchema>

export const doc = (
  id: string,
  number: string | null,
  extra: Partial<Doc> = {},
) =>
  ({
    id,
    version: 1,
    number,
    date: "2026-11-01",
    status: "submitted",
    docStatus: "submitted",
    ...extra,
  }) satisfies Doc

export const quotes = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "quotes",
  schema: docSchema,
  data: () => [doc("q1", "ПРО-1", { date: "2026-10-20" })],
})
export const orders = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "orders",
  schema: docSchema,
  data: () => [
    doc("o2", "ЗАМ-2", {
      quoteId: "q1",
      status: "cancelled",
      docStatus: "cancelled",
      amendedBy: "o3",
    }),
    // Копію зробили того самого дня: у типі вона однаково йде після скасованого.
    doc("o3", null, {
      status: "draft",
      docStatus: "draft",
      amendedFrom: "o2",
    }),
    // Пропозицію видалили: посилання лишилось, запису немає.
    doc("o4", "ЗАМ-4", { quoteId: "q-gone", date: "2026-11-03" }),
    doc("o5", "ЗАМ-5", {
      quoteId: "q1",
      status: "cancelled",
      docStatus: "cancelled",
      date: "2026-11-05",
    }),
    doc("o9", "ЗАМ-9", { invoiceId: "i1", date: "2026-11-04" }),
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
  ...(record.invoiceId
    ? [{ kind: "basedOn" as const, resource: "invoices", id: record.invoiceId }]
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

export const flowHandlers = [
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
  ...createTransitionHandlers({
    baseUrl: BASE,
    resource: "orders",
    db: orders.db,
    transitions: [{ id: "amend", from: ["cancelled"] }],
    amend: (order) => ({
      number: null,
      date: order.date,
      status: "draft",
      quoteId: order.quoteId,
    }),
  }),
  ...quotes.handlers,
  ...orders.handlers,
]
