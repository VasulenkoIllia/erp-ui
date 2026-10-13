import {
  createPlatformHandlers,
  createResourceHandlers,
} from "@/registry/lib/mocks"

import { invoiceSchema, makeInvoices } from "@/data/invoices"

import { MOCK_USERS } from "./users"

/** Ресурси мок-сервера демо: їх показує панель розробника. */
export const MOCK_RESOURCES = ["invoices"]

export const invoices = createResourceHandlers({
  resource: "invoices",
  schema: invoiceSchema,
  data: makeInvoices(240),
  searchFields: ["number", "client"],
})

export const handlers = [
  ...createPlatformHandlers({ users: MOCK_USERS }),
  ...invoices.handlers,
]
