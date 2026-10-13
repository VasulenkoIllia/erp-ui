import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"
import { z } from "zod"

import { auditActionLabel } from "@/registry/erp/audit-log"
import { createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { auditQuery, auditToCsv, type AuditEvent } from "@/registry/lib/audit"
import { createAuthProvider, isReauthRequired } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  createI18n,
  ERP_UI_NAMESPACE,
  type ErpUiTranslate,
} from "@/registry/lib/i18n"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { webhookUrlIssue } from "@/registry/lib/webhooks"

const BASE = "http://erp.test/api/v1"

const users: MockUser[] = [
  {
    id: "a1",
    name: "Марта Бойко",
    email: "marta@zoriana.example",
    password: "demo-password",
    totpCode: "111111",
    roles: ["admin"],
    permissions: ["users:*", "audit:read", "webhooks:*", "notes:*"],
    companies: [],
    companyId: null,
    factors: [],
  },
  {
    id: "u2",
    name: "Іван Петренко",
    email: "ivan@zoriana.example",
    password: "demo-password",
    totpCode: "654321",
    roles: ["sales"],
    permissions: ["notes:read"],
    companies: [],
    companyId: null,
    factors: ["totp"],
  },
]

const note = recordBaseSchema.extend({
  title: z.string().min(1),
  done: z.boolean(),
  companyId: z.string().nullable().optional(),
})
const notes = createResourceHandlers({
  resource: "notes",
  schema: note,
  data: [{ id: "n1", version: 1, title: "Перший", done: false }],
  searchFields: ["title"],
  baseUrl: BASE,
  label: { uk: "Нотатки", en: "Notes" },
  fieldLabels: { done: { uk: "Виконано", en: "Done" } },
})

const server = setupServer(
  ...createPlatformHandlers({
    users,
    baseUrl: BASE,
    accountSeeds: {
      u2: {
        sessions: [
          {
            id: "s-ivan",
            device: { type: "mobile", browser: "Chrome", os: "Android" },
            location: { uk: "Київ, Україна", en: "Kyiv, Ukraine" },
            createdAt: "2026-10-12T08:00:00.000Z",
            lastActiveAt: "2026-10-13T08:00:00.000Z",
          },
        ],
      },
    },
    webhookEvents: {
      "notes.updated": {
        label: { uk: "Нотатку змінено", en: "Note updated" },
        group: { uk: "Нотатки", en: "Notes" },
      },
      "notes.created": {
        label: { uk: "Нотатку створено", en: "Note created" },
      },
    },
    notificationEvents: [
      {
        id: "notes.mentioned",
        group: { uk: "Нотатки", en: "Notes" },
        label: { uk: "Вас згадали", en: "You were mentioned" },
        channels: ["in_app", "email", "push"],
        defaults: ["in_app"],
      },
      {
        id: "security.new_sign_in",
        group: { uk: "Безпека", en: "Security" },
        label: { uk: "Новий вхід", en: "New sign-in" },
        channels: ["in_app", "email"],
        required: ["email"],
        defaults: ["email"],
      },
    ],
  }),
  ...notes.handlers,
)

let language = "uk"
const client = createApiClient({ baseUrl: BASE, getLanguage: () => language })
let auth = createAuthProvider(client, { baseUrl: BASE })
const data = createDataProvider(client)

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  )

