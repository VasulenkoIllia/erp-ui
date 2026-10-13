import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"
import {
  createPlatformHandlers,
  createResourceHandlers,
} from "@/registry/lib/mocks"

import { invoiceSchema, makeInvoices } from "@/data/invoices"

import { ACCOUNT_SEEDS } from "./account"
import {
  AUDIT_SEEDS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  WEBHOOK_EVENTS,
  WEBHOOK_SEEDS,
} from "./admin"
import { currentBranding } from "./brands"
import { MOCK_INVITES, MOCK_USERS } from "./users"

/** Ресурси мок-сервера демо: їх показує панель розробника (журнал і вебхуки — теж зі сценаріями). */
export const MOCK_RESOURCES = ["invoices", "users", "audit", "webhooks"]

export const invoices = createResourceHandlers({
  resource: "invoices",
  schema: invoiceSchema,
  data: makeInvoices(240),
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

export const handlers = [
  ...createPlatformHandlers({
    users: MOCK_USERS,
    invites: MOCK_INVITES,
    branding: currentBranding,
    accountSeeds: ACCOUNT_SEEDS,
    roles: [
      { id: "accountant", name: { uk: "Бухгалтер", en: "Accountant" } },
      { id: "admin", name: { uk: "Адміністратор", en: "Administrator" } },
      { id: "sales", name: { uk: "Менеджер з продажу", en: "Sales manager" } },
    ],
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
  ...invoices.handlers,
  ...users.handlers,
]
