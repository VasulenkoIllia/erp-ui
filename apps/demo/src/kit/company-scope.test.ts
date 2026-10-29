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

import { createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { createAuthProvider, isReauthRequired } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { createBulkHandlers, createJobHandlers } from "@/registry/lib/mock-jobs"
import { addMockUser, setMockUsers } from "@/registry/lib/mock-server"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Крок A2c1: моки на правах компанії запиту — ресурси, масові дії, журнал, вебхуки, налаштування
 * компанії, токени API; журнал у межах компанії; політика безпеки — одна на застосунок, змінює лише
 * адміністратор платформи — позначка облікового запису, а не `*` у ролі компанії (ADR-0036).
 */
const BASE = "http://erp.test/api/v1"
const USER_ROLES_KEY = "erp-ui:mock-user-roles"
const SESSION_KEY = "erp-ui:mock-session"

const COMPANIES = [
  { id: "c1", name: "ТОВ «Тест»" },
  { id: "c2", name: "ФОП Тестенко" },
]

const person = (
  id: string,
  roles: string[],
  companies: MockUser["companies"],
): MockUser => ({
  id,
  name: id,
  email: `${id}@zoriana.example`,
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies,
  companyId: companies[0]?.id ?? null,
  factors: [],
})

const users: MockUser[] = [
  // Адміністратор обох компаній — але не платформи.
  person("a1", ["admin"], COMPANIES),
  // Адміністратор лише другої компанії.
  person("a2", ["admin"], COMPANIES.slice(1)),
  // В обох компаніях: ролі за компаніями засіває тест.
  person("u3", ["sales"], COMPANIES),
  // Лише в другій компанії.
  person("t7", ["sales"], COMPANIES.slice(1)),
  // Власник другої компанії (`*` у ролі): сильніший за адміністратора, але не платформа.
  person("o2", ["owner"], COMPANIES.slice(1)),
  // Адміністратор платформи, працює в першій компанії.
  { ...person("p0", ["owner"], COMPANIES.slice(0, 1)), isPlatformAdmin: true },
  // Адміністратор платформи, у другій компанії — з роллю продажів.
  { ...person("p2", ["sales"], COMPANIES.slice(1)), isPlatformAdmin: true },
  // Адміністратор платформи поза компаніями.
  { ...person("pz", [], []), isPlatformAdmin: true },
  // Поза компаніями в застосунку з компаніями: `*` у ролі, але не платформа.
  person("x9", ["owner"], []),
]

const ROLES = [
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: [
      "users:*",
      "roles:*",
      "security:*",
      "audit:read",
      "webhooks:*",
      "company:*",
      "notes:*",
      "tasks:*",
    ],
  },
  {
    id: "auditor",
    name: { uk: "Аудитор", en: "Auditor" },
    permissions: ["security:read"],
  },
  {
    id: "sales",
    name: { uk: "Продажі", en: "Sales" },
    permissions: ["notes:read"],
  },
  {
    id: "editor",
    name: { uk: "Редактор", en: "Editor" },
    permissions: ["notes:*", "audit:read", "company:update"],
  },
  {
    id: "owner",
    name: { uk: "Власник", en: "Owner" },
    permissions: ["*"],
  },
]

const noteSchema = recordBaseSchema.extend({
  title: z.string(),
  status: z.enum(["draft", "done"]),
  companyId: z.string().nullable(),
})
type Note = z.infer<typeof noteSchema>

const NOTES: Note[] = [
  { id: "n1", version: 1, title: "Перша", status: "draft", companyId: "c1" },
  { id: "n2", version: 1, title: "Друга", status: "draft", companyId: "c1" },
  { id: "n3", version: 1, title: "Третя", status: "draft", companyId: "c2" },
  { id: "n4", version: 1, title: "Спільна", status: "draft", companyId: null },
]

const notes = createResourceHandlers({
  resource: "notes",
  schema: noteSchema,
  data: NOTES,
  searchFields: ["title"],
  titleField: "title",
  baseUrl: BASE,
  pins: true,
  unique: ["title"],
})

