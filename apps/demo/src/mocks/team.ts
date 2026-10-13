import type { LocalizedText } from "@/registry/lib/auth"
import type { MockCompanyProfile } from "@/registry/lib/mock-company"
import type { MockInboxItem } from "@/registry/lib/mock-inbox"
import type { MockPermissionResource, MockRole } from "@/registry/lib/mock-team"

/**
 * Команда й компанія демо (ADR-0014): ролі з правами, каталог прав для матриці, сповіщення в
 * застосунку й реквізити компаній. Дати — відносно запуску демо.
 */
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString()

export const ROLES: MockRole[] = [
  {
    id: "accountant",
    name: { uk: "Бухгалтер", en: "Accountant" },
    description: {
      uk: "Рахунки й платежі: усе, крім налаштувань компанії",
      en: "Invoices and payments: everything but company settings",
    },
    permissions: ["invoices:*"],
  },
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    description: {
      uk: "Користувачі, ролі, безпека, інтеграції й реквізити",
      en: "Users, roles, security, integrations and company details",
    },
    system: true,
    permissions: [
      "users:*",
      "roles:*",
      "security:*",
      "audit:read",
      "webhooks:*",
      "company:*",
    ],
  },
  {
    id: "sales",
    name: { uk: "Менеджер з продажу", en: "Sales manager" },
    description: {
      uk: "Бачить рахунки своїх клієнтів",
      en: "Sees their clients' invoices",
    },
    permissions: ["invoices:read"],
  },
  {
    id: "auditor",
    name: { uk: "Аудитор", en: "Auditor" },
    description: {
      uk: "Лише перегляд рахунків і журналу аудиту",
      en: "Read-only invoices and audit log",
    },
    permissions: ["invoices:read", "audit:read"],
  },
]

const SALES: LocalizedText = { uk: "Продажі", en: "Sales" }
const ADMIN: LocalizedText = { uk: "Адміністрування", en: "Administration" }

export const PERMISSION_RESOURCES: Record<string, MockPermissionResource> = {
  invoices: {
    label: { uk: "Рахунки", en: "Invoices" },
    group: SALES,
    actions: ["read", "create", "update", "delete", "export", "approve"],
  },
  users: {
    label: { uk: "Користувачі", en: "Users" },
    group: ADMIN,
    actions: ["read", "create", "update", "delete", "impersonate"],
  },
  roles: {
    label: { uk: "Ролі й права", en: "Roles & permissions" },
    group: ADMIN,
    actions: ["read", "update"],
  },
  security: {
    label: { uk: "Політика безпеки", en: "Security policy" },
    group: ADMIN,
    actions: ["read", "update"],
  },
  audit: {
    label: { uk: "Журнал аудиту", en: "Audit log" },
    group: ADMIN,
    actions: ["read"],
  },
  webhooks: {
    label: { uk: "Інтеграції", en: "Integrations" },
    group: ADMIN,
    actions: ["read", "create", "update", "delete"],
  },
  company: {
    label: { uk: "Реквізити компанії", en: "Company details" },
    group: ADMIN,
    actions: ["read", "update"],
  },
}

export const INBOX_SEEDS: Record<string, MockInboxItem[]> = {
  "u-olena": [
    {
      id: "ntf-seed-1",
      type: "invoices.overdue",
      title: {
        uk: "Рахунок 2026-0012 прострочено",
        en: "Invoice 2026-0012 is overdue",
      },
      body: {
        uk: "ТОВ «Північний вітер» не оплатив 18 400,00 ₴ до 10 жовтня.",
        en: "Pivnichnyi Viter LLC didn't pay ₴18,400.00 by October 10.",
      },
      createdAt: ago(12),
      readAt: null,
      severity: "warning",
      link: "/data",
    },
    {
      id: "ntf-seed-2",
      type: "mentions",
      title: {
        uk: "Іван Петренко згадав вас у рахунку 2026-0007",
        en: "Ivan Petrenko mentioned you on invoice 2026-0007",
      },
      body: {
        uk: "«@Олена, перевірте, будь ласка, реквізити клієнта».",
        en: "“@Olena, please check the client's details.”",
      },
      createdAt: ago(55),
      readAt: null,
      actor: { name: "Іван Петренко" },
      link: "/data",
    },
    {
      id: "ntf-seed-3",
      type: "tasks.assigned",
      title: {
        uk: "Вам призначили завдання: звірка з контрагентом",
        en: "Task assigned to you: reconciliation with a counterparty",
      },
      createdAt: ago(60 * 3),
      readAt: null,
      actor: { name: "Іван Петренко" },
    },
    {
      id: "ntf-seed-4",
      type: "invoices.paid",
      title: {
        uk: "Рахунок 2026-0009 оплачено",
        en: "Invoice 2026-0009 is paid",
      },
      body: { uk: "Надійшло 7 250,00 ₴.", en: "₴7,250.00 received." },
      createdAt: ago(60 * 20),
      readAt: ago(60 * 19),
      severity: "success",
      link: "/data",
    },
    {
      id: "ntf-seed-5",
      type: "security.new_sign_in",
      title: {
        uk: "Вхід з нового пристрою: Safari, iOS",
        en: "Sign-in from a new device: Safari, iOS",
      },
      body: { uk: "Львів, Україна", en: "Lviv, Ukraine" },
      createdAt: ago(60 * 24 * 2),
      readAt: ago(60 * 24 * 2 - 5),
      severity: "info",
      link: "/settings/security",
    },
    {
      id: "ntf-seed-6",
      type: "webhooks.failed",
      title: {
        uk: "Вебхук не доставлено: bank-sync.invalid",
        en: "Webhook not delivered: bank-sync.invalid",
      },
      body: {
        uk: "Три спроби поспіль завершилися помилкою.",
        en: "Three attempts in a row failed.",
      },
      createdAt: ago(60 * 24 * 6),
      readAt: ago(60 * 24 * 5),
      severity: "error",
      link: "/settings/integrations",
    },
  ],
  "u-ivan": [
    {
      id: "ntf-seed-ivan-1",
      type: "tasks.assigned",
      title: {
        uk: "Вам призначили завдання: зателефонувати клієнту",
        en: "Task assigned to you: call the client",
      },
      createdAt: ago(30),
      readAt: null,
      actor: { name: "Олена Коваль" },
    },
  ],
}

export const COMPANY_PROFILES: Record<string, MockCompanyProfile> = {
  zoriana: {
    name: "Зоряна логістика",
    legalName: "ТОВ «Зоряна логістика»",
    kind: "legal",
    edrpou: "32855961",
    vatPayer: true,
    vatIpn: "143605704021",
    iban: "UA213223130000026007233566001",
    bankName: "АТ «Демо Банк»",
    address: "01001, м. Київ, вул. Зоряна, 1, офіс 12",
    phone: "+380441234567",
    email: "office@zoriana.example",
    website: "zoriana.example",
    director: { name: "Олена Коваль", position: "Директор" },
    accountant: "Олена Коваль",
    branches: [
      {
        id: "br-lviv",
        name: "Львівська філія",
        code: "001",
        address: "79000, м. Львів, вул. Сонячна, 5",
        phone: "+380322123456",
      },
    ],
  },
  kovalenko: {
    name: "ФОП Коваленко",
    legalName: "ФОП Коваленко Олена Вікторівна",
    kind: "fop",
    rnokpp: "1759013776",
    vatPayer: false,
  },
}
