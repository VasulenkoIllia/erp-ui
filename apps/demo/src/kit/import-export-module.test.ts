import type { RaRecord } from "ra-core"
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
import { parseCell, templateRows } from "@/registry/lib/import-rows"
import type { ImportRequest } from "@/registry/lib/imports"
import { createJobHandlers, resetMockJobs } from "@/registry/lib/mock-jobs"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createImportExportModule } from "@/registry/modules/A4-import-export"
import {
  IMPORT_RUN_STATUSES,
  IMPORT_RUNS,
  importRunSchema,
  type ImportRun,
} from "@/registry/modules/A4-import-export/contract"
import { createImportExportFixtures } from "@/registry/modules/A4-import-export/fixtures"
import {
  createImportExportMocks,
  importTargetMock,
} from "@/registry/modules/A4-import-export/mocks"
import { importRunPath } from "@/registry/modules/A4-import-export/module-context"
import {
  CONTACTS_TARGET,
  localizeTarget,
  MODULE_TARGETS,
  targetColumns,
} from "@/registry/modules/A4-import-export/targets"
import { createDictionariesMocks } from "@/registry/modules/A6-dictionaries/mocks"
import { CONTACTS } from "@/registry/modules/B1-contacts/contract"
import { createContactsMocks } from "@/registry/modules/B1-contacts/mocks"

/** Модуль A4 (ADR-0050): фабрика, цілі, контракт історії, запуски в моках і сценарії. */
const BASE = "http://erp-import.test/api/v1"
const COMPANY = "c1"
const OTHER = "c2"
const RATE = 1000
const DONE_AFTER_MS = 60_000

