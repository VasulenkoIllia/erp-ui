import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { createApiClient, isApiError } from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  createDictionariesModule,
  type DictionaryDefaults,
  type PaymentTerm,
  type Reason,
  type Tax,
} from "@/registry/modules/A6-dictionaries"
import { focusHeadingOnceRemoved } from "@/registry/modules/A6-dictionaries/components/use-entry-toggle"
import {
  DEFAULTS_ID,
  DICTIONARY_DEFAULTS,
  partsRemainder,
  partsTotal,
  paymentPartSchema,
  PAYMENT_TERMS,
  paymentTermSchema,
  REASONS,
  reasonSchemaFor,
  tagSchema,
  TAGS,
  TAXES,
  taxSchema,
  UNITS,
  unitSchema,
} from "@/registry/modules/A6-dictionaries/contract"
import { createDictionariesFixtures } from "@/registry/modules/A6-dictionaries/fixtures"
import { createDictionariesMocks } from "@/registry/modules/A6-dictionaries/mocks"

import { dictionariesMockExtension } from "@/extensions/A6-dictionaries-fields"

/** Модуль A6 (ADR-0047): фабрика, фікстури, контракт і сім сценаріїв. */
const BASE = "http://erp-dictionaries.test/api/v1"
const COMPANY = "c1"
const OTHER = "c2"

const person = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [
    { id: COMPANY, name: "ТОВ «Тест»" },
    { id: OTHER, name: "ФОП Тестенко" },
  ],
  companyId: COMPANY,
  factors: [],
})
const EDITOR = person("editor", [
  "taxes:*",
  "units:*",
  "payment-terms:*",
  "tags:*",
  "reasons:*",
  "dictionary-defaults:*",
])
const VIEWER = person("viewer", ["taxes:read", "dictionary-defaults:read"])

const mocks = createDictionariesMocks({
  baseUrl: BASE,
  companies: [COMPANY, OTHER],
  extension: dictionariesMockExtension,
})
const server = setupServer(
  ...createPlatformHandlers({ users: [EDITOR, VIEWER], baseUrl: BASE }),
  ...mocks.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const list = <T extends { id: string }>(
  resource: string,
  filter: Record<string, unknown> = {},
) =>
  provider.getList<T>(resource, {
    filter,
    pagination: { page: 1, perPage: 50 },
    sort: { field: "name", order: "ASC" },
  })
const defaults = () =>
  provider
    .getOne<DictionaryDefaults>(DICTIONARY_DEFAULTS, { id: DEFAULTS_ID })
    .then(({ data }) => data)
const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (isApiError(error) ? error : null),
  )
const taxBy = async (name: string) => {
  const { data } = await list<Tax>(TAXES)
  const found = data.find((tax) => tax.name === name)
  if (!found) throw new Error(`no tax ${name}`)
  return found
}
const update = <T extends { id: string; version: number }>(
  resource: string,
  record: T,
  data: Partial<T>,
) =>
  provider.update<T>(resource, {
    id: record.id,
    data: { ...data, version: record.version },
    previousData: record,
  })