// Схема ресурсу без поля `companyId`: компанію запису все одно задає сервер (ADR-0036).
const taskSchema = recordBaseSchema.extend({ title: z.string() })
type Task = z.infer<typeof taskSchema>
const TASKS: (Task & { companyId: string })[] = [
  { id: "k1", version: 1, title: "Задача першої", companyId: "c1" },
]
const tasks = createResourceHandlers({
  resource: "tasks",
  schema: taskSchema,
  data: TASKS,
  searchFields: ["title"],
  baseUrl: BASE,
})

const server = setupServer(
  ...createPlatformHandlers({
    users,
    baseUrl: BASE,
    roles: ROLES,
    apiResources: { notes: { uk: "Нотатки", en: "Notes" } },
    webhookEvents: {
      "notes.created": { label: { uk: "Нотатку створено", en: "Created" } },
    },
    // Підписка застосунку без компанії: її налаштовує платформа, а не компанія (ADR-0036).
    webhookSeeds: [
      {
        id: "wh-app",
        url: "https://hooks.example.com/platform",
        events: ["notes.created"],
        active: true,
        createdAt: "2026-10-01T09:00:00.000Z",
      },
    ],
  }),
  ...notes.handlers,
  ...tasks.handlers,
  ...createJobHandlers({ baseUrl: BASE }),
  ...createBulkHandlers<Note>({
    resource: "notes",
    db: notes.db,
    titleField: "title",
    baseUrl: BASE,
    actions: {
      update: {
        // Друга нотатка не проходить: у задачі є що повторити.
        apply: (note) =>
          note.id === "n2"
            ? { code: "locked", message: "Locked", retryable: true }
            : { changes: { status: "done" } },
      },
    },
  }),
)

const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
const data = createDataProvider(client)
let auth = createAuthProvider(client, { baseUrl: BASE })

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  )

/** Ролі людей за компаніями, як після змін адміністраторів (ADR-0033). */
function seedRoles(value: Record<string, Record<string, string[]>>) {
  localStorage.setItem(USER_ROLES_KEY, JSON.stringify(value))
  applyMockRoles()
}

const ids = async () =>
  (
    await data.getList<Note>("notes", {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    })
  ).data.map((note) => note.id)

