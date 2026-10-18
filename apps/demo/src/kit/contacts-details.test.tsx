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
import type { AuditEvent } from "@/registry/lib/audit"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { resetScenarios } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  itemFieldOf,
  nextPrimary,
  withItem,
  withoutItem,
  withPrimary,
} from "@/registry/modules/B1-contacts/components/detail-items"
import { useCodeItems } from "@/registry/modules/B1-contacts/components/form-schema"
import {
  organizationCardSchemaFor,
  type BankAccount,
  type OrganizationCard,
} from "@/registry/modules/B1-contacts/contract"
import { createContactsMocks } from "@/registry/modules/B1-contacts/mocks"

/** Крок 1.4b2b (ADR-0028): адреси й рахунки організації — моки детального запису й зміни колекцій. */

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
const mocks = createContactsMocks({ baseUrl: BASE })
const server = setupServer(
  ...createPlatformHandlers({ users: [user], baseUrl: BASE }),
  ...mocks.handlers,
)
const provider = createDataProvider(createApiClient({ baseUrl: BASE }))
/** Дві адреси, один рахунок (фікстури: кожна 3-тя з другою адресою). */
const TWO_ADDRESSES = "org-002"
/** Два рахунки, основний — перший (фікстури: кожна 4-та з другим рахунком). */
const TWO_ACCOUNTS = "org-003"
/** Дійсний IBAN, якого немає у фікстурах. */
const NEW_IBAN = "UA673052990026007000123456789"

const card = async (id: string) =>
  (await provider.getOne<OrganizationCard>("organizations", { id })).data
const patch = async (
  organization: OrganizationCard,
  data: Partial<OrganizationCard>,
) =>
  (
    await provider.update<OrganizationCard>("organizations", {
      id: organization.id,
      data: { ...data, version: organization.version },
      previousData: organization,
    })
  ).data
const fieldErrors = (error: unknown) =>
  isApiError(error) ? error.fieldErrors : undefined

describe("моки B1: адреси й рахунки", () => {
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
    signInMock("u1")
    setCompanyId("c1")
  })
  afterEach(() => {
    server.resetHandlers()
  })

  it("нова адреса без `id` отримує його від сервера; версія зростає, список — без колекцій", async () => {
    const before = await card(TWO_ADDRESSES)
    expect(before.addresses).toHaveLength(2)
    const saved = await patch(before, {
      addresses: [
        ...before.addresses,
        {
          kind: "postal",
          line: "а/с 15",
          city: "Львів",
          postalCode: "79013",
          country: "UA",
        } as OrganizationCard["addresses"][number],
      ],
    })
    expect(saved.version).toBe(before.version + 1)
    expect(saved.addresses).toHaveLength(3)
    expect(saved.addresses[2]?.id).toEqual(expect.any(String))
    expect(saved.addresses.slice(0, 2)).toEqual(before.addresses)
    const { data: list } = await provider.getList<OrganizationCard>(
      "organizations",
      {
        filter: { q: before.name },
        pagination: { page: 1, perPage: 5 },
        sort: { field: "name", order: "ASC" },
      },
    )
    expect(list[0]).not.toHaveProperty("addresses")
    expect(list[0]?.version).toBe(saved.version)
  })

  it("основний рахунок — рівно один; `iban` організації — його, а не з запиту", async () => {
    const before = await card(TWO_ACCOUNTS)
    const second = before.bankAccounts[1]
    const switched = await patch(before, {
      bankAccounts: withPrimary(before.bankAccounts, second.id),
      iban: "UA000000000000000000000000000",
    })
    expect(switched.iban).toBe(second.iban)
    expect(switched.bankAccounts.map((account) => account.primary)).toEqual([
      false,
      true,
    ])
    // Видалили основний — основним стає перший з решти.
    const removed = await patch(switched, {
      bankAccounts: withoutItem(switched.bankAccounts, second.id),
    })
    expect(removed.bankAccounts).toHaveLength(1)
    expect(removed.bankAccounts[0]?.primary).toBe(true)
    expect(removed.iban).toBe(before.bankAccounts[0]?.iban)
    // Рахунків немає — `iban` порожній.
    const none = await patch(removed, { bankAccounts: [] })
    expect(none.iban).toBe("")
    const { data: list } = await provider.getList<OrganizationCard>(
      "organizations",
      {
        filter: { q: before.name },
        pagination: { page: 1, perPage: 5 },
        sort: { field: "name", order: "ASC" },
      },
    )
    expect(list[0]?.iban).toBe("")
  })

  it("IBAN з помилкою — 422 `invalid`, той самий двічі — `duplicate`, з шляхом елемента", async () => {
    const before = await card(TWO_ACCOUNTS)
    const first = before.bankAccounts[0]
    const added = (iban: string) => ({
      bankAccounts: [
        ...before.bankAccounts,
        { iban, bankName: "", currency: "UAH", primary: false } as BankAccount,
      ],
    })
    await expect(
      patch(before, added("UA113005280000260000000052530")),
    ).rejects.toSatisfy(
      (error) => fieldErrors(error)?.["bankAccounts.2.iban"] === "invalid",
    )
    await expect(patch(before, added(first.iban))).rejects.toSatisfy(
      (error) => fieldErrors(error)?.["bankAccounts.2.iban"] === "duplicate",
    )
    const saved = await patch(before, added(NEW_IBAN))
    expect(saved.bankAccounts[2]).toMatchObject({
      iban: NEW_IBAN,
      primary: false,
    })
    expect(saved.iban).toBe(first.iban)
  })

  it("стара версія — 409, `current` — детальний запис з колекціями", async () => {
    const before = await card(TWO_ADDRESSES)
    await patch(before, {
      addresses: withoutItem(before.addresses, before.addresses[1]?.id ?? ""),
    })
    await expect(patch(before, { addresses: [] })).rejects.toSatisfy(
      (error) =>
        isApiError(error) &&
        error.status === 409 &&
        (error.current as OrganizationCard).addresses.length === 1,
    )
  })

  it("журнал: колекції — рядками, основний рахунок позначено", async () => {
    const before = await card(TWO_ACCOUNTS)
    const second = before.bankAccounts[1]
    await patch(before, {
      bankAccounts: withPrimary(before.bankAccounts, second.id),
    })
    const { data: events } = await provider.getList<AuditEvent>(
      "audit-events",
      {
        filter: { targetType: "organizations", targetId: TWO_ACCOUNTS },
        pagination: { page: 1, perPage: 5 },
        sort: { field: "at", order: "DESC" },
      },
    )
    const accounts = events[0]?.changes?.find(
      (change) => change.field === "bankAccounts",
    )
    expect(accounts?.to).toEqual([
      expect.not.stringContaining("основний"),
      expect.stringMatching(/^UA59 3808 .* · основний$/),
    ])
    expect(
      events[0]?.changes?.find((change) => change.field === "iban")?.to,
    ).toBe(second.iban)
  })

  it("журнал: зміна лише типу адреси видна", async () => {
    const before = await card(TWO_ADDRESSES)
    const [legal] = before.addresses
    await patch(before, {
      addresses: before.addresses.map((address) =>
        address.id === legal.id ? { ...address, kind: "postal" } : address,
      ),
    })
    const { data: events } = await provider.getList<AuditEvent>(
      "audit-events",
      {
        filter: { targetType: "organizations", targetId: TWO_ADDRESSES },
        pagination: { page: 1, perPage: 5 },
        sort: { field: "at", order: "DESC" },
      },
    )
    const addresses = events[0]?.changes?.find(
      (change) => change.field === "addresses",
    )
    expect(addresses?.from).toEqual(
      expect.arrayContaining([expect.stringMatching(/^юридична · /)]),
    )
    expect(addresses?.to).toEqual(
      expect.arrayContaining([expect.stringMatching(/^поштова · /)]),
    )
  })
})

