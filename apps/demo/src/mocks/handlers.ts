import { addDays } from "@/registry/lib/dates"
import { partyFromCompany } from "@/registry/lib/document-parties"
import { extendSchema, withMockValues } from "@/registry/lib/extension-fields"
import {
  createPlatformHandlers,
  createResourceHandlers,
} from "@/registry/lib/mocks"
import { createBulkHandlers, createJobHandlers } from "@/registry/lib/mock-jobs"
import {
  createDocumentFlowHandlers,
  documentFlowSource,
} from "@/registry/lib/mock-document-flow"
import {
  createTransitionHandlers,
  documentDeniedActions,
} from "@/registry/lib/mock-transitions"
import { createListSettingsHandlers } from "@/registry/lib/mock-lists"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { createPeriodLockMocks } from "@/registry/lib/mock-period-lock"
import { timelineTargetMock } from "@/registry/lib/mock-timeline-store"
import { createSavedViewHandlers } from "@/registry/lib/mock-views"
import { RECORD_DENIAL_REASONS } from "@/registry/lib/record-access"
import { mergeTransitions } from "@/registry/lib/statuses"
import { createUsersFixtures } from "@/registry/modules/A2-users/fixtures"
import { createCompanyMocks } from "@/registry/modules/A1-company/mocks"
import {
  createImportExportMocks,
  importTargetMock,
} from "@/registry/modules/A4-import-export/mocks"
import { createAuditMocks } from "@/registry/modules/A5-audit/mocks"
import { createDictionariesMocks } from "@/registry/modules/A6-dictionaries/mocks"
import { createTimelineMocks } from "@/registry/modules/N1-timeline/mocks"
import { createNotificationsMocks } from "@/registry/modules/N5-notifications/mocks"
import { createUsersMocks } from "@/registry/modules/A2-users/mocks"
import { createContactsMocks } from "@/registry/modules/B1-contacts/mocks"
import {
  createSalesMocks,
  salesNumberingSeeds,
} from "@/registry/modules/B3-sales/mocks"
import type { SalesFixtureOptions } from "@/registry/modules/B3-sales/fixtures"
import {
  createInvoicesMocks,
  invoicePaymentSeed,
  invoicesNumberingSeeds,
  type InvoiceMockRates,
} from "@/registry/modules/K2-invoices/mocks"
import type { InvoiceFixtureOptions } from "@/registry/modules/K2-invoices/fixtures"
import {
  createPaymentsMocks,
  paymentsNumberingSeeds,
} from "@/registry/modules/K4-payments/mocks"

import {
  INVOICE_APPROVAL_LIMIT,
  INVOICE_COUNT,
  invoiceSchema,
  makeInvoiceLines,
  makeInvoices,
  type Invoice,
} from "@/data/invoices"
import {
  amendDocument,
  colleagueDocumentChange,
  DOCUMENT_TRANSITIONS,
  DOCUMENT_NUMBER_TEMPLATE,
  DOCUMENT_NUMBERS_ISSUED,
  DOCUMENT_SEED_YEAR,
  DOCUMENTS_LOCKED_THROUGH,
  documentSchema,
  makeDocuments,
  reverseDocument,
  type DemoDocument,
} from "@/data/documents"
import {
  organizationCompanyOf,
  organizationParty,
  responsibleOf,
} from "@/data/organizations"
import { MY_ACTIVITY_SEEDS, TIMELINE_SEEDS } from "@/data/timeline"
import { makeProducts, productSchema, type Product } from "@/data/products"
import { usersMockExtension } from "@/extensions/A2-users-fields"
import { companyMockExtension } from "@/extensions/A1-company-fields"
import { dictionariesMockExtension } from "@/extensions/A6-dictionaries-fields"
import { contactsMockExtension } from "@/extensions/B1-contacts-fields"
import { salesMockExtension } from "@/extensions/B3-sales-fields"
import { invoicesMockExtension } from "@/extensions/K2-sales-invoices-fields"
import { documentsExtension } from "@/extensions/documents"
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
// Товари сторінок «Імпорт і експорт» (ADR-0049) і цілі проекту в модулі A4 (ADR-0050).
const products = createResourceHandlers<Product>({
  resource: "products",
  schema: productSchema,
  data: makeProducts,
  searchFields: ["sku", "name"],
  label: { uk: "Товари", en: "Products" },
  unique: ["sku"],
})

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
  responsibleOf,
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