const actions = async () =>
  (await auth.audit.getEvents({}, 1, 100)).data.map(
    (event) => `${event.action}:${event.target?.id ?? event.actor.id ?? ""}`,
  )

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  signInMock(null)
  localStorage.clear()
  applyMockRoles()
  notes.db.reset()
  tasks.db.reset()
  setMockUsers(users)
  setCompanyId(null)
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("ресурси — на правах компанії запиту", () => {
  it("чужа компанія в заголовку — 403, а не її записи", async () => {
    signInMock("a2")
    setCompanyId("c1")
    expect(await errorOf(ids())).toMatchObject({ status: 403 })
    expect(
      await errorOf(data.getOne<Note>("notes", { id: "n1" })),
    ).toMatchObject({ status: 403 })
  })

  it("без заголовка — компанія сесії й записи без компанії", async () => {
    signInMock("a2")
    expect(await ids()).toEqual(["n3", "n4"])
  })

  it("змінити й видалити запис іншої компанії — 404", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(
      await errorOf(
        data.update<Note>("notes", {
          id: "n3",
          data: { title: "Чужа" },
          previousData: NOTES[2],
        }),
      ),
    ).toMatchObject({ status: 404 })
    expect(
      await errorOf(
        data.delete<Note>("notes", { id: "n3", previousData: NOTES[2] }),
      ),
    ).toMatchObject({ status: 404 })
    setCompanyId("c2")
    expect(await ids()).toContain("n3")
  })

  it("зміна не переносить запис в іншу компанію й не робить спільним", async () => {
    signInMock("a1")
    setCompanyId("c1")
    const { data: moved } = await data.update<Note>("notes", {
      id: "n1",
      data: { title: "Перенесена", companyId: "c2" },
      previousData: NOTES[0],
    })
    expect(moved).toMatchObject({ title: "Перенесена", companyId: "c1" })
    const { data: shared } = await data.update<Note>("notes", {
      id: "n2",
      data: { companyId: null },
      previousData: NOTES[1],
    })
    expect(shared.companyId).toBe("c1")
    setCompanyId("c2")
    expect(await ids()).toEqual(["n3", "n4"])
  })

  it("спільний запис бачать усі компанії, змінює й видаляє лише платформа", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(await ids()).toContain("n4")
    expect(
      await errorOf(
        data.update<Note>("notes", {
          id: "n4",
          data: { title: "Чужими руками" },
          previousData: NOTES[3],
        }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" })
    expect(
      await errorOf(
        data.delete<Note>("notes", { id: "n4", previousData: NOTES[3] }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" })
    signInMock("p0")
    const { data: renamed } = await data.update<Note>("notes", {
      id: "n4",
      data: { title: "Спільна, нова назва" },
      previousData: NOTES[3],
    })
    expect(renamed).toMatchObject({ companyId: null })
  })

  it("закріпити запис іншої компанії — 404", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(
      await errorOf(
        client.put("/notes/n3/pin", undefined, { schema: z.any() }),
      ),
    ).toMatchObject({ status: 404 })
  })

  it("власник компанії (`*` у ролі) не заходить у чужу компанію", async () => {
    signInMock("o2")
    setCompanyId("c1")
    expect(await errorOf(ids())).toMatchObject({ status: 403 })
    expect(await errorOf(actions())).toMatchObject({ status: 403 })
  })

  it("адміністратор платформи — у будь-якій компанії з усіма правами", async () => {
    signInMock("p0")
    setCompanyId("c2")
    expect(await ids()).toEqual(["n3", "n4"])
    await data.create<Note>("notes", {
      data: { title: "Від платформи", status: "draft" },
    })
  })

  it("людина поза компаніями в застосунку з компаніями — без прав, і спільне теж", async () => {
    signInMock("x9")
    expect(await errorOf(ids())).toMatchObject({ status: 403 })
    expect(
      await errorOf(
        data.update<Note>("notes", {
          id: "n4",
          data: { title: "Поза компаніями" },
          previousData: NOTES[3],
        }),
      ),
    ).toMatchObject({ status: 403 })
    expect(await errorOf(actions())).toMatchObject({ status: 403 })
    expect(await errorOf(auth.admin.getSecurityPolicy())).toMatchObject({
      status: 403,
    })
    // Ролі й запрошення «без компанії» — теж ні.
    expect(await errorOf(auth.invitations.list())).toMatchObject({
      status: 403,
    })
  })

  it("назва не повторюється в межах компанії, а не в чужих", async () => {
    signInMock("a2")
    setCompanyId("c2")
    await data.create<Note>("notes", {
      data: { title: "Перша", status: "draft" },
    })
    expect(
      await errorOf(
        data.create<Note>("notes", {
          data: { title: "Спільна", status: "draft" },
        }),
      ),
    ).toMatchObject({ status: 422, fieldErrors: { title: "duplicate" } })
    signInMock("a1")
    setCompanyId("c1")
    expect(
      await errorOf(
        data.create<Note>("notes", {
          data: { title: "Перша", status: "draft" },
        }),
      ),
    ).toMatchObject({ status: 422, fieldErrors: { title: "duplicate" } })
  })

  it("створення — запис компанії запиту, компанія з тіла не діє", async () => {
    signInMock("a1")
    setCompanyId("c1")
    const { data: created } = await data.create<Note>("notes", {
      data: { title: "Нова", status: "draft", companyId: "c2" },
    })
    expect(created.companyId).toBe("c1")
  })

  it("права — у компанії запиту, а не в активній компанії людини", async () => {
    seedRoles({ u3: { c1: ["editor"], c2: ["sales"] } })
    signInMock("u3")
    setCompanyId("c2")
    expect(
      await errorOf(
        data.create<Note>("notes", {
          data: { title: "Нова", status: "draft" },
        }),
      ),
    ).toMatchObject({ status: 403 })
    setCompanyId("c1")
    await data.create<Note>("notes", {
      data: { title: "Нова", status: "draft" },
    })
  })

  it("«Увійти як…» — лише компанія старту", async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: "u3",
        impersonatorId: "a1",
        impersonationCompanyId: "c1",
        stage: "authenticated",
      }),
    )
    setCompanyId("c2")
    expect(await errorOf(ids())).toMatchObject({ status: 403 })
    setCompanyId("c1")
    expect(await ids()).toEqual(["n1", "n2", "n4"])
  })
})

