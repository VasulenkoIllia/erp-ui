import type { MockInvite, MockUser } from "@/registry/lib/mocks"

import { COMPANIES } from "@/fixtures"

/**
 * Користувачі мок-сервера демо. Пароль — «demo»; код застосунку, SMS і email — 123456.
 * Олена — бухгалтер із другим кроком (застосунок, резервний код, SMS, ключ доступу);
 * Іван — менеджер без другого кроку; Марта — новенька з тимчасовим паролем.
 */
export const MOCK_USERS: MockUser[] = [
  {
    id: "u-olena",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    password: "demo",
    totpCode: "123456",
    roles: ["accountant"],
    permissions: ["invoices:*"],
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
    permissions: ["invoices:read"],
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
    permissions: ["invoices:read"],
    companies: COMPANIES.slice(0, 1),
    companyId: "zoriana",
    factors: [],
    mustChangePassword: true,
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