async function asAdmin() {
  signInMock("a1")
  await auth.reauthenticate({ password: "demo-password" })
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  signInMock(null)
  localStorage.clear()
  notes.db.reset()
  language = "uk"
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("журнал аудиту (ADR-0013)", () => {
  it("фільтр → параметри запиту за ADR-0002", () => {
    expect(
      auditQuery(
        {
          q: " Іван ",
          category: ["auth", "security"],
          targetType: "invoices",
          targetId: "42",
          from: "2026-10-01T00:00:00.000Z",
        },
        { page: 2, perPage: 20 },
      ).toString(),
    ).toBe(
      "q=%D0%86%D0%B2%D0%B0%D0%BD&category=auth&category=security&targetType=invoices&targetId=42&at_gte=2026-10-01T00%3A00%3A00.000Z&page=2&perPage=20",
    )
  })

  it("CSV: BOM, лапки й «було → стало»", () => {
    const csv = auditToCsv([
      {
        id: "1",
        at: "2026-10-13T08:00:00.000Z",
        action: "users.blocked",
        category: "users",
        actor: { type: "user", id: "a1", name: "Марта" },
        target: { type: "users", id: "u2", name: "Іван, менеджер" },
        reason: 'Звільнення "за угодою"',
        changes: [{ field: "status", from: "active", to: "blocked" }],
      },
    ])
    expect(csv.startsWith("﻿at,action,")).toBe(true)
    expect(csv).toContain('"Іван, менеджер"')
    expect(csv).toContain('"Звільнення ""за угодою"""')
    expect(csv).toContain("status: active → blocked")
  })

  it("CSV: формули з даних користувача не виконуються в таблиці", () => {
    const csv = auditToCsv([
      {
        id: "1",
        at: "2026-10-13T08:00:00.000Z",
        action: "users.updated",
        category: "users",
        actor: {
          type: "user",
          id: "a1",
          name: '=HYPERLINK("https://evil.example")',
        },
        target: { type: "users", id: "u2", name: "@SUM(A1)" },
        reason: "+380671234567",
      },
    ])
    expect(csv).toContain('"\'=HYPERLINK(""https://evil.example"")"')
    expect(csv).toContain(",'@SUM(A1)")
    expect(csv).toContain(",'+380671234567")
    expect(csv).not.toMatch(/,[=+@]/)
  })

  it("назва дії: проект, кіт, сервер, дієслово запису, код", () => {
    const t = createI18n({ language: "uk" }).getFixedT(
      "uk",
      ERP_UI_NAMESPACE,
    ) as unknown as ErpUiTranslate
    const base = { actionLabel: undefined }
    expect(auditActionLabel({ ...base, action: "auth.sign_in" }, t)).toBe(
      "Вхід",
    )
    expect(
      auditActionLabel({ ...base, action: "invoices.paid" }, t, {
        "invoices.paid": "Оплата рахунку",
      }),
    ).toBe("Оплата рахунку")
    expect(
      auditActionLabel(
        { action: "deals.won", actionLabel: "Угоду виграно" },
        t,
      ),
    ).toBe("Угоду виграно")
    expect(auditActionLabel({ ...base, action: "deals.updated" }, t)).toBe(
      "Зміна запису",
    )
    expect(auditActionLabel({ ...base, action: "deals.won" }, t)).toBe(
      "deals.won",
    )
  })

  it("без права — 403; входи й зміни записів потрапляють у журнал", async () => {
    await expect(
      auth.login({ email: "ivan@zoriana.example", password: "невірний" }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(auth.audit.getEvents({}, 1, 20)).rejects.toMatchObject({
      status: 401,
    })
    signInMock("u2")
    await expect(auth.audit.getEvents({}, 1, 20)).rejects.toMatchObject({
      status: 403,
    })

    signInMock("a1")
    await data.update("notes", {
      id: "n1",
      data: { done: true, version: 1 },
      previousData: { id: "n1", version: 1, title: "Перший", done: false },
    })
    const { data: events, total } = await auth.audit.getEvents({}, 1, 20)
    expect(total).toBe(2)
    const [change, failed] = events as [AuditEvent, AuditEvent]
    expect(change).toMatchObject({
      action: "notes.updated",
      category: "data",
      actionLabel: "Нотатки: зміна",
      actor: { id: "a1", name: "Марта Бойко" },
      target: { type: "notes", id: "n1", name: "Перший" },
      changes: [{ field: "done", label: "Виконано", from: false, to: true }],
      ip: "192.0.2.24",
      location: "Київ, Україна",
    })
    expect(failed).toMatchObject({
      action: "auth.sign_in_failed",
      result: "failure",
      actor: { name: "Іван Петренко" },
    })
  })

  it("фільтри: розділ, пошук, історія запису; експорт CSV", async () => {
    signInMock("a1")
    await data.update("notes", {
      id: "n1",
      data: { title: "Другий", version: 1 },
      previousData: { id: "n1", version: 1, title: "Перший", done: false },
    })
    await auth.login({
      email: "marta@zoriana.example",
      password: "demo-password",
    })
    expect(
      (await auth.audit.getEvents({ category: ["auth"] }, 1, 20)).data.map(
        (e) => e.action,
      ),
    ).toEqual(["auth.sign_in"])
    expect(
      (
        await auth.audit.getEvents(
          { targetType: "notes", targetId: "n1" },
          1,
          20,
        )
      ).total,
    ).toBe(1)
    expect((await auth.audit.getEvents({ q: "друг" }, 1, 20)).total).toBe(1)
    expect(
      (await auth.audit.getEvents({ q: "немає такого" }, 1, 20)).total,
    ).toBe(0)
    const csv = await (
      await auth.audit.exportEvents({ category: ["data"] })
    ).text()
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2)
    expect(csv).toContain("notes.updated")
  })
})

describe("вебхуки (ADR-0013)", () => {
  it("адреса: лише https, http — для localhost", () => {
    expect(webhookUrlIssue("")).toBe("required")
    expect(webhookUrlIssue("not a url")).toBe("invalid")
    expect(webhookUrlIssue("ftp://example.com")).toBe("invalid")
    expect(webhookUrlIssue("http://example.com/hook")).toBe("insecure")
    expect(webhookUrlIssue("http://localhost:3000/hook")).toBeNull()
    expect(webhookUrlIssue("https://example.com/hook")).toBeNull()
  })

  it("створення: підтвердження, перевірка полів, секрет один раз", async () => {
    signInMock("u2")
    await expect(auth.webhooks.list()).rejects.toMatchObject({ status: 403 })
    signInMock("a1")
    const { webhooks, events } = await auth.webhooks.list()
    expect(webhooks).toEqual([])
    expect(events).toEqual([
      { id: "notes.updated", label: "Нотатку змінено", group: "Нотатки" },
      { id: "notes.created", label: "Нотатку створено" },
    ])
    const input = {
      url: "https://hooks.example.com/erp",
      events: ["notes.updated"],
      active: true,
    }
    expect(isReauthRequired(await errorOf(auth.webhooks.create(input)))).toBe(
      true,
    )
    await auth.reauthenticate({ password: "demo-password" })
    await expect(
      auth.webhooks.create({
        ...input,
        url: "http://hooks.example.com",
        events: ["x"],
      }),
    ).rejects.toMatchObject({
      fieldErrors: { url: "insecure", events: "invalid" },
    })
    const { webhook, secret } = await auth.webhooks.create(input)
    expect(secret).toMatch(/^whsec_/)
    expect(webhook.secretPrefix).toBe(`${secret.slice(0, 10)}…`)
    expect(JSON.stringify(await auth.webhooks.list())).not.toContain(secret)
  })

  it("зміни записів → доставки; тестова подія; помилки адреси; повтор", async () => {
    await asAdmin()
    const ok = await auth.webhooks.create({
      url: "https://hooks.example.com/erp",
      events: ["notes.updated"],
      active: true,
    })
    const failing = await auth.webhooks.create({
      url: "https://hooks.example.com/fail",
      events: ["notes.updated"],
      active: true,
    })
    const paused = await auth.webhooks.create({
      url: "https://paused.example.com/erp",
      events: ["notes.updated"],
      active: false,
    })
    await data.update("notes", {
      id: "n1",
      data: { done: true, version: 1 },
      previousData: { id: "n1", version: 1, title: "Перший", done: false },
    })
    const delivered = await auth.webhooks.getDeliveries(ok.webhook.id, 1, 20)
    expect(delivered.data[0]).toMatchObject({
      event: "notes.updated",
      status: "success",
      statusCode: 200,
      attempt: 1,
    })
    const body = JSON.parse(delivered.data[0]?.request.body ?? "{}") as {
      type: string
      data: { id: string; done: boolean }
    }
    expect(body).toMatchObject({
      type: "notes.updated",
      data: { id: "n1", done: true },
    })
    expect(delivered.data[0]?.request.headers["X-Erp-Signature"]).toMatch(
      /^t=\d+,v1=[0-9a-f]+$/,
    )
    expect(
      (await auth.webhooks.getDeliveries(paused.webhook.id, 1, 20)).total,
    ).toBe(0)

    const failed = (
      await auth.webhooks.getDeliveries(failing.webhook.id, 1, 20)
    ).data[0]
    expect(failed).toMatchObject({ status: "failed", statusCode: 500 })
    const retry = await auth.webhooks.redeliver(failed?.id ?? "")
    expect(retry).toMatchObject({ attempt: 2, status: "failed" })
    expect(retry.request.headers["X-Erp-Delivery"]).toBe(
      failed?.request.headers["X-Erp-Delivery"],
    )
    const listed = (await auth.webhooks.list()).webhooks.find(
      (w) => w.id === failing.webhook.id,
    )
    expect(listed).toMatchObject({
      failures: 2,
      lastDelivery: { status: "failed", statusCode: 500 },
    })

    const ping = await auth.webhooks.test(ok.webhook.id)
    expect(ping).toMatchObject({ event: "ping", status: "success" })
  })

  it("новий секрет — після підтвердження; вимкнення й видалення — у журнал", async () => {
    await asAdmin()
    const { webhook, secret } = await auth.webhooks.create({
      url: "https://hooks.example.com/erp",
      events: ["notes.created"],
      active: true,
    })
    const rotated = await auth.webhooks.rotateSecret(webhook.id)
    expect(rotated).not.toBe(secret)
    await auth.webhooks.update(webhook.id, { active: false })
    await auth.webhooks.remove(webhook.id)
    expect((await auth.webhooks.list()).webhooks).toEqual([])
    const actions = (
      await auth.audit.getEvents({ category: ["integrations"] }, 1, 20)
    ).data.map((e) => e.action)
    expect(actions).toEqual([
      "integrations.webhook_deleted",
      "integrations.webhook_updated",
      "integrations.webhook_secret_rotated",
      "integrations.webhook_created",
    ])
  })
})

describe("сповіщення (ADR-0013)", () => {
  it("типові канали; зміни зберігаються; обов'язкові не вимкнути", async () => {
    signInMock("u2")
    const settings = await auth.account.getNotificationSettings()
    expect(settings.channels.map((c) => c.id)).toEqual([
      "in_app",
      "email",
      "push",
    ])
    expect(settings.events[1]).toMatchObject({
      group: "Безпека",
      label: "Новий вхід",
      required: ["email"],
    })
    expect(settings.settings).toEqual({
      "notes.mentioned": ["in_app"],
      "security.new_sign_in": ["email"],
    })
    expect(settings.quietHours).toEqual({
      enabled: false,
      from: "22:00",
      to: "08:00",
    })

    await expect(
      auth.account.updateNotificationSettings({
        settings: {
          "security.new_sign_in": ["in_app"],
          "notes.mentioned": ["sms"],
        },
        quietHours: { enabled: true, from: "25:00", to: "08:00" },
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: {
        "settings.security.new_sign_in": "required",
        "settings.notes.mentioned": "invalid",
        quietHours: "invalid",
      },
    })

    const saved = await auth.account.updateNotificationSettings({
      settings: { "notes.mentioned": ["in_app", "push"] },
      quietHours: { enabled: true, from: "22:30", to: "07:00" },
    })
    expect(saved.settings["notes.mentioned"]).toEqual(["in_app", "push"])
    language = "en"
    const again = await auth.account.getNotificationSettings()
    expect(again.events[0]?.label).toBe("You were mentioned")
    expect(again.quietHours).toEqual({
      enabled: true,
      from: "22:30",
      to: "07:00",
    })
  })
})

describe("доступ користувачів (ADR-0013)", () => {
  it("стан, сесії всіх, завершення сесії й вихід на всіх пристроях", async () => {
    signInMock("u2")
    await expect(auth.admin.getUserAccess("u2")).rejects.toMatchObject({
      status: 403,
    })
    signInMock("a1")
    const access = await auth.admin.getUserAccess("u2")
    expect(access).toMatchObject({
      status: "active",
      blocked: null,
      factors: ["totp"],
      sessions: [
        {
          id: "s-ivan",
          current: false,
          location: "Київ, Україна",
          user: { id: "u2", name: "Іван Петренко" },
        },
      ],
    })
    const all = await auth.admin.getSessions("", 1, 20)
    expect(all.data.map((s) => [s.user.id, s.current])).toEqual([
      ["a1", true],
      ["u2", false],
    ])
    expect((await auth.admin.getSessions("іван", 1, 20)).total).toBe(1)
    await expect(
      auth.admin.endSession(all.data[0]?.id ?? ""),
    ).rejects.toMatchObject({ status: 409 })
    await auth.admin.endSession("s-ivan")
    expect((await auth.admin.getUserAccess("u2")).sessions).toEqual([])
    await auth.admin.signOutUser("u2")
    expect(
      (await auth.audit.getEvents({ category: ["users"] }, 1, 20)).data.map(
        (e) => e.action,
      ),
    ).toEqual(["users.signed_out", "users.session_ended"])
  })

  it("блокування: підтвердження, причина, не себе; вхід — 403; розблокування", async () => {
    signInMock("a1")
    expect(
      isReauthRequired(await errorOf(auth.admin.blockUser("u2", "Звільнення"))),
    ).toBe(true)
    await auth.reauthenticate({ password: "demo-password" })
    await expect(auth.admin.blockUser("u2", " ")).rejects.toMatchObject({
      fieldErrors: { reason: "required" },
    })
    await expect(auth.admin.blockUser("a1", "Сам")).rejects.toMatchObject({
      fieldErrors: { userId: "invalid" },
    })
    await auth.admin.blockUser("u2", "Звільнення 13.10.2026")
    expect(await auth.admin.getUserAccess("u2")).toMatchObject({
      status: "blocked",
      blocked: { by: "Марта Бойко", reason: "Звільнення 13.10.2026" },
      sessions: [],
    })

    signInMock(null)
    await expect(
      auth.login({ email: "ivan@zoriana.example", password: "demo-password" }),
    ).rejects.toMatchObject({ status: 403, code: "account_blocked" })

    await asAdmin()
    await auth.admin.unblockUser("u2")
    expect((await auth.admin.getUserAccess("u2")).status).toBe("active")
    const blockedEvent = (
      await auth.audit.getEvents({ action: "users.blocked" }, 1, 20)
    ).data[0]
    expect(blockedEvent).toMatchObject({
      reason: "Звільнення 13.10.2026",
      target: { id: "u2", name: "Іван Петренко" },
    })
    expect(
      (await auth.audit.getEvents({ action: "auth.sign_in_blocked" }, 1, 20))
        .total,
    ).toBe(1)
  })
})
