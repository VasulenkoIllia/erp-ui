import type { MockUser } from "@/registry/lib/mocks"

import { COMPANIES } from "@/fixtures"

/** Користувачі мок-сервера демо. Пароль — «demo»; код 2FA — 123456. */
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
    twoFactorEnabled: true,
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
    twoFactorEnabled: false,
  },
]
