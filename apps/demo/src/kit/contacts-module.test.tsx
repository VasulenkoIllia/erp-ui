import { renderHook } from "@testing-library/react"
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
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  useExtensionFields,
  type ExtensionField,
} from "@/registry/lib/extension-fields"
import type { KeyedChanges } from "@/registry/lib/extensions"
import { mergeMessages } from "@/registry/lib/i18n-namespaces"
import { resetScenarios } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  statusIds,
  statusSchema,
  useResolvedStatuses,
  type ExtensionStatus,
} from "@/registry/lib/statuses"
import { validateUaId } from "@/registry/lib/ua-ids"
import { createContactsModule } from "@/registry/modules/B1-contacts"
import {
  ORGANIZATION_STATUSES,
  organizationDetailSchema,
  organizationSchemaFor,
  contactSchemaFor,
  type Contact,
  type Organization,
  type OrganizationStatus,
} from "@/registry/modules/B1-contacts/contract"
import { createContactsFixtures } from "@/registry/modules/B1-contacts/fixtures"
import { createContactsMocks } from "@/registry/modules/B1-contacts/mocks"

import { INVOICE_CLIENTS } from "@/data/invoices"
import { contactsMockExtension } from "@/extensions/B1-contacts-fields"

/** Крок 1.4 (ADR-0025): модуль B1 — статуси, фікстури, моки, фабрика, рядки й точки розширення. */

const STATUSES: KeyedChanges<ExtensionStatus, OrganizationStatus> = {
  add: [
    {
      id: "suspended",
      label: { uk: "Призупинена", en: "Suspended" },
      tone: "warning",
      mockEvery: 4,
    },
    { id: "prospect", label: { uk: "Лід", en: "Lead" }, tone: "info" },
  ],
  hide: ["inactive"],
}

describe("lib/statuses", () => {
  it("ключі схеми: модуль і нові; схований лишається дійсним", () => {
    expect(statusIds(ORGANIZATION_STATUSES, STATUSES)).toEqual([
      "active",
      "prospect",
      "inactive",
      "suspended",
    ])
    const schema = statusSchema(ORGANIZATION_STATUSES, STATUSES)
    expect(schema.safeParse("inactive").success).toBe(true)
    expect(schema.safeParse("suspended").success).toBe(true)
    expect(schema.safeParse("archived").success).toBe(false)
  })

  it("вибір без схованих, перейменування ключем модуля; бейдж знає всі", () => {
    const statuses = ORGANIZATION_STATUSES.map((id) => ({
      id,
      label: id,
      tone: "neutral" as const,
    }))
    const { result } = renderHook(() => useResolvedStatuses(statuses, STATUSES))
    expect(result.current.options.map((s) => s.id)).toEqual([
      "active",
      "prospect",
      "suspended",
    ])
    expect(result.current.byId.get("prospect")?.label).toBe("Лід")
    expect(result.current.byId.get("inactive")?.label).toBe("inactive")
    expect(result.current.byId.get("suspended")?.tone).toBe("warning")
  })
})

describe("фікстури B1", () => {
  for (const locale of ["uk", "en"] as const) {
    it(`${locale}: записи проходять схеми, коди й IBAN дійсні`, () => {
      const { organizations, contacts, details } = createContactsFixtures({
        locale,
      })
      const organizationSchema = organizationSchemaFor()
      for (const organization of organizations) {
        expect(organizationSchema.safeParse(organization).success).toBe(true)
        const kind = organization.type === "fop" ? "rnokpp" : "edrpou"
        expect(validateUaId(kind, organization.code)).toBeNull()
        expect(validateUaId("iban", organization.iban)).toBeNull()
        const detail = details.get(organization.id)
        expect(organizationDetailSchema.safeParse(detail).success).toBe(true)
        for (const account of detail?.bankAccounts ?? [])
          expect(validateUaId("iban", account.iban)).toBeNull()
      }
      const ids = new Set(organizations.map((o) => o.id))
      for (const contact of contacts) {
        expect(contactSchemaFor().safeParse(contact).success).toBe(true)
        if (contact.organizationId)
          expect(ids.has(contact.organizationId)).toBe(true)
      }
    })
  }

  it("uk і en — ті самі записи й коди, різні назви", () => {
    const uk = createContactsFixtures({ locale: "uk" })
    const en = createContactsFixtures({ locale: "en" })
    expect(en.organizations.map((o) => [o.id, o.code])).toEqual(
      uk.organizations.map((o) => [o.id, o.code]),
    )
    expect(en.organizations[0]?.name).toBe("Dnipro Treid LLC")
    expect(uk.organizations[0]?.name).toBe("ТОВ «Дніпро Трейд»")
  })

  it("клієнти рахунків демо — перші організації модуля: фільтр «Клієнт» і довідник збігаються", () => {
    const names = createContactsFixtures({ locale: "uk" }).organizations.map(
      (organization) => organization.name,
    )
    expect(names.slice(0, INVOICE_CLIENTS.length)).toEqual(INVOICE_CLIENTS)
  })
})

const BASE = "http://erp.test/api/v1"
const user: MockUser = {
  id: "u1",
  name: "Олена",
  email: "u1@test.example",
  password: "demo-password",
  totpCode: "111111",
  roles: ["admin"],
  permissions: ["*"],
  companies: [{ id: "c1", name: "ТОВ «Тест»" }],
  companyId: "c1",
  factors: [],
}
const mocks = createContactsMocks({
  baseUrl: BASE,
  extension: { organizations: { statuses: STATUSES } },
})
const server = setupServer(
  ...createPlatformHandlers({ users: [user], baseUrl: BASE }),
  ...mocks.handlers,
)
const provider = createDataProvider(createApiClient({ baseUrl: BASE }))
const total = async (resource: string, filter: Record<string, unknown>) =>
  (
    await provider.getList(resource, {
      filter,
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    })
  ).total ?? 0