/** Модуль A1 «Компанія й валюти» (ADR-0043): валюти й курси кожної компанії демо. */
const company = createCompanyMocks({
  extension: companyMockExtension,
  companies: COMPANIES.map(({ id }) => id),
})

/** Модуль A5 «Аудит та історія» (ADR-0045): історія договору в журналі кожної компанії демо. */
const audit = createAuditMocks({ companies: COMPANIES.map(({ id }) => id) })

/** Модуль A6 «Довідники» (ADR-0047): значення довідників кожної компанії демо. */
const dictionaries = createDictionariesMocks({
  extension: dictionariesMockExtension,
  companies: COMPANIES.map(({ id }) => id),
})

/** Модуль A4 «Імпорт і експорт» (ADR-0050): цілі B1, A6 і своя ціль демо, історія кожної компанії. */
const importExport = createImportExportMocks({
  companies: COMPANIES.map(({ id }) => id),
  targets: [
    importTargetMock({ resource: "contacts", db: contacts.db.contacts }),
    importTargetMock({
      resource: "organizations",
      db: contacts.db.organizations,
    }),
    importTargetMock({ resource: "taxes", db: dictionaries.db.taxes }),
    importTargetMock({ resource: "units", db: dictionaries.db.units }),
    importTargetMock({ resource: "tags", db: dictionaries.db.tags }),
    importTargetMock({ resource: "reasons", db: dictionaries.db.reasons }),
    importTargetMock({ resource: "products", db: products.db }),
  ],
})

/**
 * Документи з оплатою, про яку картка ще не знає: колега провів її, а подія прийшла про оплату, не про
 * документ (сторінка «Документ», `@/mocks/colleague`).
 */
export const documentPayments = new Set<string>()

const HOUR_MS = 3_600_000

/**
 * Закриті періоди (PF13, ADR-0069): у першій компанії демо закрито по `DOCUMENTS_LOCKED_THROUGH`, тож
 * частина документів сторінки «Документ» лежить у закритому періоді. Виняток на дві години від запуску
 * демо має Іван Петренко.
 */
export const periodLock = createPeriodLockMocks({
  seeds: [
    {
      companyId: COMPANIES[0].id,
      lockedThrough: DOCUMENTS_LOCKED_THROUGH,
      exceptions: [
        {
          userId: "u-ivan",
          userName: "Іван Петренко",
          until: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
          reason: "Виправити дату акта за жовтень",
          grantedBy: { id: "u-olena", name: "Олена Коваль" },
          grantedAt: new Date().toISOString(),
        },
      ],
    },
  ],
})

/** Перший відкритий день компанії документа: туди лягають виправлена копія й сторно. */
const firstOpenDay = (document: DemoDocument) => {
  const lockedThrough = periodLock.lockedThrough(document.companyId ?? null)
  return lockedThrough ? addDays(lockedThrough, 1) : null
}

/** Граф «модуля» документів зі змінами розширення: дії переходів і позначки закритого періоду. */
const documentGraph = mergeTransitions(
  DOCUMENT_TRANSITIONS,
  documentsExtension.transitions,
)

/** Документи демо — облікові: закриття періоду їх стосується (рішення власника 09.11.2026). */
const documentLock = periodLock.forResource<DemoDocument>({
  resource: "documents",
  dateField: "date",
  actions: documentGraph.map((transition) => transition.id),
})

/**
 * Документи сторінки «Документ» (PF03, ADR-0057): позначки життєвого циклу кіта й правило демо —
 * оплачений документ не скасовують (`linked`), а сторнують. Закритий період (PF13) мітить решту дій.
 */
