import type { LocalizedText } from "@/registry/lib/auth"
import type { MockNotificationEvent } from "@/registry/lib/mock-notifications"
import type {
  MockWebhookEventType,
  MockWebhookSeed,
} from "@/registry/lib/mock-webhooks"
import type { MockAuditEvent } from "@/registry/lib/mocks"

/**
 * Адміністрування демо (ADR-0013): початкові події журналу аудиту, вебхук із доставками, події
 * для вебхуків і сповіщень. Дати — відносно запуску демо.
 */
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString()

const OLENA = { type: "user", id: "u-olena", name: "Олена Коваль" } as const
const IVAN = { type: "user", id: "u-ivan", name: "Іван Петренко" } as const
const KYIV: LocalizedText = { uk: "Київ, Україна", en: "Kyiv, Ukraine" }
const LVIV: LocalizedText = { uk: "Львів, Україна", en: "Lviv, Ukraine" }
const MAC = { type: "desktop", browser: "Chrome", os: "macOS" } as const
const IPHONE = { type: "mobile", browser: "Safari", os: "iOS" } as const

export const AUDIT_SEEDS: MockAuditEvent[] = [
  {
    id: "aud-seed-6",
    at: ago(60 * 3),
    action: "invoices.updated",
    category: "data",
    actionLabel: { uk: "Рахунки: зміна", en: "Invoices: updated" },
    actor: OLENA,
    target: { type: "invoices", id: "inv-00007", name: "2026-0007" },
    ip: "192.0.2.24",
    location: KYIV,
    device: MAC,
    changes: [
      {
        field: "status",
        label: { uk: "Статус", en: "Status" },
        from: "sent",
        to: "paid",
      },
    ],
  },
  {
    id: "aud-seed-5",
    at: ago(60 * 26),
    action: "integrations.api_token_created",
    category: "integrations",
    actor: OLENA,
    target: { type: "api_tokens", id: "tok-1c", name: "Інтеграція з 1С" },
    ip: "192.0.2.24",
    location: KYIV,
    device: MAC,
    details: { scopes: "invoices:read, invoices:create" },
  },
  {
    id: "aud-seed-4",
    at: ago(60 * 24 * 2),
    action: "security.policy_updated",
    category: "security",
    actor: OLENA,
    ip: "192.0.2.24",
    location: KYIV,
    device: MAC,
    changes: [
      {
        field: "password.minLength",
        label: {
          uk: "Мінімальна довжина пароля",
          en: "Minimum password length",
        },
        from: 8,
        to: 10,
      },
      {
        field: "trustedDeviceDays",
        label: { uk: "Довірений пристрій, днів", en: "Trusted device, days" },
        from: 60,
        to: 30,
      },
    ],
  },
  {
    id: "aud-seed-3",
    at: ago(60 * 24 * 3),
    action: "auth.sign_in_failed",
    category: "auth",
    result: "failure",
    actor: IVAN,
    ip: "203.0.113.50",
    location: { uk: "Варшава, Польща", en: "Warsaw, Poland" },
    device: { type: "desktop", browser: "Firefox", os: "Windows" },
    details: { method: "password" },
  },
  {
    id: "aud-seed-2",
    at: ago(60 * 24 * 3 + 5),
    action: "auth.impersonation_started",
    category: "auth",
    actor: OLENA,
    target: { type: "users", id: "u-ivan", name: "Іван Петренко" },
    reason: "Звернення № 4518: не бачить рахунки компанії",
    ip: "192.0.2.24",
    location: KYIV,
    device: MAC,
  },
  {
    id: "aud-seed-1",
    at: ago(60 * 24 * 4),
    action: "auth.sign_in",
    category: "auth",
    actor: IVAN,
    ip: "198.51.100.17",
    location: LVIV,
    device: IPHONE,
    details: { method: "password" },
  },
]

const INVOICES: LocalizedText = { uk: "Рахунки", en: "Invoices" }
const USERS: LocalizedText = { uk: "Користувачі", en: "Users" }

export const WEBHOOK_EVENTS: Record<string, MockWebhookEventType> = {
  "invoices.created": {
    label: { uk: "Рахунок створено", en: "Invoice created" },
    group: INVOICES,
  },
  "invoices.updated": {
    label: { uk: "Рахунок змінено", en: "Invoice updated" },
    group: INVOICES,
  },
  "invoices.deleted": {
    label: { uk: "Рахунок видалено", en: "Invoice deleted" },
    group: INVOICES,
  },
  "users.blocked": {
    label: { uk: "Користувача заблоковано", en: "User blocked" },
    group: USERS,
  },
  "users.unblocked": {
    label: { uk: "Користувача розблоковано", en: "User unblocked" },
    group: USERS,
  },
}