describe("схема картки й варіанти форми", () => {
  const manager = {
    id: "manager",
    type: "text",
    label: { uk: "Менеджер", en: "Manager" },
  } as const

  it("схема картки лишає поля розширення; поле з ключем колекції — помилка розробника", () => {
    const schema = organizationCardSchemaFor({ fields: [manager] })
    const parsed = schema.parse({
      id: "org-x",
      version: 1,
      name: "ТОВ «Тест»",
      type: "legal",
      code: "32855961",
      iban: "",
      phone: "",
      email: "",
      city: "",
      manager: "Ірина",
      addresses: [],
      bankAccounts: [],
    })
    expect(parsed).toMatchObject({ manager: "Ірина", addresses: [] })
    expect(() =>
      organizationCardSchemaFor({
        fields: [{ ...manager, id: "addresses" }],
      }),
    ).toThrow(/clashes with a module field/)
  })

  it("код, якого Intl не розбирає, лишається у виборі без назви", () => {
    const { result } = renderHook(() =>
      useCodeItems(["UAH"], "U$D", "currency"),
    )
    const [uah, unknown] = result.current
    expect(uah?.label).toMatch(/^UAH · /)
    expect(unknown).toEqual({ value: "U$D", label: "U$D" })
  })
})

describe("колекції організації: зміна одного елемента", () => {
  const accounts: BankAccount[] = [
    { id: "a", iban: "UA1", bankName: "", currency: "UAH", primary: true },
    { id: "b", iban: "UA2", bankName: "", currency: "USD", primary: false },
  ]
  const values = { iban: "UA3", bankName: "", currency: "EUR", primary: false }

  it("зміна — на своєму місці; нова й видалена кимось — у кінці й без `id`", () => {
    expect(withItem(accounts, "a", values)).toEqual([
      { ...values, id: "a" },
      accounts[1],
    ])
    expect(withItem(accounts, undefined, values)).toEqual([...accounts, values])
    expect(withItem(accounts, "gone", values)).toEqual([...accounts, values])
  })

  it("основний і наступний основний після видалення", () => {
    expect(withPrimary(accounts, "b").map((a) => a.primary)).toEqual([
      false,
      true,
    ])
    expect(nextPrimary(accounts, "a")?.id).toBe("b")
    expect(nextPrimary(accounts, "b")).toBeNull()
    expect(nextPrimary(accounts.slice(0, 1), "a")).toBeNull()
    expect(withoutItem(accounts, "a")).toEqual([accounts[1]])
  })

  it("помилка сервера в колекції — поле форми; інша — як є", () => {
    const fieldOf = itemFieldOf("bankAccounts")
    expect(fieldOf("bankAccounts.2.iban")).toBe("iban")
    expect(fieldOf("bankAccounts")).toBe("bankAccounts")
    expect(fieldOf("name")).toBe("name")
  })
})