export const documents = createResourceHandlers<DemoDocument>({
  resource: "documents",
  schema: documentSchema,
  data: makeDocuments,
  searchFields: ["number", "client"],
  label: { uk: "Документи", en: "Documents" },
  fieldLabels: {
    number: { uk: "Номер", en: "Number" },
    client: { uk: "Клієнт", en: "Client" },
    dueDate: { uk: "Сплатити до", en: "Due date" },
    status: { uk: "Статус", en: "Status" },
    docStatus: { uk: "Стан документа", en: "Document state" },
  },
  deniedActions: (actor, document) => {
    // Причини життєвого циклу важливіші: закритий період додає лише дії, яких ще ніщо не забороняє.
    const denied = {
      ...documentLock.deniedActions(actor, document),
      ...documentDeniedActions(document),
    }
    if (document.status === "paid" || documentPayments.has(document.id))
      denied.cancel ??= RECORD_DENIAL_REASONS.linked
    return Object.keys(denied).length ? denied : undefined
  },
  validateWrite: documentLock.validateWrite,
  afterWrite: documentLock.afterWrite,
})

/**
 * Пропозиції й замовлення модуля B3 (ADR-0065, ADR-0067): у кожній компанії демо, клієнти — її
 * організації з модуля B1, одиниці й ПДВ — знімки довідників A6 компанії. Ті самі опції дають засів
 * серій `quotes` і `orders` для нумерації.
 */
const salesFixtures: SalesFixtureOptions = {
  companies: COMPANIES.map(({ id }) => id),
  clients: (companyId) =>
    contacts.db.organizations
      .all()
      .filter((organization) => organization.companyId === companyId)
      .map(({ id, name }) => ({ id, name })),
  dictionaries: (companyId) => {
    const unit = (id: string) => {
      const found = dictionaries.db.units
        .all()
        .find((entry) => entry.id === `${id}-${companyId ?? ""}`)
      return found ? { id: found.id, name: found.shortName } : null
    }
    const vat = dictionaries.db.taxes
      .all()
      .find((tax) => tax.id === `vat-20-${companyId ?? ""}`)
    const pieces = unit("pcs")
    const hours = unit("h")
    if (!vat || !pieces || !hours)
      throw new Error(`demo: dictionaries of ${String(companyId)} are missing`)
    return {
      pieces,
      hours,
      vat: {
        id: vat.id,
        name: vat.name,
        rate: vat.rate,
        included: vat.included,
      },
    }
  },
}
const salesSeeds = salesNumberingSeeds(salesFixtures)

/**
 * Курси компанії для документів у валюті (ADR-0071): курс на дату з таблиці курсів модуля A1. Профілі демо
 * базової валюти не задають — гривня, як у формі рахунку.
 */
const companyRates: InvoiceMockRates = {
  baseCurrency: (companyId) =>
    (companyId ? COMPANY_PROFILES[companyId]?.baseCurrency : null) ?? "UAH",
  rateOn: company.rateOn,
}

/**
 * Рахунки модуля K2 (ADR-0070): клієнти — організації компанії з реквізитами покупця, постачальник —
 * реквізити з профілю компанії демо, рядки — ті самі знімки довідників, що й у B3.
 */
const invoiceFixtures: InvoiceFixtureOptions = {
  companies: salesFixtures.companies ?? [],
  clients: (companyId) =>
    contacts.db.organizations
      .all()
      .filter((organization) => organization.companyId === companyId)
      .map((organization) => ({
        id: organization.id,
        name: organization.name,
        party: organizationParty(organization),
      })),
  supplier: (companyId) => {
    const profile = companyId ? COMPANY_PROFILES[companyId] : undefined
    return profile
      ? partyFromCompany({
          legalName: "",
          kind: "legal",
          ...profile,
          vatPayer: profile.vatPayer ?? false,
        })
      : {}
  },
  ...(salesFixtures.dictionaries
    ? { dictionaries: salesFixtures.dictionaries }
    : {}),
  rates: companyRates,
}
const invoiceSeeds = invoicesNumberingSeeds(invoiceFixtures)
/** Оплати модуля K4 (ADR-0073): засів — від рахунків засіву K2, курси — ті самі, що в рахунках. */
const paymentSeeds = paymentsNumberingSeeds({
  invoices: invoicePaymentSeed(invoiceFixtures),
  companies: invoiceFixtures.companies ?? [],
  rates: companyRates,
})