describe("масові дії й задачі — компанії запиту", () => {
  it("запуск у чужій компанії — 403; задачу іншої компанії не видно — 404", async () => {
    signInMock("a2")
    setCompanyId("c1")
    expect(
      await errorOf(
        client.post("/notes/bulk/update", { filter: {} }, { schema: z.any() }),
      ),
    ).toMatchObject({ status: 403 })

    signInMock("a1")
    setCompanyId("c1")
    const { jobId } = await client.post(
      "/notes/bulk/update",
      { ids: ["n1"] },
      { schema: z.object({ jobId: z.string() }) },
    )
    setCompanyId("c2")
    expect(
      await errorOf(client.get(`/jobs/${jobId}`, { schema: z.any() })),
    ).toMatchObject({ status: 404 })
    setCompanyId("c1")
    await client.get(`/jobs/${jobId}`, { schema: z.any() })
  })

  it("повтор задачі — знову з правом у компанії запиту", async () => {
    seedRoles({ u3: { c1: ["editor"], c2: ["sales"] } })
    signInMock("u3")
    setCompanyId("c1")
    const { jobId } = await client.post(
      "/notes/bulk/update",
      { ids: ["n1", "n2"] },
      { schema: z.object({ jobId: z.string() }) },
    )
    await expect
      .poll(async () => {
        const job = await client.get(`/jobs/${jobId}`, {
          schema: z.object({ status: z.string() }),
        })
        return job.status
      })
      .not.toMatch(/queued|running/)
    seedRoles({ u3: { c1: ["sales"], c2: ["sales"] } })
    expect(
      await errorOf(
        client.post(`/jobs/${jobId}/retry`, undefined, { schema: z.any() }),
      ),
    ).toMatchObject({ status: 403 })
  })
})

describe("журнал — у межах компанії", () => {
  it("подія компанії — лише в журналі цієї компанії", async () => {
    signInMock("a1")
    setCompanyId("c2")
    await data.create<Note>("notes", {
      data: { title: "Друга компанія", status: "draft" },
    })
    expect((await actions()).some((a) => a.startsWith("notes.created"))).toBe(
      true,
    )
    setCompanyId("c1")
    expect((await actions()).some((a) => a.startsWith("notes.created"))).toBe(
      false,
    )
  })

  it("вхід людини — у журналі кожної її компанії, в іншій — ні", async () => {
    await auth.login({ email: "t7@zoriana.example", password: "demo-password" })
    await auth.login({ email: "u3@zoriana.example", password: "demo-password" })
    signInMock("a1")
    setCompanyId("c1")
    const first = await actions()
    expect(first).toContain("auth.sign_in:u3")
    expect(first).not.toContain("auth.sign_in:t7")
    setCompanyId("c2")
    const second = await actions()
    expect(second).toContain("auth.sign_in:u3")
    expect(second).toContain("auth.sign_in:t7")
  })

  it("право `audit:read` — у компанії запиту", async () => {
    seedRoles({ u3: { c1: ["editor"], c2: ["sales"] } })
    signInMock("u3")
    setCompanyId("c2")
    expect(await errorOf(actions())).toMatchObject({ status: 403 })
    setCompanyId("c1")
    await actions()
  })

  it("відмова «стелі» — невдала подія в журналі компанії запиту", async () => {
    signInMock("a2")
    setCompanyId("c2")
    expect(
      await errorOf(auth.admin.blockUser("o2", "Перевірка")),
    ).toMatchObject({ status: 403, code: "forbidden" })
    await auth.reauthenticate({ password: "demo-password" })
    expect(
      await errorOf(auth.roles.setUserRoles("t7", ["owner"])),
    ).toMatchObject({ status: 403, code: "forbidden" })
    const events = (await auth.audit.getEvents({}, 1, 100)).data
    expect(events.filter((event) => event.result === "failure")).toMatchObject([
      {
        action: "users.roles_changed",
        target: { id: "t7" },
        details: { code: "beyond_ceiling" },
      },
      {
        action: "users.blocked",
        target: { id: "o2" },
        details: { code: "beyond_ceiling" },
      },
    ])
    signInMock("a1")
    setCompanyId("c1")
    expect(
      (await auth.audit.getEvents({}, 1, 100)).data.some(
        (event) => event.result === "failure",
      ),
    ).toBe(false)
  })
})