describe("модуль A6: фабрика", () => {
  it("без податків, одиниць і умов оплати немає й типових значень", () => {
    const { nav, routes } = createDictionariesModule({
      extension: {
        taxes: { page: false },
        units: { page: false },
        paymentTerms: { page: false },
      },
    })
    expect(nav.map((item) => item.id)).toEqual(["A6-tags", "A6-reasons"])
    expect(routes).toHaveLength(2)
  })

  it("адреси від basePath, пункт на кожну сторінку з правом", () => {
    const module = createDictionariesModule({ basePath: "/settings/" })
    expect(module.id).toBe("A6")
    expect(module.paths.paymentTerms).toBe("/settings/payment-terms")
    expect(module.routes.map((route) => route.path)).toEqual([
      "/settings/taxes",
      "/settings/units",
      "/settings/payment-terms",
      "/settings/tags",
      "/settings/reasons",
      "/settings/defaults",
      "/settings/",
    ])
    expect(module.nav.map((item) => item.access)).toEqual([
      { resource: TAXES, action: "read" },
      { resource: UNITS, action: "read" },
      { resource: PAYMENT_TERMS, action: "read" },
      { resource: TAGS, action: "read" },
      { resource: REASONS, action: "read" },
      { resource: DICTIONARY_DEFAULTS, action: "read" },
    ])
  })

  it("без basePath: адреси в корені, переадресації немає", () => {
    const module = createDictionariesModule()
    expect(module.routes).toHaveLength(6)
    expect(module.routes[0]?.path).toBe("/taxes")
  })

  it("`page: false` прибирає сторінку й пункт; адреса модуля — на першу з решти", () => {
    const module = createDictionariesModule({
      basePath: "/d",
      extension: { taxes: { page: false }, defaults: { page: false } },
    })
    expect(module.nav.map((item) => item.href)).toEqual([
      "/d/units",
      "/d/payment-terms",
      "/d/tags",
      "/d/reasons",
    ])
    expect(module.routes.map((route) => route.path)).toEqual([
      "/d/units",
      "/d/payment-terms",
      "/d/tags",
      "/d/reasons",
      "/d",
    ])
  })

  it("права ресурсів: значення не видаляються, налаштування не створюється", () => {
    const { resources } = createDictionariesModule()
    expect(
      resources.some((resource) => resource.actions.includes("delete")),
    ).toBe(false)
    expect(resources.find((r) => r.name === TAXES)?.actions).toEqual([
      "read",
      "create",
      "update",
    ])
    expect(
      resources.find((r) => r.name === DICTIONARY_DEFAULTS)?.actions,
    ).toEqual(["read", "update"])
  })
})

describe("модуль A6: контракт", () => {
  it("залишок до 100 % без шуму дробових чисел", () => {
    expect(partsRemainder([{ percent: 8.04 }])).toBe(91.96)
    expect(partsRemainder([{ percent: 99.9 }])).toBe(0.1)
    expect(partsRemainder([{ percent: 60 }, { percent: 60 }])).toBe(0)
    expect(partsRemainder([{ percent: null }])).toBe(100)
  })

  it("відсотки мають не більше двох знаків", () => {
    const part = { days: 0, base: "invoice" }
    for (const percent of [0.01, 8.04, 33.33])
      expect(paymentPartSchema.safeParse({ ...part, percent }).success).toBe(
        true,
      )
    expect(
      paymentPartSchema.safeParse({ ...part, percent: 0.004 }).success,
    ).toBe(false)
    expect(taxSchema.shape.rate.safeParse(12.345).success).toBe(false)
  })

  it("зовнішні коди мають ті самі межі, що й форма", () => {
    const { externalCodes } = taxSchema.shape
    expect(externalCodes.safeParse({ Система: "0301" }).success).toBe(true)
    expect(externalCodes.safeParse({ "": "0301" }).success).toBe(false)
    expect(externalCodes.safeParse({ Система: " " }).success).toBe(false)
    const tooMany = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`К${index}`, "1"]),
    )
    expect(externalCodes.safeParse(tooMany).success).toBe(false)
  })

  it("фікстури проходять схеми, id не повторюються між компаніями", () => {
    const fixtures = createDictionariesFixtures({ companies: ["a", "b"] })
    fixtures.taxes.forEach((row) => taxSchema.parse(row))
    fixtures.units.forEach((row) => unitSchema.parse(row))
    fixtures.paymentTerms.forEach((row) => paymentTermSchema.parse(row))
    fixtures.tags.forEach((row) => tagSchema.parse(row))
    fixtures.reasons.forEach((row) => reasonSchemaFor().parse(row))
    expect(new Set(fixtures.taxes.map((row) => row.id)).size).toBe(
      fixtures.taxes.length,
    )
    expect(fixtures.defaults.map((row) => row.companyId)).toEqual(["a", "b"])
    expect(fixtures.defaults.every((row) => row.id === DEFAULTS_ID)).toBe(true)
  })

  it("сума частин рахується в сотих: 33,33 + 33,33 + 33,34 — рівно 100", () => {
    expect(
      partsTotal([{ percent: 33.33 }, { percent: 33.33 }, { percent: 33.34 }]),
    ).toBe(100)
    expect(partsTotal([{ percent: null }, { percent: 10.1 }])).toBe(10.1)
    expect(partsTotal([])).toBe(0)
  })

  it("вид причини: ключ модуля чи розширення, інший — помилка", () => {
    const schema = reasonSchemaFor(dictionariesMockExtension.reasons)
    const reason = createDictionariesFixtures().reasons[0]
    expect(schema.parse({ ...reason, kind: "write-off" }).kind).toBe(
      "write-off",
    )
    expect(schema.safeParse({ ...reason, kind: "unknown" }).success).toBe(false)
  })
})

