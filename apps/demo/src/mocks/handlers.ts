import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"
import {
  createPlatformHandlers,
  createResourceHandlers,
  subscribeMockEvents,
} from "@/registry/lib/mocks"
import { createBulkHandlers, createJobHandlers } from "@/registry/lib/mock-jobs"
import { createSavedViewHandlers } from "@/registry/lib/mock-views"

import {
  INVOICE_APPROVAL_LIMIT,
  INVOICE_COUNT,
  invoiceSchema,
  makeInvoiceLines,
  makeInvoices,
  type Invoice,
} from "@/data/invoices"

import { ACCOUNT_SEEDS } from "./account"
import {
  AUDIT_SEEDS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  WEBHOOK_EVENTS,
  WEBHOOK_SEEDS,
} from "./admin"
import { currentBranding } from "./brands"
import {
  COMPANY_PROFILES,
  INBOX_SEEDS,
  PERMISSION_RESOURCES,
  ROLES,
} from "./team"
import { MOCK_INVITES, MOCK_USERS } from "./users"

export const invoices = createResourceHandlers({
  resource: "invoices",
  schema: invoiceSchema,
  // 12 500 записів створюються при першому запиті, а не під час старту моків.
  data: () => makeInvoices(INVOICE_COUNT),
  searchFields: ["number", "client"],
  label: { uk: "Рахунки", en: "Invoices" },
  fieldLabels: {
    number: { uk: "Номер", en: "Number" },
    client: { uk: "Клієнт", en: "Client" },
    amount: { uk: "Сума, коп.", en: "Amount, minor units" },
    currency: { uk: "Валюта", en: "Currency" },
    status: { uk: "Статус", en: "Status" },
    date: { uk: "Дата", en: "Date" },
    dueDate: { uk: "Сплатити до", en: "Due date" },
  },
  // Картка рахунку: рядки документа з поточної суми (ADR-0019).
  detail: (invoice) => ({ lines: makeInvoiceLines(invoice) }),
})

/** Рахунки, які «саме редагує інший користувач» — один раз: повтор погодження проходить. */
const lockedOnce = new Set<string>()
/**
 * Кожен 24-й рахунок за номером зайнятий при першій спробі погодження. Не кратне 5: кожен п'ятий
 * рахунок належить другій компанії (data/invoices).
 */
const LOCKED_EVERY = 24

/**
 * Масове погодження (ADR-0018): лише чернетки; сума в гривнях понад ліміт — до директора;
 * кожен 24-й рахунок зайнятий іншим користувачем — повтор пройде.
 */
const invoiceBulk = createBulkHandlers<Invoice>({
  resource: "invoices",
  db: invoices.db,
  titleField: "number",
  actions: {
    approve: {
      apply: (invoice) => {
        if (invoice.status !== "draft")
          return { code: "invalid_status", message: "Only drafts" }
        if (
          invoice.currency === "UAH" &&
          invoice.amount > INVOICE_APPROVAL_LIMIT
        )
          return { code: "approval_limit", message: "Over approval limit" }
        if (
          Number(invoice.id.replace(/\D/g, "")) % LOCKED_EVERY === 0 &&
          !lockedOnce.has(invoice.id)
        ) {
          lockedOnce.add(invoice.id)
          return {
            code: "locked",
            message: "Edited by someone",
            retryable: true,
          }
        }
        return { changes: { status: "approved" } }
      },
    },
  },
})

/** Користувачі компанії для сторінки «Користувачі» (без паролів і кодів). */
export const userRecordSchema = recordBaseSchema.extend({
  name: z.string(),
  email: z.string(),
  roles: z.array(z.string()),
  companyId: z.string().nullable(),
})
export type UserRecord = z.infer<typeof userRecordSchema>

export const users = createResourceHandlers({
  resource: "users",
  schema: userRecordSchema,
  data: MOCK_USERS.map((user) => ({
    id: user.id,
    version: 1,
    name: user.name,
    email: user.email,
    roles: user.roles,
    companyId: user.companyId,
  })),
  searchFields: ["name", "email"],
  label: { uk: "Користувачі", en: "Users" },
})

// Ролі змінив адміністратор, колега прийняв запрошення — список користувачів теж змінюється.
subscribeMockEvents((event) => {
  const data = event.data as Partial<UserRecord>
  if (event.type === "users.roles_changed" && data.id && data.roles) {
    const record = users.db.all().find((user) => user.id === data.id)
    if (record) {
      record.roles = data.roles
      record.version += 1
    }
  }
  if (event.type === "users.joined" && data.id && data.name && data.email)
    users.db.all().push({
      id: data.id,
      version: 1,
      name: data.name,
      email: data.email,
      roles: data.roles ?? [],
      companyId: data.companyId ?? null,
    })
})

export const handlers = [
  ...createPlatformHandlers({
    users: MOCK_USERS,
    invites: MOCK_INVITES,
    branding: currentBranding,
    accountSeeds: ACCOUNT_SEEDS,
    roles: ROLES,
    permissionResources: PERMISSION_RESOURCES,
    inboxSeeds: INBOX_SEEDS,
    companyProfiles: COMPANY_PROFILES,
    apiResources: {
      invoices: { uk: "Рахунки", en: "Invoices" },
      users: { uk: "Користувачі", en: "Users" },
    },
    auditSeeds: AUDIT_SEEDS,
    webhookEvents: WEBHOOK_EVENTS,
    webhookSeeds: WEBHOOK_SEEDS,
    notificationChannels: NOTIFICATION_CHANNELS,
    notificationEvents: NOTIFICATION_EVENTS,
  }),
  ...createSavedViewHandlers(),
  ...createJobHandlers(),
  ...invoiceBulk,
  ...invoices.handlers,
  ...users.handlers,
]
