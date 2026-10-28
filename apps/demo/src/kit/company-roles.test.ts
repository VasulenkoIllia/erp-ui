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
import { createAuthProvider } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import {
  assignedRoles,
  mockPermissionsIn,
  mockUserRolesIn,
  permissionsInCompany,
  readMockCompanyRoles,
  readMockUserRoles,
  rolesOfCompany,
  withAssignedRoles,
  withCompanyRole,
  withoutCompanyRole,
} from "@/registry/lib/mock-company-roles"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { applyMockRoles, type MockRole } from "@/registry/lib/mock-team"
import { mockUsersList } from "@/registry/lib/mock-server"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import type { Role } from "@/registry/lib/roles"

/**
 * Крок A2b2b1 (ADR-0033): ролі в межах компанії запиту — лічильник людей і 409 «роль призначена»
 * лише для людей цієї компанії, зміна ролі проекту — копією лише в своїй компанії, нова роль —
 * компанії, де її створили; ролі людини свої в кожній її компанії, права — за ролями в компанії
 * запиту; `*` не керує ролями чужої компанії; сценарії моків ресурсу `roles`.
 */

const BASE = "http://erp.test/api/v1"
const C1 = { id: "c1", name: "ТОВ «Тест»" }
const C2 = { id: "c2", name: "ФОП Тестенко" }

const person = (
  id: string,
  roles: string[],
  companies: MockUser["companies"],
): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies,
  companyId: companies[0]?.id ?? null,
  factors: [],
})

const users: MockUser[] = [
  person("admin", ["admin"], [C1, C2]),
  person("ivan", ["sales"], [C1]),
  person("olha", ["sales", "support"], [C2]),
  // Працює в обох компаніях: ролі й права — свої в кожній.
  person("petro", ["lead"], [C1, C2]),
  person("boss", ["owner"], [C1]),
]

const ROLES: MockRole[] = [
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: ["users:*", "roles:*", "notes:*", "audit:read"],
  },
  {
    id: "sales",
    name: { uk: "Продажі", en: "Sales" },
    permissions: ["notes:read"],
  },
  {
    id: "support",
    name: { uk: "Підтримка", en: "Support" },
    permissions: ["notes:read"],
  },
  {
    id: "auditor",
    name: { uk: "Аудитор", en: "Auditor" },
    permissions: ["notes:read"],
  },
  {
    id: "lead",
    name: { uk: "Керівник", en: "Lead" },
    permissions: ["notes:read"],
  },
  {
    id: "owner",
    name: { uk: "Власник", en: "Owner" },
    system: true,
    permissions: ["*"],
  },
]

const server = setupServer(
  ...createPlatformHandlers({
    users,
    baseUrl: BASE,
    linkUrl: (kind, token) => `http://demo.test/#/login/${kind}?token=${token}`,
    roles: ROLES,
    permissionResources: {
      notes: { label: { uk: "Нотатки", en: "Notes" } },
      users: { label: { uk: "Користувачі", en: "Users" } },
      roles: {
        label: { uk: "Ролі", en: "Roles" },
        actions: ["read", "update"],
      },
    },
  }),
)

const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
let auth = createAuthProvider(client, { baseUrl: BASE })

const statusOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (error: unknown) => (isApiError(error) ? error.status : 0),
  )

async function rolesIn(companyId: string) {
  setCompanyId(companyId)
  return (await auth.roles.list()).roles
}

const role = (roles: Role[], id: string) => roles.find((item) => item.id === id)