const person = (id: string, permissions: string[]): MockUser => ({
  id,
  name: `Людина ${id}`,
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
const OPERATOR = person("operator", [
  "contacts:*",
  "taxes:*",
  "import-runs:read",
])
const OWN_RUNS = person("own-runs", ["contacts:*", "import-runs:read:own"])
const NO_HISTORY = person("no-history", ["contacts:*"])

let clock = 1_000_000
const contacts = createContactsMocks({ baseUrl: BASE })
const dictionaries = createDictionariesMocks({
  baseUrl: BASE,
  companies: [COMPANY, OTHER],
})
const mocks = createImportExportMocks({
  baseUrl: BASE,
  companies: [COMPANY, OTHER],
  now: () => clock,
  targets: [
    importTargetMock({
      baseUrl: BASE,
      resource: CONTACTS,
      db: contacts.db.contacts,
      perSecond: RATE,
      now: () => clock,
    }),
    importTargetMock({
      resource: "taxes",
      db: dictionaries.db.taxes,
      perSecond: RATE,
    }),
  ],
})
const server = setupServer(
  ...createPlatformHandlers({
    users: [OPERATOR, OWN_RUNS, NO_HISTORY],
    baseUrl: BASE,
  }),
  ...createJobHandlers({ baseUrl: BASE, now: () => clock }),
  ...mocks.handlers,
  ...contacts.handlers,
  ...dictionaries.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const runs = (filter: Record<string, unknown> = {}) =>
  provider.getList<ImportRun>(IMPORT_RUNS, {
    filter,
    pagination: { page: 1, perPage: 50 },
    sort: { field: "startedAt", order: "DESC" },
  })

let requests = 0
const request = (rows: ImportRequest["rows"]): ImportRequest => {
  requests += 1
  return {
    requestId: `run-${String(requests)}`,
    fileName: "контакти.xlsx",
    matchField: "email",
    onDuplicate: "skip",
    rows,
  }
}

const ROWS: ImportRequest["rows"] = [
  { row: 2, values: { name: "Нова людина", email: "new@test.example" } },
  { row: 3, values: { name: "Ще одна", email: "more@test.example" } },
]

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  setCompanyId(COMPANY)
  signInMock(OPERATOR.id)
})
afterEach(() => {
  resetScenarios()
  resetMockJobs()
  mocks.db.runs.reset()
  contacts.db.contacts.reset()
  setCompanyId(null)
})
afterAll(() => {
  server.close()
})

describe("модуль A4: фабрика", () => {
  it("адреси від basePath, цілі першими, адреса модуля веде на них", () => {
    const module = createImportExportModule({ basePath: "/settings/" })
    expect(module.id).toBe("A4")
    expect(module.routes.map((route) => route.path)).toEqual([
      "/settings/import-export",
      "/settings/import-export/:target",
      "/settings/import-history",
      "/settings/",
    ])
    expect(module.nav.map((item) => [item.id, item.access])).toEqual([
      ["A4-targets", undefined],
      ["A4-history", { resource: IMPORT_RUNS, action: "read" }],
    ])
    expect(importRunPath(module.paths, "contacts")).toBe(
      "/settings/import-export/contacts",
    )
  })

  it("`history.page: false` прибирає сторінку й пункт", () => {
    const module = createImportExportModule({
      extension: { history: { page: false } },
    })
    expect(module.routes.map((route) => route.path)).toEqual([
      "/import-export",
      "/import-export/:target",
    ])
    expect(module.nav.map((item) => item.id)).toEqual(["A4-targets"])
  })

  it("чужа ціль в адресі не ламає шлях", () => {
    const { paths } = createImportExportModule()
    expect(importRunPath(paths, "a/b")).toBe("/import-export/a%2Fb")
  })
})

describe("модуль A4: цілі", () => {
  it("поле збігу кожної цілі є серед її полів", () => {
    for (const target of MODULE_TARGETS)
      if ("matchField" in target && target.matchField)
        expect(target.fields.map(({ key }) => key)).toContain(target.matchField)
  })

  it("мова інтерфейсу: підписи, варіанти, приклади", () => {
    const [, organizations] = MODULE_TARGETS
    expect(localizeTarget(organizations, "en").label).toBe("Organizations")
    const uk = localizeTarget(organizations, "uk")
    expect(uk.fields[1]?.options?.[1]).toEqual({ value: "fop", label: "ФОП" })
    expect(templateRows(uk.fields)[1]?.[0]).toBe("ТОВ Зоря")
  })

  it("телефон іде на сервер у E.164, сміття — помилка рядка", () => {
    const phone = localizeTarget(CONTACTS_TARGET, "uk").fields.find(
      ({ key }) => key === "phone",
    )
    if (!phone) throw new Error("no phone field")
    expect(parseCell(phone, "067 123 45 67")).toEqual({
      value: "+380671234567",
    })
    expect(parseCell(phone, 380671234567)).toEqual({ value: "+380671234567" })
    expect(parseCell(phone, "не номер")).toEqual({ code: "invalid" })
  })

  it("експорт: ті самі назви, що в шаблоні, підпис варіанта й порожнє", () => {
    const [, organizations] = MODULE_TARGETS
    const target = localizeTarget(organizations, "uk")
    const columns = targetColumns(target)
    expect(columns.map(({ label }) => label)).toEqual(
      templateRows(target.fields)[0],
    )
    const record = { id: "1", name: "Зоря", type: "fop", code: "" } as RaRecord
    expect(columns.map((column) => column.value(record))).toEqual([
      "Зоря",
      "ФОП",
      null,
      null,
      null,
      null,
    ])
  })
})

describe("модуль A4: історія", () => {
  it("фікстури проходять схему й покривають стани, кожна компанія своя", () => {
    const { runs: fixtures } = createImportExportFixtures({
      companies: [COMPANY, OTHER],
      now: clock,
    })
    for (const run of fixtures) expect(importRunSchema.parse(run)).toEqual(run)
    expect(new Set(fixtures.map(({ id }) => id)).size).toBe(fixtures.length)
    const statuses = new Set(fixtures.map(({ status }) => status))
    expect(IMPORT_RUN_STATUSES.filter((s) => !statuses.has(s))).toEqual([
      "running",
    ])
  })

  it("лише записи компанії запиту, фільтри й пошук", async () => {
    const { data, total } = await runs()
    expect(total).toBe(4)
    expect(data.every(({ companyId }) => companyId === COMPANY)).toBe(true)
    expect((await runs({ status: "partial" })).total).toBe(1)
    expect((await runs({ target: "units" })).total).toBe(1)
    expect((await runs({ q: "контрагенти" })).total).toBe(1)
  })

  it("без права — 403, `read:own` — лише свої запуски", async () => {
    signInMock(NO_HISTORY.id)
    const denied = await runs().catch((error: unknown) => error)
    expect(isApiError(denied) && denied.status).toBe(403)

    signInMock(OWN_RUNS.id)
    expect((await runs()).total).toBe(0)
    await provider.startImport(CONTACTS, request(ROWS))
    const { data } = await runs()
    expect(data.map(({ startedBy }) => startedBy)).toEqual([OWN_RUNS.id])
  })
})

describe("модуль A4: запуск у моках", () => {
  it("новий запуск видно одразу, потім він наздоганяє задачу", async () => {
    await provider.startImport(CONTACTS, request(ROWS))
    const started = (await runs({ status: "running" })).data[0]
    expect(started).toMatchObject({
      target: CONTACTS,
      fileName: "контакти.xlsx",
      total: 2,
      created: 0,
      startedBy: OPERATOR.id,
      startedByName: OPERATOR.name,
      finishedAt: null,
    })
    if (started) expect(importRunSchema.parse(started)).toBeTruthy()

    clock += DONE_AFTER_MS
    const { data } = await runs({ status: "done" })
    expect(data[0]).toMatchObject({
      id: started?.id,
      created: 2,
      failed: 0,
    })
    expect(data[0]?.finishedAt).not.toBeNull()
    expect((await runs({ status: "running" })).total).toBe(0)
  })

  it("новий контакт дістає поля, яких немає в рядку", async () => {
    const check = await provider.checkImport(CONTACTS, request(ROWS))
    expect(check.rows.map(({ action }) => action)).toEqual(["create", "create"])
    await provider.startImport(CONTACTS, request(ROWS))
    clock += DONE_AFTER_MS
    await runs()
    const { data } = await provider.getList(CONTACTS, {
      filter: { q: "Нова людина" },
      pagination: { page: 1, perPage: 5 },
      sort: { field: "name", order: "ASC" },
    })
    expect(data[0]).toMatchObject({
      position: "",
      phone: "",
      organizationId: null,
      responsibleId: OPERATOR.id,
    })
  })

  it("той самий `requestId` — той самий запуск, другого запису немає", async () => {
    const body = request(ROWS)
    const first = await provider.startImport(CONTACTS, body)
    const again = await provider.startImport(CONTACTS, body)
    expect(again.jobId).toBe(first.jobId)
    expect((await runs({ status: "running" })).total).toBe(1)
  })

  it("частковий запуск несе причини й номери рядків", async () => {
    await provider.startImport("taxes", {
      ...request([
        { row: 2, values: { name: "Новий податок", rate: 5 } },
        { row: 7, values: { name: "Без ставки", rate: 999 } },
      ]),
      matchField: "name",
    })
    clock += DONE_AFTER_MS
    const { data } = await runs({ status: "partial" })
    const run = data.find(({ target }) => target === "taxes")
    expect(run).toMatchObject({ created: 1, failed: 1 })
    expect(run?.failures[0]?.items[0]?.id).toBe("7")
  })
})

describe("модуль A4: сценарії", () => {
  it.each([
    ["error", 500],
    ["forbidden", 403],
  ] as const)("%s", async (scenario, status) => {
    setScenario(scenario, IMPORT_RUNS)
    const failure = await runs().catch((error: unknown) => error)
    expect(isApiError(failure) && failure.status).toBe(status)
  })

  it("empty порожнить історію, а `offline` — мережева помилка", async () => {
    setScenario("empty", IMPORT_RUNS)
    expect((await runs()).total).toBe(0)
    setScenario("offline", IMPORT_RUNS)
    await expect(runs()).rejects.toBeTruthy()
  })

  it("сценарій цілі стосується імпорту, а не історії", async () => {
    setScenario("error", CONTACTS)
    const failure = await provider
      .startImport(CONTACTS, request(ROWS))
      .catch((error: unknown) => error)
    expect(isApiError(failure) && failure.status).toBe(500)
    expect((await runs()).total).toBe(4)
  })
})