export const WEBHOOK_SEEDS: MockWebhookSeed[] = [
  {
    id: "wh-1c",
    url: "https://1c.zoriana.example/hooks/erp",
    description: "Синхронізація рахунків з 1С",
    events: ["invoices.created", "invoices.updated"],
    active: true,
    createdAt: ago(60 * 24 * 30),
    deliveries: [
      {
        id: "dlv-seed-3",
        event: "invoices.updated",
        at: ago(60 * 3),
        status: "success",
        statusCode: 200,
        durationMs: 184,
        attempt: 1,
        response: { body: '{"ok":true}' },
      },
      {
        id: "dlv-seed-2",
        event: "invoices.created",
        at: ago(60 * 20),
        status: "success",
        statusCode: 200,
        durationMs: 242,
        attempt: 2,
        response: { body: '{"ok":true}' },
      },
      {
        id: "dlv-seed-1",
        event: "invoices.created",
        at: ago(60 * 21),
        status: "failed",
        statusCode: 503,
        durationMs: 10_000,
        attempt: 1,
        response: { body: "Service Unavailable" },
      },
    ],
  },
  {
    id: "wh-bank",
    url: "https://bank-sync.invalid/erp",
    description: "Платіжний сервіс (стара адреса)",
    events: ["invoices.updated"],
    active: false,
    createdAt: ago(60 * 24 * 90),
    deliveries: [
      {
        id: "dlv-seed-5",
        event: "invoices.updated",
        at: ago(60 * 24 * 6),
        status: "failed",
        attempt: 3,
        error: "getaddrinfo ENOTFOUND bank-sync.invalid",
      },
      {
        id: "dlv-seed-4",
        event: "invoices.updated",
        at: ago(60 * 24 * 6 + 30),
        status: "failed",
        attempt: 2,
        error: "getaddrinfo ENOTFOUND bank-sync.invalid",
      },
    ],
  },
]

const SECURITY: LocalizedText = { uk: "Безпека", en: "Security" }
const TASKS: LocalizedText = { uk: "Завдання й згадки", en: "Tasks & mentions" }
const TEAM: LocalizedText = { uk: "Команда", en: "Team" }

export const NOTIFICATION_CHANNELS = [
  { id: "in_app" },
  { id: "email" },
  { id: "push" },
  { id: "telegram" },
]

export const NOTIFICATION_EVENTS: MockNotificationEvent[] = [
  {
    id: "invoices.overdue",
    group: INVOICES,
    label: { uk: "Рахунок прострочено", en: "Invoice overdue" },
    description: {
      uk: "Клієнт не оплатив до терміну",
      en: "The client didn't pay on time",
    },
    channels: ["in_app", "email", "push", "telegram"],
    defaults: ["in_app", "email"],
  },
  {
    id: "invoices.paid",
    group: INVOICES,
    label: { uk: "Рахунок оплачено", en: "Invoice paid" },
    channels: ["in_app", "email", "push", "telegram"],
    defaults: ["in_app"],
  },
  {
    id: "tasks.assigned",
    group: TASKS,
    label: { uk: "Вам призначили завдання", en: "A task was assigned to you" },
    channels: ["in_app", "email", "push", "telegram"],
    defaults: ["in_app", "push"],
  },
  {
    id: "mentions",
    group: TASKS,
    label: { uk: "Вас згадали", en: "You were mentioned" },
    description: {
      uk: "@ у коментарі чи стрічці",
      en: "@ in a comment or feed",
    },
    channels: ["in_app", "email", "push"],
    defaults: ["in_app", "push"],
  },
  {
    id: "security.new_sign_in",
    group: SECURITY,
    label: { uk: "Вхід з нового пристрою", en: "Sign-in from a new device" },
    channels: ["in_app", "email", "push"],
    required: ["email"],
    defaults: ["email", "in_app"],
  },
  {
    id: "security.password_changed",
    group: SECURITY,
    label: { uk: "Пароль змінено", en: "Password changed" },
    channels: ["in_app", "email"],
    required: ["email"],
    defaults: ["email"],
  },
  {
    id: "security.recovery_requested",
    group: TEAM,
    label: {
      uk: "Колега просить відновити доступ",
      en: "A colleague asks to restore access",
    },
    description: {
      uk: "Для адміністраторів: втратив телефон і резервні коди",
      en: "For administrators: lost phone and backup codes",
    },
    channels: ["in_app", "email"],
    defaults: ["in_app", "email"],
  },
  {
    id: "team.invitation_accepted",
    group: TEAM,
    label: { uk: "Запрошення прийнято", en: "Invitation accepted" },
    channels: ["in_app", "email"],
    defaults: ["in_app"],
  },
]
