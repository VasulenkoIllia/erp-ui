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
import { createAuthProvider } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createBulkHandlers, createJobHandlers } from "@/registry/lib/mock-jobs"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Крок A2c2b1 (ADR-0038): «Свої / Усі» в моках ролей — каталог з `own`, `:own` лише для дії з
 * вибором (ресурси кіта вибору не мають), «стеля» з обсягом, `GET /me`. Ресурс без відповідального
 * «своїх» записів не має, тож дія лише над своїми в ньому — 403 (`notes`). Записи з відповідальним —
 * `own-records-mocks.test.ts`.
 */

const BASE = "http://erp.test/api/v1"
const COMPANY = { id: "c1", name: "ТОВ «Тест»" }

const user = (id: string, roles: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@zoriana.example`,
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies: [COMPANY],
  companyId: COMPANY.id,
  factors: [],
})

const noteSchema = recordBaseSchema.extend({
  title: z.string(),
  companyId: z.string().nullable(),
})

const notes = createResourceHandlers({
  resource: "notes",
  schema: noteSchema,
  data: [{ id: "n1", version: 1, title: "Нотатка", companyId: "c1" }],
  searchFields: ["title"],
  baseUrl: BASE,
})

const server = setupServer(
  ...createPlatformHandlers({
    users: [
      user("a1", ["admin"]),
      user("m1", ["lead"]),
      user("u2", ["sales"]),
      user("d1", ["remover"]),
    ],
    baseUrl: BASE,
    linkUrl: (kind, token) => `http://demo.test/#/login/${kind}?token=${token}`,
    roles: [
      {
        id: "admin",
        name: { uk: "Адміністратор", en: "Administrator" },
        permissions: ["users:*", "roles:*", "notes:*"],
      },
      // Керує ролями, а нотатки має лише свої: «Усі» дати не може.
      {
        id: "lead",
        name: { uk: "Керівник", en: "Lead" },
        permissions: [
          "roles:*",
          "notes:read:own",
          "notes:update:own",
          "notes:delete:own",
        ],
      },
      {
        id: "sales",
        name: { uk: "Продажі", en: "Sales" },
        permissions: ["notes:read", "notes:update:own"],
      },
      {
        id: "remover",
        name: { uk: "Прибирає", en: "Remover" },
        permissions: ["notes:delete"],
      },
    ],
    permissionResources: {
      notes: {
        label: { uk: "Нотатки", en: "Notes" },
        own: ["read", "update", "delete"],
      },
      // `own` на ресурсі кіта не діє: «своїх» людей чи ролей немає.
      users: { label: { uk: "Користувачі", en: "Users" }, own: ["read"] },
      roles: {
        label: { uk: "Ролі", en: "Roles" },
        actions: ["read", "update"],
      },
    },
    apiResources: { notes: { uk: "Нотатки", en: "Notes" } },
  }),
  ...notes.handlers,
  ...createJobHandlers({ baseUrl: BASE }),
  ...createBulkHandlers({
    resource: "notes",
    db: notes.db,
    actions: { delete: { apply: () => ({ changes: {} }) } },
    titleField: "title",
    baseUrl: BASE,
  }),
)

const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
let auth = createAuthProvider(client, { baseUrl: BASE })

const statusOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (error: unknown) => {
      const { status, fieldErrors } = error as {
        status?: number
        fieldErrors?: unknown
      }
      return fieldErrors ? `422 ${JSON.stringify(fieldErrors)}` : status
    },
  )

const tokenScopes = async () =>
  (
    await client.get("/me/api-tokens", {
      schema: z.object({ scopes: z.array(z.object({ id: z.string() })) }),
    })
  ).scopes.map((scope) => scope.id)

