import { extendSchema, withMockValues } from "@/registry/lib/extension-fields"
import {
  createPlatformHandlers,
  createResourceHandlers,
} from "@/registry/lib/mocks"
import { createBulkHandlers, createJobHandlers } from "@/registry/lib/mock-jobs"
import { createListSettingsHandlers } from "@/registry/lib/mock-lists"
import { createSavedViewHandlers } from "@/registry/lib/mock-views"
import { createUsersFixtures } from "@/registry/modules/A2-users/fixtures"
import { createUsersMocks } from "@/registry/modules/A2-users/mocks"
import { createContactsMocks } from "@/registry/modules/B1-contacts/mocks"

import {
  INVOICE_APPROVAL_LIMIT,
  INVOICE_COUNT,
  invoiceSchema,
  makeInvoiceLines,
  makeInvoices,
  type Invoice,
} from "@/data/invoices"
import { organizationCompanyOf } from "@/data/organizations"
import { usersMockExtension } from "@/extensions/A2-users-fields"
import { contactsMockExtension } from "@/extensions/B1-contacts-fields"
import { COMPANIES } from "@/fixtures"
import { invoiceFields } from "@/extensions/K2-invoices-fields"

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

// Рахунки з полями розширення проекту (ADR-0020): схема їх пропускає, фікстури їх мають.
export const invoices = createResourceHandlers({
  resource: "invoices",
  schema: extendSchema(invoiceSchema, invoiceFields),
  // 12 500 записів створюються при першому запиті, а не під час старту моків.
  data: () => withMockValues(makeInvoices(INVOICE_COUNT), invoiceFields),
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

/**
 * Модуль B1 «Контакти й компанії» (ADR-0025): організації, контакти й сегменти з полями й статусом
 * розширення проекту. Організації — і довідник сторінок «Вибір і реквізити» та «Організації».
 */
const contacts = createContactsMocks({
  extension: contactsMockExtension,
  companyOf: organizationCompanyOf,
})

/**
 * Модуль A2 «Користувачі й ролі» (ADR-0031): ресурс `users` — живий вигляд користувачів мок-сервера
 * входу (зміни ролей, блокування й нові колеги з запрошень видно одразу) з полем розширення
 * «Відділ». Колеги з фікстур модуля — у першій компанії демо, щоб список мав вкладки й сторінки.
 */
const team = createUsersFixtures({
  company: COMPANIES[0],
  roles: ["sales", "accountant", "sales", "auditor"],
  emailDomain: "zoriana.example",
})
const users = createUsersMocks({ extension: usersMockExtension })

export const handlers = [
  ...createPlatformHandlers({
    users: [...MOCK_USERS, ...team.users],
    invites: MOCK_INVITES,
    branding: currentBranding,
    accountSeeds: { ...ACCOUNT_SEEDS, ...team.accountSeeds },
    roles: ROLES,
    permissionResources: PERMISSION_RESOURCES,
    inboxSeeds: INBOX_SEEDS,
    companyProfiles: COMPANY_PROFILES,
    apiResources: {
      invoices: { uk: "Рахунки", en: "Invoices" },
      organizations: { uk: "Організації", en: "Organizations" },
      contacts: { uk: "Контакти", en: "Contacts" },
      segments: { uk: "Сегменти", en: "Segments" },
      users: { uk: "Користувачі", en: "Users" },
    },
    auditSeeds: AUDIT_SEEDS,
    webhookEvents: WEBHOOK_EVENTS,
    webhookSeeds: WEBHOOK_SEEDS,
    notificationChannels: NOTIFICATION_CHANNELS,
    notificationEvents: NOTIFICATION_EVENTS,
  }),
  ...createSavedViewHandlers(),
  ...createListSettingsHandlers(),
  ...createJobHandlers(),
  ...invoiceBulk,
  ...invoices.handlers,
  ...contacts.handlers,
  ...users.handlers,
]