describe("вебхуки, налаштування компанії й токени API — компанії запиту", () => {
  it("підписка однієї компанії не бачить і не отримує подій іншої", async () => {
    signInMock("a1")
    await auth.reauthenticate({ password: "demo-password" })
    setCompanyId("c1")
    const { webhook } = await auth.webhooks.create({
      url: "https://hooks.example.com/erp",
      events: ["notes.created"],
      active: true,
    })
    setCompanyId("c2")
    expect((await auth.webhooks.list()).webhooks).toHaveLength(0)
    await data.create<Note>("notes", {
      data: { title: "Друга компанія", status: "draft" },
    })
    setCompanyId("c1")
    expect((await auth.webhooks.getDeliveries(webhook.id, 1, 20)).total).toBe(0)
    await data.create<Note>("notes", {
      data: { title: "Перша компанія", status: "draft" },
    })
    expect((await auth.webhooks.getDeliveries(webhook.id, 1, 20)).total).toBe(1)
  })

  it("підписку іншої компанії не перевірити, не прочитати й не змінити — 404 без пароля", async () => {
    signInMock("a1")
    await auth.reauthenticate({ password: "demo-password" })
    setCompanyId("c1")
    const { webhook } = await auth.webhooks.create({
      url: "https://hooks.example.com/erp",
      events: ["notes.created"],
      active: true,
    })
    signInMock("a2")
    setCompanyId("c2")
    for (const call of [
      () => auth.webhooks.test(webhook.id),
      () => auth.webhooks.getDeliveries(webhook.id, 1, 20),
      () => auth.webhooks.rotateSecret(webhook.id),
    ]) {
      const error = await errorOf(call())
      expect(isReauthRequired(error)).toBe(false)
      expect(error).toMatchObject({ status: 404 })
    }
  })

  it("підписку застосунку (без компанії) компанії не бачать", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect((await auth.webhooks.list()).webhooks).toHaveLength(0)
    await auth.reauthenticate({ password: "demo-password" })
    expect(
      await errorOf(auth.webhooks.update("wh-app", { active: false })),
    ).toMatchObject({ status: 404 })
  })

  it("`company:update` — у компанії запиту", async () => {
    seedRoles({ u3: { c1: ["sales"], c2: ["editor"] } })
    signInMock("u3")
    // Реквізити з перевіркою LC12: ЄДРПОУ з демо.
    const patch = {
      kind: "legal" as const,
      legalName: "ТОВ «Тест»",
      edrpou: "32855961",
    }
    setCompanyId("c2")
    await auth.company.update(patch)
    setCompanyId("c1")
    expect(await errorOf(auth.company.update(patch))).toMatchObject({
      status: 403,
    })
  })

  it("токен API — права й список компанії запиту", async () => {
    seedRoles({ u3: { c1: ["editor"], c2: ["sales"] } })
    signInMock("u3")
    await auth.reauthenticate({ password: "demo-password" })
    setCompanyId("c2")
    expect(
      (await auth.account.getApiTokens()).scopes.map((scope) => scope.id),
    ).toEqual(["notes:read"])
    expect(
      await errorOf(
        auth.account.createApiToken({
          name: "Інтеграція",
          scopes: ["notes:update"],
          expiresInDays: 30,
        }),
      ),
    ).toMatchObject({ status: 422, fieldErrors: { scopes: "invalid" } })
    setCompanyId("c1")
    const { item } = await auth.account.createApiToken({
      name: "Інтеграція",
      scopes: ["notes:update"],
      expiresInDays: 30,
    })
    setCompanyId("c2")
    expect((await auth.account.getApiTokens()).tokens).toHaveLength(0)
    expect(await errorOf(auth.account.revokeApiToken(item.id))).toMatchObject({
      status: 404,
    })
  })

  it("токен у компанії, де людина не працює, — 403 до пароля", async () => {
    signInMock("a2")
    setCompanyId("c1")
    const error = await errorOf(
      auth.account.createApiToken({
        name: "Інтеграція",
        scopes: ["notes:read"],
        expiresInDays: 30,
      }),
    )
    expect(isReauthRequired(error)).toBe(false)
    expect(error).toMatchObject({ status: 403 })
  })
})