/**
 * Нумерація (PF03b, ADR-0058): серія документів у кожній компанії демо; засів першої компанії вже видав
 * номери проведеним і скасованим документам. Код філії для `{BRANCH}` — з профілів компаній демо.
 */
export const numbering = createNumberingMocks({
  series: [
    ...COMPANIES.map((company) => ({
      companyId: company.id,
      resource: "documents",
      template: DOCUMENT_NUMBER_TEMPLATE,
    })),
    ...salesSeeds.series,
    ...invoiceSeeds.series,
    ...paymentSeeds.series,
  ],
  counters: [
    {
      companyId: COMPANIES[0].id,
      resource: "documents",
      year: DOCUMENT_SEED_YEAR,
      value: DOCUMENT_NUMBERS_ISSUED,
    },
    ...salesSeeds.counters,
    ...invoiceSeeds.counters,
    ...paymentSeeds.counters,
  ],
  branchCode: (companyId, branchId) =>
    companyId
      ? COMPANY_PROFILES[companyId]?.branches?.find(
          (branch) => branch.id === branchId,
        )?.code
      : undefined,
})

const documentTransitions = createTransitionHandlers({
  resource: "documents",
  db: documents.db,
  transitions: documentGraph,
  amend: (document) => amendDocument(document, firstOpenDay(document)),
  reverse: (document) => reverseDocument(document, firstOpenDay(document)),
  conflictChange: colleagueDocumentChange,
  numbering: numbering.forResource({ resource: "documents", db: documents.db }),
  afterTransition: documentLock.afterTransition,
})

/**
 * Модуль K2 «Рахунки клієнтам» (ADR-0070): обліковий документ — закритий період демо його стосується.
 * Видалена чернетка рахунку з замовлення звільняє замовлення B3, а оплачене дають оплати K4 (моки B3 і K4 —
 * нижче, виклик — на запит).
 */
const salesInvoices = createInvoicesMocks({
  ...invoiceFixtures,
  numbering,
  extension: invoicesMockExtension,
  periodLock,
  releaseOrder: (removed) => {
    sales.releaseOrderInvoice(removed)
  },
  payments: { paidTotal: (invoiceId) => salesPayments.paidTotal(invoiceId) },
})

/** Модуль K4 «Оплати» (ADR-0073): оплати за рахунками K2, обліковий документ, курси компанії. */
const salesPayments = createPaymentsMocks({
  invoices: salesInvoices.forPayments,
  numbering,
  periodLock,
  rates: companyRates,
})

/**
 * Модуль B3 «Пропозиції й замовлення» (ADR-0065): поле, статус і дія розширення проекту; «Виставити
 * рахунок» із замовлення — рахунок модуля K2.
 */
const sales = createSalesMocks({
  ...salesFixtures,
  numbering,
  extension: salesMockExtension,
  invoices: {
    create: salesInvoices.fromOrder,
    hasActive: salesInvoices.hasActive,
  },
})

/**
 * Потік документів (UI13, ADR-0061) — один на застосунок: «Документ» демо з виправленими копіями й
 * сторно, пропозиції й замовлення B3 зі зв'язком «на підставі» (ADR-0067), рахунки K2 із замовлень і
 * оплати K4 на підставі рахунків.
 */
const documentFlow = createDocumentFlowHandlers({
  sources: [
    documentFlowSource({
      resource: "documents",
      db: documents.db,
      node: (document) => ({
        number: document.number,
        date: document.date,
        status: document.status,
        docStatus: document.docStatus,
        total: { amount: document.amount, currency: document.currency },
      }),
    }),
    ...sales.flowSources,
    ...salesInvoices.flowSources,
    salesPayments.flowSource,
  ],
})