describe("моки B1", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })
  beforeEach(() => {
    resetScenarios()
    mocks.db.organizations.reset()
    mocks.db.contacts.reset()
    signInMock("u1")
    setCompanyId("c1")
  })
  afterEach(() => {
    server.resetHandlers()
  })

  it("статус розширення — кожна N-та організація фікстур; фільтр за ним", async () => {
    const all = mocks.db.organizations.all()
    expect(all[3]?.status).toBe("suspended")
    expect(await total("organizations", { status: "suspended" })).toBe(
      Math.floor(all.length / 4),
    )
  })

  it("представники й приватні особи разом — усі контакти", async () => {
    const all = await total("contacts", {})
    const representatives = await total("contacts", {
      organizationId_ne: "null",
    })
    const persons = await total("contacts", { organizationId: "null" })
    expect(representatives).toBeGreaterThan(0)
    expect(persons).toBeGreaterThan(0)
    expect(representatives + persons).toBe(all)
  })

  it("сегменти — «хоч один із» вибраних", async () => {
    const key = await total("organizations", { segments: "seg-key" })
    const partner = await total("organizations", { segments: "seg-partner" })
    const both = await total("organizations", {
      segments: ["seg-key", "seg-partner"],
    })
    expect(both).toBeGreaterThan(Math.max(key, partner))
    expect(both).toBeLessThanOrEqual(key + partner)
  })

  it("картка організації — з адресами й рахунками, список — без них", async () => {
    const { data: list } = await provider.getList<Organization>(
      "organizations",
      {
        filter: {},
        pagination: { page: 1, perPage: 5 },
        sort: { field: "name", order: "ASC" },
      },
    )
    expect(list[0]).not.toHaveProperty("addresses")
    const { data } = await provider.getOne<Organization>("organizations", {
      id: list[0]?.id ?? "",
    })
    expect(organizationDetailSchema.safeParse(data).success).toBe(true)
  })

  it("зміна організації контакту з версією; стара версія — 409 з поточним записом", async () => {
    const { data: contact } = await provider.getOne<Contact>("contacts", {
      id: "contact-001",
    })
    const { data: saved } = await provider.update<Contact>("contacts", {
      id: contact.id,
      data: { organizationId: null, version: contact.version },
      previousData: contact,
    })
    expect(saved.organizationId).toBeNull()
    const stale = provider.update<Contact>("contacts", {
      id: contact.id,
      data: { organizationId: "org-002", version: contact.version },
      previousData: contact,
    })
    await expect(stale).rejects.toSatisfy(
      (error) => isApiError(error) && error.status === 409,
    )
  })
})

describe("фабрика createContactsModule", () => {
  it("маршрути від basePath, перехід з адреси модуля, навігація й ресурси", () => {
    const module = createContactsModule({ basePath: "/crm/" })
    expect(module.routes.map((route) => route.path)).toEqual([
      "/crm/contacts",
      "/crm/contacts/:id",
      "/crm/organizations",
      "/crm/organizations/:id",
      "/crm/",
    ])
    expect(module.nav.map((item) => item.href)).toEqual([
      "/crm/contacts",
      "/crm/organizations",
    ])
    expect(module.paths.organization("org/1")).toBe(
      "/crm/organizations/org%2F1",
    )
    expect(module.resources.map((resource) => resource.name)).toEqual([
      "contacts",
      "organizations",
      "segments",
    ])
  })

  it("без basePath — без перенаправлення; чужа адреса — без завантаження", () => {
    const module = createContactsModule()
    expect(module.routes).toHaveLength(4)
    expect(() => {
      module.preload("/settings/users")
    }).not.toThrow()
  })
})

describe("рядки модуля: перевизначення розширення", () => {
  it("зливає вкладені ключі, решта — з модуля; без перевизначень — той самий об'єкт", () => {
    const base = { contacts: { title: "Контакти", lead: "Пояснення" } }
    expect(mergeMessages(base)).toBe(base)
    expect(mergeMessages(base, { contacts: { title: "Люди" } })).toEqual({
      contacts: { title: "Люди", lead: "Пояснення" },
    })
  })
})

describe("точки розширення списку: фільтр і вкладка з даних", () => {
  const fields: readonly ExtensionField[] = [
    ...contactsMockExtension.contacts.fields,
    ...contactsMockExtension.organizations.fields,
    { id: "since", type: "date", label: { uk: "З", en: "Since" } },
    { id: "note", type: "text", label: { uk: "Нотатка", en: "Note" } },
  ]

  it("список — варіанти, так/ні — два варіанти, дата — період; текст фільтром не стає", () => {
    const { result } = renderHook(() => useExtensionFields(fields))
    const api = result.current
    expect(api.filter({ id: "channel" })).toMatchObject({
      kind: "options",
      field: "channel",
      label: "Зручний канал",
    })
    expect(api.filter({ id: "vatPayer" })).toMatchObject({
      kind: "options",
      options: [{ value: "true" }, { value: "false" }],
    })
    expect(api.filter({ id: "since" })).toMatchObject({ kind: "date-range" })
    expect(() => api.filter({ id: "note" })).toThrow(/cannot be a filter/)
    expect(
      api.tab({
        id: "key",
        label: { uk: "Ключові", en: "Key" },
        filter: { segments: ["seg-key", "seg-new"] },
      }),
    ).toEqual({
      id: "key",
      label: "Ключові",
      filter: { segments: ["seg-key", "seg-new"] },
    })
  })
})