describe("політика безпеки — одна на застосунок", () => {
  it("адміністратор компанії бачить її лише для перегляду; змінити — 403 до пароля", async () => {
    signInMock("a1")
    setCompanyId("c1")
    const { policy, canUpdate } = await auth.admin.getSecurityPolicy()
    expect(canUpdate).toBe(false)
    const error = await errorOf(
      auth.admin.updateSecurityPolicy({ ...policy, sessionMinutes: 60 }),
    )
    expect(isReauthRequired(error)).toBe(false)
    expect(error).toMatchObject({ status: 403, code: "forbidden" })
  })

  it("власник компанії (`*` у ролі) — теж лише перегляд", async () => {
    signInMock("o2")
    setCompanyId("c2")
    const { policy, canUpdate } = await auth.admin.getSecurityPolicy()
    expect(canUpdate).toBe(false)
    expect(
      await errorOf(
        auth.admin.updateSecurityPolicy({ ...policy, sessionMinutes: 60 }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" })
  })

  it("адміністратор платформи змінює, подію бачить журнал кожної компанії", async () => {
    signInMock("p0")
    setCompanyId("c1")
    const { policy, canUpdate } = await auth.admin.getSecurityPolicy()
    expect(canUpdate).toBe(true)
    await auth.reauthenticate({ password: "demo-password" })
    await auth.admin.updateSecurityPolicy({ ...policy, sessionMinutes: 60 })
    signInMock("a2")
    setCompanyId("c2")
    expect(await actions()).toContain("security.policy_updated:p0")
  })

  it("другий крок «для ролей» — за ролями людини в усіх її компаніях", async () => {
    signInMock("p0")
    await auth.reauthenticate({ password: "demo-password" })
    const { policy } = await auth.admin.getSecurityPolicy()
    await auth.admin.updateSecurityPolicy({
      ...policy,
      twoFactor: "roles",
      twoFactorRoles: ["editor"],
    })
    signInMock(null)
    seedRoles({ u3: { c1: ["sales"], c2: ["editor"] } })
    const error = await errorOf(
      auth.login({ email: "u3@zoriana.example", password: "demo-password" }),
    )
    expect(error).toMatchObject({ code: "factor_setup_required" })
  })
})

describe("людина поза компаніями й адміністратор платформи (ADR-0036)", () => {
  it("людина поза компаніями не створює спільного запису, підписки застосунку й токена", async () => {
    signInMock("x9")
    // Ще й без підказки «така назва вже є» в іншій компанії.
    expect(
      await errorOf(
        data.create<Note>("notes", {
          data: { title: "Перша", status: "draft" },
        }),
      ),
    ).toMatchObject({ status: 403 })
    await auth.reauthenticate({ password: "demo-password" })
    expect(
      await errorOf(
        auth.webhooks.create({
          url: "https://hooks.example.com/all",
          events: ["notes.created"],
          active: true,
        }),
      ),
    ).toMatchObject({ status: 403 })
    expect(
      await errorOf(
        auth.account.createApiToken({
          name: "Усе",
          scopes: ["notes:read"],
          expiresInDays: 30,
        }),
      ),
    ).toMatchObject({ status: 422, fieldErrors: { scopes: "invalid" } })
  })

  it("підписку застосунку змінює платформа; подія не йде в журнал компанії", async () => {
    signInMock("p0")
    setCompanyId("c1")
    expect(
      (await auth.webhooks.list()).webhooks.map((webhook) => webhook.id),
    ).toContain("wh-app")
    await auth.reauthenticate({ password: "demo-password" })
    await auth.webhooks.update("wh-app", { active: false })
    signInMock("a1")
    setCompanyId("c1")
    expect(await actions()).not.toContain("integrations.webhook_updated:wh-app")
    // Поза компаніями подію бачить адміністратор платформи.
    signInMock("pz")
    setCompanyId(null)
    expect(await actions()).toContain("integrations.webhook_updated:wh-app")
  })

  it("адміністратор платформи блокує іншого, але не входить від його імені", async () => {
    signInMock("pz")
    setCompanyId("c2")
    await auth.reauthenticate({ password: "demo-password" })
    expect(await errorOf(auth.impersonate("p2", "Перевірка"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
    await auth.admin.blockUser("p2", "Перевірка")
  })

  it("власник компанії не блокує адміністратора платформи, не змінює його ролей і не входить від його імені", async () => {
    signInMock("o2")
    setCompanyId("c2")
    await auth.reauthenticate({ password: "demo-password" })
    expect(
      await errorOf(auth.admin.blockUser("p2", "Перевірка")),
    ).toMatchObject({ status: 403, code: "forbidden" })
    expect(await errorOf(auth.impersonate("p2", "Перевірка"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
    expect(
      await errorOf(auth.roles.setUserRoles("p2", ["auditor"])),
    ).toMatchObject({ status: 403, code: "forbidden" })
    expect(
      (await auth.audit.getEvents({}, 1, 100)).data
        .filter((event) => event.result === "failure")
        .map((event) => event.action),
    ).toEqual([
      "users.roles_changed",
      "auth.impersonation_started",
      "users.blocked",
    ])
  })

  it("у своїй компанії платформа діє за роллю там: політика лише для перегляду", async () => {
    seedRoles({ p2: { c2: ["auditor"] } })
    signInMock("p2")
    setCompanyId("c2")
    expect((await auth.admin.getSecurityPolicy()).canUpdate).toBe(false)
  })

  it("масова дія не змінює спільного запису; платформа — змінює", async () => {
    const run = async () => {
      const { jobId } = await client.post(
        "/notes/bulk/update",
        { ids: ["n1", "n4"] },
        { schema: z.object({ jobId: z.string() }) },
      )
      let job: { status: string; failures: { code: string }[] } | undefined
      await expect
        .poll(async () => {
          job = await client.get(`/jobs/${jobId}`, {
            schema: z.object({
              status: z.string(),
              failures: z.array(z.object({ code: z.string() })),
            }),
          })
          return job.status
        })
        .toBe("done")
      return job?.failures.map((failure) => failure.code)
    }
    signInMock("a1")
    setCompanyId("c1")
    expect(await run()).toEqual(["forbidden"])
    signInMock("p0")
    expect(await run()).toEqual([])
  })
})

describe("схема ресурсу без `companyId`", () => {
  it("створений і змінений запис лишається компанії запиту", async () => {
    const list = async () =>
      (
        await data.getList<Task>("tasks", {
          pagination: { page: 1, perPage: 50 },
          sort: { field: "id", order: "ASC" },
          filter: {},
        })
      ).data.map((task) => task.title)
    signInMock("a1")
    setCompanyId("c1")
    await data.create<Task>("tasks", { data: { title: "Нова" } })
    await data.update<Task>("tasks", {
      id: "k1",
      data: { title: "Змінена" },
      previousData: TASKS[0],
    })
    expect((await list()).sort()).toEqual(["Змінена", "Нова"])
    setCompanyId("c2")
    expect(await list()).toEqual([])
  })
})

describe("застосунок без компаній", () => {
  it("усе видно й змінюють усі, і людина з власною компанією після реєстрації", async () => {
    setMockUsers([person("solo", ["admin"], [])])
    // Людина з компанією після реєстрації: застосунок лишається без компаній.
    addMockUser(person("new", ["admin"], [{ id: "c9", name: "Нова" }]))
    signInMock("solo")
    expect(await ids()).toEqual(["n1", "n2", "n3", "n4"])
    expect((await auth.admin.getSecurityPolicy()).canUpdate).toBe(true)
    signInMock("new")
    setCompanyId("c9")
    expect(await ids()).toEqual(["n1", "n2", "n3", "n4"])
    await data.update<Note>("notes", {
      id: "n4",
      data: { title: "Своїми руками" },
      previousData: NOTES[3],
    })
    await data.create<Note>("notes", {
      data: { title: "Від нової", status: "draft" },
    })
    signInMock("solo")
    setCompanyId(null)
    const journal = await actions()
    expect(journal).toContain("notes.updated:n4")
    expect(journal.some((action) => action.startsWith("notes.created"))).toBe(
      true,
    )
  })
})