describe("моки ролей: «Свої / Усі»", () => {
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
    setCompanyId(COMPANY.id)
    auth = createAuthProvider(client, { baseUrl: BASE })
  })
  afterEach(() => {
    server.resetHandlers()
  })

  it("каталог позначає дії з вибором; :own — лише для них, ресурси кіта вибору не мають", async () => {
    signInMock("a1")
    const { resources } = await auth.roles.list()
    expect(resources[0]?.actions).toEqual([
      { id: "read", label: "Перегляд", own: true },
      { id: "create", label: "Створення" },
      { id: "update", label: "Зміна", own: true },
      { id: "delete", label: "Видалення", own: true },
    ])
    expect(
      resources.find((resource) => resource.id === "users")?.actions[0],
    ).toEqual({ id: "read", label: "Перегляд" })
    expect(
      await statusOf(
        auth.roles.create({ name: "Свої", permissions: ["notes:update:own"] }),
      ),
    ).toBe(200)
    for (const permission of ["notes:create:own", "users:read:own"])
      expect(
        await statusOf(
          auth.roles.create({ name: "Ні", permissions: [permission] }),
        ),
      ).toBe('422 {"permissions":"invalid"}')
  })

  it("«стеля» на сервері: хто має лише свої, не дає «Усі»", async () => {
    signInMock("m1")
    expect(
      await statusOf(
        auth.roles.create({ name: "Мої", permissions: ["notes:update:own"] }),
      ),
    ).toBe(200)
    expect(
      await statusOf(
        auth.roles.create({ name: "Усі", permissions: ["notes:update"] }),
      ),
    ).toBe(403)
    const { roles } = await auth.roles.list()
    const mine = roles.find((role) => role.name === "Мої")
    expect(mine).toBeDefined()
    expect(
      await statusOf(
        auth.roles.update(mine?.id ?? "", {
          permissions: ["notes:update:own", "notes:read:own"],
        }),
      ),
    ).toBe(200)
    expect(
      await statusOf(
        auth.roles.update(mine?.id ?? "", { permissions: ["notes:update"] }),
      ),
    ).toBe(403)
  })

  it("права людини з :own — у профілі як є, дія дозволена на рівні ролі", async () => {
    signInMock("u2")
    expect((await auth.getMe()).permissions).toEqual([
      "notes:read",
      "notes:update:own",
    ])
    expect(await auth.canAccess?.({ resource: "notes", action: "edit" })).toBe(
      true,
    )
    expect(
      await auth.canAccess?.({ resource: "notes", action: "delete" }),
    ).toBe(false)
  })

  it("ресурс без відповідального: дія лише над своїми — 403, а не всі записи", async () => {
    signInMock("m1")
    expect(await statusOf(client.get("/notes"))).toBe(403)
    expect(
      await statusOf(client.patch("/notes/n1", { title: "Інша", version: 1 })),
    ).toBe(403)
    expect(
      await statusOf(client.post("/notes/bulk/delete", { ids: ["n1"] })),
    ).toBe(403)
    // «Усі» на перегляд — список є, а зміна лише своїх — 403.
    signInMock("u2")
    expect(await statusOf(client.get("/notes"))).toBe(200)
    expect(
      await statusOf(client.patch("/notes/n1", { title: "Інша", version: 1 })),
    ).toBe(403)
  })

  it("повтор масової дії після зниження «Усі» до «Свої» — 403", async () => {
    signInMock("d1")
    const { jobId } = await client.post(
      "/notes/bulk/delete",
      { ids: ["n1"] },
      { schema: z.object({ jobId: z.string() }) },
    )
    signInMock("a1")
    await auth.reauthenticate({ password: "demo-password" })
    expect(
      await statusOf(
        auth.roles.update("remover", { permissions: ["notes:delete:own"] }),
      ),
    ).toBe(200)
    signInMock("d1")
    expect(await statusOf(client.post(`/jobs/${jobId}/retry`))).toBe(403)
  })

  it("токен API не ширший за людину: на «Свої» — лише дія над своїми", async () => {
    signInMock("u2")
    expect(await tokenScopes()).toEqual(["notes:read", "notes:update:own"])
    await auth.reauthenticate({ password: "demo-password" })
    expect(
      await statusOf(
        client.post("/me/api-tokens", {
          name: "Звіти",
          scopes: ["notes:update"],
          expiresInDays: 30,
        }),
      ),
    ).toBe('422 {"scopes":"invalid"}')
  })
})