describe("модуль A6: моки", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    setCompanyId(COMPANY)
    signInMock(EDITOR.id)
  })
  afterEach(() => {
    resetScenarios()
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })

  it("success: лише значення компанії запиту", async () => {
    const { data, total } = await list<Tax>(TAXES)
    expect(total).toBe(4)
    expect(data.every((tax) => tax.companyId === COMPANY)).toBe(true)
  })

  it("фільтр стану: `active` приходить рядком із адреси", async () => {
    const tax = await taxBy("ПДВ 7%")
    await update(TAXES, tax, { active: false })
    expect((await list<Tax>(TAXES, { active: "false" })).total).toBe(1)
    expect((await list<Tax>(TAXES, { active: "true" })).total).toBe(3)
    await update(TAXES, await taxBy("ПДВ 7%"), { active: true })
  })

  it("пошук у причинах і фільтр виду", async () => {
    expect((await list<Reason>(REASONS, { q: "дублікат" })).total).toBe(1)
    expect((await list<Reason>(REASONS, { kind: "return" })).total).toBe(1)
  })

  it("та сама назва в іншому регістрі — 422 `name: duplicate`", async () => {
    const failure = await failureOf(
      provider.create(TAXES, { data: { name: "пдв 20%", rate: 20 } }),
    )
    expect(failure?.status).toBe(422)
    expect(failure?.fieldErrors?.name).toBe("duplicate")
  })

  it("та сама назва в іншій компанії й у причини іншого виду дозволена", async () => {
    await provider.create(TAGS, {
      data: { name: "Унікальний", tone: "info" },
    })
    setCompanyId(OTHER)
    await expect(
      provider.create(TAGS, { data: { name: "Унікальний", tone: "info" } }),
    ).resolves.toBeTruthy()
    setCompanyId(COMPANY)
    await expect(
      provider.create(REASONS, {
        data: { name: "Клієнт передумав", kind: "reject" },
      }),
    ).resolves.toBeTruthy()
  })

  it("сума частин не 100 — 422 `parts`", async () => {
    const failure = await failureOf(
      provider.create(PAYMENT_TERMS, {
        data: {
          name: "Неповні",
          parts: [{ percent: 50, days: 0, base: "invoice" }],
        },
      }),
    )
    expect(failure?.status).toBe(422)
    expect(failure?.fieldErrors).toHaveProperty("parts")
  })

  it("`PATCH` замінює частини й зовнішні коди цілком", async () => {
    const { data: terms } = await list<PaymentTerm>(PAYMENT_TERMS)
    const term = terms.find((row) => row.parts.length === 2)
    if (!term) throw new Error("no term")
    const { data: saved } = await update(PAYMENT_TERMS, term, {
      parts: [{ percent: 100, days: 10, base: "delivery" }],
      externalCodes: { Бухгалтерія: "A1" },
    })
    expect(saved.parts).toEqual([{ percent: 100, days: 10, base: "delivery" }])
    expect(saved.externalCodes).toEqual({ Бухгалтерія: "A1" })
  })

  it("типове значення: зміна компанії не чіпає іншу, версія зростає", async () => {
    const tax = await taxBy("ПДВ 7%")
    const before = await defaults()
    const { data: saved } = await update(DICTIONARY_DEFAULTS, before, {
      taxId: tax.id,
    })
    expect(saved.taxId).toBe(tax.id)
    expect(saved.version).toBe(before.version + 1)
    setCompanyId(OTHER)
    expect((await defaults()).taxId).toBe(`vat-20-${OTHER}`)
  })

  it("вимкнення типового значення прибирає його з налаштування лише цієї компанії", async () => {
    const before = await defaults()
    const unit = mocks.db.units.all().find((row) => row.id === before.unitId)
    if (!unit) throw new Error("no unit")
    await update(UNITS, unit, { active: false })
    const after = await defaults()
    expect(after.unitId).toBeNull()
    expect(after.version).toBe(before.version + 1)
    setCompanyId(OTHER)
    expect((await defaults()).unitId).toBe(`pcs-${OTHER}`)
    setCompanyId(COMPANY)
    await update(
      UNITS,
      { ...unit, version: unit.version + 1 },
      { active: true },
    )
    expect((await defaults()).unitId).toBeNull()
  })

  it("вимкнення звичайного значення налаштування не чіпає", async () => {
    const before = await defaults()
    await update(TAXES, await taxBy("Без ПДВ"), { active: false })
    expect(await defaults()).toEqual(before)
    await update(TAXES, await taxBy("Без ПДВ"), { active: true })
  })

  it("без права `create` — 403, без права на ресурс — 403", async () => {
    signInMock(VIEWER.id)
    expect(
      (await failureOf(provider.create(TAXES, { data: { name: "Новий" } })))
        ?.status,
    ).toBe(403)
    expect((await failureOf(list(UNITS)))?.status).toBe(403)
  })

  it.each([
    ["error", 500],
    ["forbidden", 403],
  ] as const)("%s: %i на список і налаштування", async (scenario, status) => {
    setScenario(scenario, TAXES)
    setScenario(scenario, DICTIONARY_DEFAULTS)
    expect((await failureOf(list(TAXES)))?.status).toBe(status)
    expect((await failureOf(defaults()))?.status).toBe(status)
  })

  it("empty: порожній список", async () => {
    setScenario("empty", TAGS)
    expect(await list(TAGS)).toMatchObject({ data: [], total: 0 })
  })

  it("offline: мережевий збій", async () => {
    setScenario("offline", TAXES)
    const failure: unknown = await list(TAXES).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
  })

  it("slow: відповідь лише пізніше, але приходить", async () => {
    setScenario("slow", TAGS)
    expect((await list(TAGS)).total).toBeGreaterThan(0)
  })

  it("conflict: 409 із записом сервера, наступне збереження проходить", async () => {
    const tax = await taxBy("ПДВ 20%")
    setScenario("conflict", TAXES)
    const failure = await failureOf(update(TAXES, tax, { rate: 21 }))
    expect(failure?.status).toBe(409)
    const current = await taxBy("ПДВ 20%")
    expect(current.version).toBe(tax.version + 1)
    await expect(update(TAXES, current, { rate: 21 })).resolves.toBeTruthy()
  })
})