const byId = (id: string) => {
  const user = mockUsersList().find((u) => u.id === id)
  if (!user) throw new Error(`No mock user ${id}`)
  return user
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(async () => {
  localStorage.clear()
  resetScenarios()
  applyMockRoles()
  setCompanyId(null)
  auth = createAuthProvider(client, { baseUrl: BASE })
  signInMock("admin")
  await auth.reauthenticate({ password: "demo-password" })
})
afterEach(() => {
  server.resetHandlers()
})

describe("ролі компанії: чисті функції", () => {
  const shared = ROLES.slice(1, 3)
  it("копія ролі проекту — лише в своїй компанії, видалена — схована лише там", () => {
    const changed = { ...shared[0], permissions: ["notes:*"] } as MockRole
    const own: MockRole = { id: "own", name: { uk: "Своя", en: "Own" } }
    let state = withCompanyRole({}, "c1", changed)
    state = withCompanyRole(state, "c1", own)
    state = withoutCompanyRole(state, shared, "c1", "support")
    expect(rolesOfCompany(shared, state, "c1")).toEqual([changed, own])
    expect(rolesOfCompany(shared, state, "c2")).toEqual(shared)
    expect(rolesOfCompany(shared, state, null)).toEqual(shared)
    // Своя роль видаляється зовсім, а не ховається.
    state = withoutCompanyRole(state, shared, "c1", "own")
    expect(rolesOfCompany(shared, state, "c1")).toEqual([changed])
    expect(state.c1?.removed).toEqual(["support"])
  })

  it("ролі людини за компаніями: список діє в усіх, призначення — лише в одній", () => {
    const petro = { id: "petro", companies: [C1, C2] }
    const legacy = { petro: ["auditor"] }
    expect(assignedRoles(legacy, "petro", "c2", ["lead"])).toEqual(["auditor"])
    const state = withAssignedRoles(legacy, petro, "c1", ["sales"])
    expect(assignedRoles(state, "petro", "c1", ["lead"])).toEqual(["sales"])
    expect(assignedRoles(state, "petro", "c2", ["lead"])).toEqual(["auditor"])
    // Без призначення — як задав проект.
    expect(assignedRoles({}, "petro", "c1", ["lead"])).toEqual(["lead"])
  })

  it("права в компанії: роль, якої тут немає, прав не дає; без опису ролей — права з MockUser", () => {
    const known = (id: string) => ["sales", "support"].includes(id)
    const base = ["base:read"]
    expect(
      permissionsInCompany(
        ["sales", "support"],
        shared.slice(0, 1),
        known,
        base,
      ),
    ).toEqual(["notes:read"])
    expect(permissionsInCompany(["legacy"], shared, known, base)).toEqual(base)
    expect(permissionsInCompany([], shared, known, base)).toEqual(base)
    // Роль лише для назви поряд з описаною не повертає початкових прав.
    const nameOnly: MockRole = {
      id: "label",
      name: { uk: "Мітка", en: "Label" },
    }
    const withLabel = [...shared, nameOnly]
    const knownLabel = (id: string) => known(id) || id === "label"
    expect(
      permissionsInCompany(["sales", "label"], withLabel, knownLabel, base),
    ).toEqual(["notes:read"])
    expect(
      permissionsInCompany(["label"], withLabel, knownLabel, base),
    ).toEqual(base)
    // Роль проекту, схована в цій компанії, прав не дає.
    expect(
      permissionsInCompany(["support"], shared.slice(0, 1), known, base),
    ).toEqual([])
  })

  it("зіпсоване сховище — як порожнє, без помилки", () => {
    localStorage.setItem("erp-ui:mock-company-roles", "null")
    expect(readMockCompanyRoles()).toEqual({})
    localStorage.setItem(
      "erp-ui:mock-company-roles",
      JSON.stringify({ c1: { roles: null }, c2: 5, c3: { roles: [{}, 1] } }),
    )
    expect(readMockCompanyRoles()).toEqual({
      c1: { roles: [], removed: [] },
      c3: { roles: [], removed: [] },
    })
    localStorage.setItem(
      "erp-ui:mock-user-roles",
      JSON.stringify({ a: "x", b: { c1: [1], c2: ["sales"] }, c: ["sales"] }),
    )
    expect(readMockUserRoles()).toEqual({ b: { c2: ["sales"] }, c: ["sales"] })
    localStorage.setItem("erp-ui:mock-company-roles", "{")
    expect(() => {
      applyMockRoles()
    }).not.toThrow()
  })
})

describe("ролі в межах компанії запиту", () => {
  it("лічильник людей — лише люди компанії", async () => {
    const c1 = await rolesIn("c1")
    expect(role(c1, "sales")?.usersCount).toBe(1)
    expect(role(c1, "support")?.usersCount).toBe(0)
    expect(role(c1, "lead")?.usersCount).toBe(1)
    const c2 = await rolesIn("c2")
    expect(role(c2, "sales")?.usersCount).toBe(1)
    expect(role(c2, "support")?.usersCount).toBe(1)
    // Ролі людини змінили в c1 — лічильник c2 той самий.
    setCompanyId("c1")
    await auth.roles.setUserRoles("petro", ["sales"])
    expect(role(await rolesIn("c1"), "sales")?.usersCount).toBe(2)
    expect(role(await rolesIn("c2"), "sales")?.usersCount).toBe(1)
    expect(role(await rolesIn("c2"), "lead")?.usersCount).toBe(1)
  })

  it("зміна ролі проекту — лише в своїй компанії; права людей — за ролями їхньої компанії", async () => {
    setCompanyId("c1")
    await auth.roles.update("sales", { permissions: ["notes:*"] })
    expect(role(await rolesIn("c1"), "sales")).toMatchObject({
      permissions: ["notes:*"],
    })
    expect(role(await rolesIn("c2"), "sales")).toMatchObject({
      permissions: ["notes:read"],
    })
    expect(byId("ivan").permissions).toEqual(["notes:*"])
    expect(byId("olha").permissions).toEqual(["notes:read"])
  })

  it("ролі людини свої в кожній компанії: призначення в c1 не змінює c2", async () => {
    setCompanyId("c1")
    await auth.roles.setUserRoles("petro", ["auditor"])
    expect(mockUserRolesIn(byId("petro"), "c1")).toEqual(["auditor"])
    expect(mockUserRolesIn(byId("petro"), "c2")).toEqual(["lead"])
    setCompanyId("c2")
    await auth.roles.setUserRoles("petro", ["sales", "lead"])
    expect(mockUserRolesIn(byId("petro"), "c1")).toEqual(["auditor"])
    const { data } = await auth.audit.getEvents({ category: ["users"] }, 1, 1)
    expect(data[0]?.changes).toEqual([
      { field: "roles", from: ["lead"], to: ["sales", "lead"] },
    ])
  })

  it("права людини — у компанії запиту: розширена в c1 роль не діє в c2", async () => {
    setCompanyId("c1")
    await auth.roles.update("lead", {
      permissions: ["notes:read", "roles:read"],
    })
    const petro = byId("petro")
    expect(mockPermissionsIn(petro, "c1")).toEqual(["notes:read", "roles:read"])
    expect(mockPermissionsIn(petro, "c2")).toEqual(["notes:read"])
    signInMock("petro")
    expect((await rolesIn("c1")).length).toBeGreaterThan(0)
    expect(await statusOf(rolesIn("c2"))).toBe(403)
  })

  it("запрошення — за правами в компанії запиту", async () => {
    setCompanyId("c1")
    await auth.roles.update("lead", {
      permissions: ["notes:read", "users:create"],
    })
    signInMock("petro")
    setCompanyId("c1")
    expect(await statusOf(auth.invitations.list())).toBe(200)
    setCompanyId("c2")
    expect(await statusOf(auth.invitations.list())).toBe(403)
  })

  it("`*` не керує ролями чужої компанії", async () => {
    signInMock("boss")
    await auth.reauthenticate({ password: "demo-password" })
    setCompanyId("c2")
    expect(await statusOf(auth.roles.list())).toBe(403)
    expect(
      await statusOf(auth.roles.create({ name: "Чужа", permissions: [] })),
    ).toBe(403)
    expect(await statusOf(auth.roles.setUserRoles("olha", ["sales"]))).toBe(403)
  })

  it("нова роль — лише компанії, де її створили; з іншої — 404, як невідома", async () => {
    setCompanyId("c1")
    const created = await auth.roles.create({
      name: "Склад",
      permissions: ["notes:read"],
    })
    expect(role(await rolesIn("c1"), created.id)).toBeDefined()
    expect(role(await rolesIn("c2"), created.id)).toBeUndefined()
    setCompanyId("c2")
    expect(
      await statusOf(auth.roles.update(created.id, { name: "Інше" })),
    ).toBe(404)
    expect(await statusOf(auth.roles.remove(created.id))).toBe(404)
    // Назва вільна в іншій компанії.
    expect(
      await statusOf(auth.roles.create({ name: "Склад", permissions: [] })),
    ).toBe(200)
    // Ролі іншої компанії людині не дати — як невідома (422).
    expect(await statusOf(auth.roles.setUserRoles("olha", [created.id]))).toBe(
      422,
    )
  })

  it("409 «роль призначена» — лише люди компанії; видалення ролі проекту ховає її лише тут", async () => {
    setCompanyId("c2")
    expect(await statusOf(auth.roles.remove("support"))).toBe(409)
    setCompanyId("c1")
    expect(await statusOf(auth.roles.remove("support"))).toBe(200)
    expect(role(await rolesIn("c1"), "support")).toBeUndefined()
    expect(role(await rolesIn("c2"), "support")).toMatchObject({
      usersCount: 1,
    })
    expect(byId("olha").roles).toContain("support")
  })
})

describe("сценарії ресурсу roles", () => {
  it("conflict — перша зміна ролі компанії 409, наступні проходять; новий conflict — знову 409", async () => {
    setCompanyId("c1")
    setScenario("conflict", "roles")
    const rename = () => auth.roles.update("auditor", { name: "Ревізор" })
    expect(await statusOf(rename())).toBe(409)
    expect(await statusOf(rename())).toBe(200)
    expect(await statusOf(rename())).toBe(200)
    // Та сама роль в іншій компанії — своя.
    setCompanyId("c2")
    expect(await statusOf(auth.roles.remove("auditor"))).toBe(409)
    expect(await statusOf(auth.roles.remove("auditor"))).toBe(200)
    // Сценарій змінився й повернувся — знову з 409.
    setCompanyId("c1")
    setScenario("success", "roles")
    await auth.roles.list()
    setScenario("conflict", "roles")
    expect(await statusOf(rename())).toBe(409)
  })

  it("empty — ролей немає, каталог прав є; error і forbidden — відмова", async () => {
    setCompanyId("c1")
    setScenario("empty", "roles")
    const empty = await auth.roles.list()
    expect(empty.roles).toEqual([])
    expect(empty.resources.map((r) => r.id)).toEqual([
      "notes",
      "users",
      "roles",
    ])
    setScenario("error", "roles")
    expect(await statusOf(auth.roles.list())).toBe(500)
    setScenario("forbidden", "roles")
    expect(
      await statusOf(auth.roles.create({ name: "X", permissions: [] })),
    ).toBe(403)
  })
})
