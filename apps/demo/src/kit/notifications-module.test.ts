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

import { createApiClient, isApiError } from "@/registry/lib/api"
import { MOCK_PUSH_PUBLIC_KEY } from "@/registry/lib/mock-push"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createInboxApi } from "@/registry/lib/notifications"
import { createNotificationsModule } from "@/registry/modules/N5-notifications"
import { NOTIFICATIONS } from "@/registry/modules/N5-notifications/contract"
import { createNotificationsFixtures } from "@/registry/modules/N5-notifications/fixtures"
import { createNotificationsMocks } from "@/registry/modules/N5-notifications/mocks"

/** Модуль N5 (ADR-0046): фабрика, фікстури, сім сценаріїв і підписка push. */
const BASE = "http://erp-notifications.test/api/v1"
const COMPANY = "c1"
const PERSON: MockUser = {
  id: "person",
  name: "person",
  email: "person@test.example",
  password: "demo-password",
  totpCode: "111111",
  roles: [],
  permissions: [],
  companies: [{ id: COMPANY, name: "ТОВ «Тест»" }],
  companyId: COMPANY,
  factors: [],
}
const SUBSCRIPTION = {
  endpoint: "https://push.example/device-1",
  expirationTime: null,
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
}
const SEEDED = 3
const UNREAD = 2

const server = setupServer(
  ...createPlatformHandlers({
    users: [PERSON],
    baseUrl: BASE,
    inboxSeeds: createNotificationsMocks({ users: [PERSON.id] }).seeds,
  }),
)
const inbox = createInboxApi(createApiClient({ baseUrl: BASE }))
const first = () => inbox.list("all", 1, 20)
const statusOf = async (request: Promise<unknown>) => {
  const failure: unknown = await request.catch((error: unknown) => error)
  return isApiError(failure) ? failure.status : undefined
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
beforeEach(() => {
  localStorage.clear()
  signInMock(PERSON.id)
})
afterEach(() => {
  resetScenarios()
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("модуль N5: фабрика", () => {
  it("адреси від basePath, адреса модуля веде на сповіщення, прав немає", () => {
    const module = createNotificationsModule({ basePath: "/account/" })
    expect(module.id).toBe("N5")
    expect(module.paths).toEqual({
      inbox: "/account/inbox",
      settings: "/account/notification-settings",
    })
    expect(module.routes.map((route) => route.path)).toEqual([
      "/account/inbox",
      "/account/notification-settings",
      "/account/",
    ])
    expect(module.nav.map((item) => item.href)).toEqual([
      "/account/inbox",
      "/account/notification-settings",
    ])
    expect(module.nav.every((item) => !("access" in item))).toBe(true)
    expect(module.resources.map((resource) => resource.name)).toEqual([
      NOTIFICATIONS,
    ])
  })

  it("без basePath окремої адреси модуля немає", () => {
    const module = createNotificationsModule()
    expect(module.routes.map((route) => route.path)).toEqual([
      "/inbox",
      "/notification-settings",
    ])
  })
})

describe("модуль N5: фікстури", () => {
  it("для кожної людини нові, важливі й прочитані, id не повторюються", () => {
    const seeds = createNotificationsFixtures({ users: ["a", "b"], now: 0 })
    const items = Object.values(seeds).flat()
    expect(Object.keys(seeds)).toEqual(["a", "b"])
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
    expect(seeds.a?.filter((item) => item.readAt === null)).toHaveLength(UNREAD)
  })

  it("без людей порожньо", () => {
    expect(createNotificationsFixtures()).toEqual({})
  })
})

describe("модуль N5: сценарії", () => {
  it("success: список і лічильник", async () => {
    const page = await first()
    expect(page).toMatchObject({ total: SEEDED, unread: UNREAD })
    await expect(inbox.unreadCount()).resolves.toBe(UNREAD)
  })

  it("empty: порожній список і нуль непрочитаних", async () => {
    setScenario("empty", NOTIFICATIONS)
    await expect(first()).resolves.toEqual({ data: [], total: 0, unread: 0 })
    await expect(inbox.unreadCount()).resolves.toBe(0)
  })

  it("error: 500 на всіх адресах", async () => {
    setScenario("error", NOTIFICATIONS)
    await expect(statusOf(first())).resolves.toBe(500)
    await expect(statusOf(inbox.unreadCount())).resolves.toBe(500)
    await expect(statusOf(inbox.push.publicKey())).resolves.toBe(500)
  })

  it("forbidden: 403", async () => {
    setScenario("forbidden", NOTIFICATIONS)
    await expect(statusOf(first())).resolves.toBe(403)
  })

  it("offline: мережевий збій, статус 0", async () => {
    setScenario("offline", NOTIFICATIONS)
    await expect(statusOf(first())).resolves.toBe(0)
  })

  it("conflict: читання працює, запис дає 409", async () => {
    setScenario("conflict", NOTIFICATIONS)
    const page = await first()
    const id = page.data[0]?.id ?? ""
    await expect(statusOf(inbox.markRead(id, true))).resolves.toBe(409)
    await expect(statusOf(inbox.markAllRead())).resolves.toBe(409)
    await expect(statusOf(inbox.push.save(SUBSCRIPTION))).resolves.toBe(409)
  })

  it("чужий ресурс не зачіпає сповіщення", async () => {
    setScenario("error", "contacts")
    await expect(first()).resolves.toMatchObject({ total: SEEDED })
  })

  it("без сесії: 401", async () => {
    signInMock(null)
    await expect(statusOf(inbox.push.publicKey())).resolves.toBe(401)
  })
})

describe("модуль N5: підписка push у моках", () => {
  it("відкритий ключ: точка P-256 у base64url", async () => {
    const key = await inbox.push.publicKey()
    expect(key).toBe(MOCK_PUSH_PUBLIC_KEY)
    expect(atob(key.replace(/-/g, "+").replace(/_/g, "/"))).toHaveLength(65)
  })

  it("перевірка лише для підписаної адреси, вилучення працює й двічі", async () => {
    const { endpoint } = SUBSCRIPTION
    await expect(statusOf(inbox.push.sendTest(endpoint))).resolves.toBe(404)
    await inbox.push.save(SUBSCRIPTION)
    await inbox.push.save(SUBSCRIPTION)
    await expect(inbox.push.sendTest(endpoint)).resolves.toBeUndefined()
    await inbox.push.remove(endpoint)
    await expect(inbox.push.remove(endpoint)).resolves.toBeUndefined()
    await expect(statusOf(inbox.push.sendTest(endpoint))).resolves.toBe(404)
  })

  it("адреса не https: 422", async () => {
    await expect(
      statusOf(inbox.push.save({ ...SUBSCRIPTION, endpoint: "http://x" })),
    ).resolves.toBe(422)
  })
})