describe("вимкнений рядок зникає разом із кнопкою", () => {
  let frames: FrameRequestCallback[]
  const nextFrame = () => frames.shift()?.(0)
  const setup = () => {
    const table = document.body.appendChild(document.createElement("div"))
    table.dataset.slot = "data-table"
    const button = table.appendChild(document.createElement("button"))
    const neighbour = table.appendChild(document.createElement("button"))
    const heading = document.body.appendChild(document.createElement("h1"))
    heading.tabIndex = -1
    button.focus()
    return { button, neighbour, heading, ref: { current: heading } }
  }

  beforeEach(() => {
    frames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it("рядок зник пізніше за перший кадр: фокус усе одно на заголовку", () => {
    const { button, heading, ref } = setup()
    focusHeadingOnceRemoved(button, ref)
    nextFrame()
    nextFrame()
    expect(document.activeElement).toBe(button)
    button.remove()
    nextFrame()
    expect(document.activeElement).toBe(heading)
    expect(frames).toHaveLength(0)
  })

  it("таблиця вже забрала фокус на сусідню клітинку: заголовок його отримує", () => {
    const { button, neighbour, heading, ref } = setup()
    focusHeadingOnceRemoved(button, ref)
    button.remove()
    neighbour.focus()
    nextFrame()
    expect(document.activeElement).toBe(heading)
  })

  it("людина вже пішла з таблиці: фокус лишається в неї", () => {
    const { button, ref } = setup()
    const pager = document.body.appendChild(document.createElement("button"))
    focusHeadingOnceRemoved(button, ref)
    pager.focus()
    button.remove()
    nextFrame()
    expect(document.activeElement).toBe(pager)
  })

  it("рядок лишився: фокус не чіпаємо й перестаємо чекати", () => {
    const { button, ref } = setup()
    focusHeadingOnceRemoved(button, ref, 3)
    nextFrame()
    nextFrame()
    nextFrame()
    expect(frames).toHaveLength(0)
    expect(document.activeElement).toBe(button)
  })
})
