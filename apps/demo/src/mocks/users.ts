import type { MockInvite, MockUser } from "@/registry/lib/mocks"

import { COMPANIES } from "@/fixtures"

/**
 * Користувачі мок-сервера демо. Пароль — «demo»; код застосунку, SMS і email — 123456.
 * Олена — бухгалтер і адміністратор («Увійти як…») з другим кроком (застосунок, резервний код,
 * SMS, ключ доступу); Іван — менеджер без другого кроку; Марта — новенька з тимчасовим паролем;
 * Тарас — керівник відділу: бачить людей і ролі, але нічого не змінює й не бачить історії (A2b2a);
 * Андрій — адміністратор платформи поза компаніями: змінює політику безпеки застосунку (ADR-0036).
 */
export const MOCK_USERS: MockUser[] = [
  {
    id: "u-olena",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    password: "demo",
    totpCode: "123456",
    roles: ["accountant", "admin"],
    permissions: [
      "invoices:*",
      "organizations:*",
      "users:*",
      "security:*",
      "audit:read",
      "webhooks:*",
      "roles:*",
      "company:*",
    ],
    companies: COMPANIES,
    companyId: "zoriana",
    phone: "+380671234545",
    factors: ["totp", "backup_code", "sms", "passkey"],
    backupCodes: ["ab12cd34", "ef56gh78"],
  },
  {
    id: "u-ivan",
    name: "Іван Петренко",
    email: "ivan@zoriana.example",
    password: "demo",
    totpCode: "123456",
    roles: ["sales"],
    permissions: ["invoices:read", "organizations:read"],
    companies: COMPANIES.slice(0, 1),
    companyId: "zoriana",
    phone: "+380501112233",
    factors: [],
  },
  {
    id: "u-marta",
    name: "Марта Шевчук",
    email: "marta@zoriana.example",
    password: "temp-password",
    totpCode: "123456",
    roles: ["sales"],
    permissions: ["invoices:read", "organizations:read"],
    companies: COMPANIES.slice(0, 1),
    companyId: "zoriana",
    factors: [],
    mustChangePassword: true,
  },
  {
    id: "u-taras",
    name: "Тарас Мельник",
    email: "taras@zoriana.example",
    password: "demo",
    totpCode: "123456",
    roles: ["lead"],
    // Права беруться з ролі «Керівник відділу» (`mocks/team.ts`): `users:read` без `users:update`
    // і `audit:read`.
    permissions: ["users:read", "roles:read"],
    companies: COMPANIES.slice(0, 1),
    companyId: "zoriana",
    factors: [],
  },
  {
    id: "u-andriy",
    name: "Андрій Бондар",
    email: "andriy@platform.example",
    password: "demo",
    totpCode: "123456",
    // Позначка облікового запису, а не роль компанії: без компанії бачить лише спільне.
    isPlatformAdmin: true,
    roles: ["owner"],
    permissions: ["*"],
    companies: [],
    companyId: null,
    factors: [],
  },
]

/** Запрошення в демо: посилання `#/login/invite?token=demo-invite`. */
export const MOCK_INVITES: MockInvite[] = [
  {
    token: "demo-invite",
    email: "new.colleague@zoriana.example",
    companyName: "ТОВ «Зоряна логістика»",
    invitedBy: "Олена Коваль",
    user: {
      roles: ["sales"],
      permissions: ["invoices:read"],
      companies: COMPANIES.slice(0, 1),
      companyId: "zoriana",
    },
  },
]