/** Модуль N1 «Стрічка запису» (ADR-0054): рахунки, обидві картки B1 і пропозиції B3, «Мої справи» бухгалтера демо. */
const timeline = createTimelineMocks({
  targets: [
    timelineTargetMock({
      resource: "invoices",
      db: invoices.db,
      title: (invoice) => invoice.number,
    }),
    timelineTargetMock({
      resource: "contacts",
      db: contacts.db.contacts,
      title: (contact) => contact.name,
    }),
    timelineTargetMock({
      resource: "organizations",
      db: contacts.db.organizations,
      title: (organization) => organization.name,
    }),
    timelineTargetMock({
      resource: "quotes",
      db: sales.db.quotes,
      title: (quote) => quote.number ?? quote.clientName,
    }),
  ],
  seeds: { ...MY_ACTIVITY_SEEDS, ...TIMELINE_SEEDS },
})

/** Модуль N5 «Сповіщення» (ADR-0046): керівник відділу без своїх сповіщень у засіві команди. */
const notifications = createNotificationsMocks({ users: ["u-taras"] })

export const handlers = [
  ...createPlatformHandlers({
    users: [...MOCK_USERS, ...team.users],
    invites: MOCK_INVITES,
    branding: currentBranding,
    accountSeeds: { ...ACCOUNT_SEEDS, ...team.accountSeeds },
    roles: ROLES,
    permissionResources: PERMISSION_RESOURCES,
    inboxSeeds: { ...INBOX_SEEDS, ...notifications.seeds },
    companyProfiles: COMPANY_PROFILES,
    apiResources: {
      invoices: { uk: "Рахунки", en: "Invoices" },
      organizations: { uk: "Організації", en: "Organizations" },
      contacts: { uk: "Контакти", en: "Contacts" },
      segments: { uk: "Сегменти", en: "Segments" },
      users: { uk: "Користувачі", en: "Users" },
      currencies: { uk: "Валюти", en: "Currencies" },
      "exchange-rates": { uk: "Курси валют", en: "Exchange rates" },
      taxes: { uk: "Податки", en: "Taxes" },
      units: { uk: "Одиниці виміру", en: "Units" },
      "payment-terms": { uk: "Умови оплати", en: "Payment terms" },
      tags: { uk: "Теги", en: "Tags" },
      reasons: { uk: "Причини", en: "Reasons" },
      documents: { uk: "Документи", en: "Documents" },
      quotes: { uk: "Пропозиції", en: "Quotes" },
      orders: { uk: "Замовлення", en: "Orders" },
      "sales-invoices": { uk: "Рахунки клієнтам", en: "Customer invoices" },
      "sales-credit-notes": { uk: "Кредит-ноти", en: "Credit notes" },
      "sales-payments": { uk: "Оплати", en: "Payments" },
      "numbering-series": {
        uk: "Нумерація документів",
        en: "Document numbering",
      },
      "period-lock": { uk: "Закриті періоди", en: "Closed periods" },
      "period-lock-exceptions": {
        uk: "Винятки закритого періоду",
        en: "Closed period exceptions",
      },
    },
    auditSeeds: [...AUDIT_SEEDS, ...audit.seeds],
    webhookEvents: WEBHOOK_EVENTS,
    webhookSeeds: WEBHOOK_SEEDS,
    notificationChannels: NOTIFICATION_CHANNELS,
    notificationEvents: NOTIFICATION_EVENTS,
  }),
  ...createSavedViewHandlers(),
  ...createListSettingsHandlers(),
  ...createJobHandlers(),
  ...invoiceBulk,
  ...importExport.handlers,
  ...timeline.handlers,
  ...products.handlers,
  ...invoices.handlers,
  ...documentTransitions,
  ...documentFlow,
  ...documents.handlers,
  ...sales.handlers,
  ...salesInvoices.handlers,
  ...salesPayments.handlers,
  ...numbering.handlers,
  ...periodLock.handlers,
  ...contacts.handlers,
  ...users.handlers,
  ...company.handlers,
  ...dictionaries.handlers,
]
