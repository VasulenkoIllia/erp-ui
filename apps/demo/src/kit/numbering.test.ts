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

import { ApiError, createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { createDataProvider } from "@/registry/lib/data-provider"
import { documentLifecycleSchema } from "@/registry/lib/document-lifecycle"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { createTransitionHandlers } from "@/registry/lib/mock-transitions"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  formatDocumentNumber,
  nextDocumentNumber,
  NUMBERING_COUNTERS,
  NUMBERING_SERIES,
  numberingTemplateIssue,
  type NumberingCounter,
  type NumberingSeries,
} from "@/registry/lib/numbering"
import type { StatusTransition } from "@/registry/lib/statuses"

/**
 * Крок PF03b (ADR-0058): шаблон номера, лічильники серії й номер на проведенні в моку переходів.
 */
const BASE = "http://erp.test/api/v1"

describe("шаблон номера (lib/numbering)", () => {
  const rules = { resetYearly: true, perBranch: false }

  it.each([
    ["РФ-{YYYY}-{####}", null],
    ["", "required"],
    ["   ", "required"],
    [`${"Р".repeat(38)}{#}`, "too_long"],
    ["РФ-{РРРР}-{####}", "unknown_token"],
    ["РФ-{YYYY-{####}", "unknown_token"],
    ["РФ}-{YYYY}-{####}", "unknown_token"],
    ["РФ-{YYYY}-{##########}", "unknown_token"],
    ["РФ-{YYYY}", "counter_required"],
    ["{YYYY}-{##}-{###}", "counter_duplicate"],
    ["РФ-{####}", "year_required"],
  ])("«%s» → %s", (template, issue) => {
    expect(numberingTemplateIssue(template, rules)).toBe(issue)
  })

  it("без скидання рік не потрібен, а лічильник кожної філії вимагає коду філії", () => {
    expect(
      numberingTemplateIssue("РФ-{####}", {
        resetYearly: false,
        perBranch: false,
      }),
    ).toBeNull()
    expect(
      numberingTemplateIssue("РФ-{YY}-{####}", {
        resetYearly: true,
        perBranch: true,
      }),
    ).toBe("branch_required")
    expect(
      numberingTemplateIssue("РФ-{BRANCH}/{YY}-{####}", {
        resetYearly: true,
        perBranch: true,
      }),
    ).toBeNull()
  })

  it("мітки: рік, рік двома цифрами, місяць, код філії, лічильник із нулями", () => {
    const input = { date: "2026-03-09", branchCode: "001", value: 7 }
    expect(formatDocumentNumber("РФ-{YYYY}-{####}", input)).toBe("РФ-2026-0007")
    expect(formatDocumentNumber("{BRANCH}/{YY}{MM}-{##}", input)).toBe(
      "001/2603-07",
    )
    expect(formatDocumentNumber("{#}", { ...input, value: 12_345 })).toBe(
      "12345",
    )
    expect(
      formatDocumentNumber("Ф{BRANCH}-{#}", { date: "2026-03-09", value: 1 }),
    ).toBe("Ф-1")
    expect(formatDocumentNumber("{X}", input)).toBeNull()
  })

  it("наступний номер — лічильник філії й року документа плюс один", () => {
    const series = {
      id: "s1",
      template: "{BRANCH}-{YYYY}-{###}",
      resetYearly: true,
      perBranch: true,
    }
    const counters: NumberingCounter[] = [
      { id: "a", series: "s1", branchId: "b1", year: 2026, value: 41 },
      { id: "b", series: "s1", branchId: null, year: 2026, value: 9 },
      { id: "c", series: "s2", branchId: "b1", year: 2026, value: 99 },
    ]
    expect(
      nextDocumentNumber(series, counters, {
        date: "2026-11-02",
        branchId: "b1",
        branchCode: "001",
      }),
    ).toBe("001-2026-042")
    expect(
      nextDocumentNumber(series, counters, {
        date: "2027-01-02",
        branchId: "b1",
        branchCode: "001",
      }),
    ).toBe("001-2027-001")
    expect(
      nextDocumentNumber({ ...series, perBranch: false }, counters, {
        date: "2026-11-02",
      }),
    ).toBe("-2026-010")
  })
})

const GRAPH = [
  { id: "submit", from: ["draft"], to: "submitted" },
  { id: "cancel", from: ["submitted"], to: "cancelled" },
  { id: "reverse", from: ["submitted"], to: "reversed" },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition[]

const docSchema = recordBaseSchema
  .extend({
    number: z.string().nullable(),
    status: z.string(),
    date: z.string(),
    branchId: z.string().nullable().optional(),
  })
  .extend(documentLifecycleSchema.shape)
type Doc = z.infer<typeof docSchema>

const draft = (id: string, date: string, branchId?: string): Doc => ({
  id,
  version: 1,
  number: null,
  status: "draft",
  docStatus: "draft",
  date,
  ...(branchId ? { branchId } : {}),
})

const docs = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "docs",
  schema: docSchema,
  data: () => [
    draft("d1", "2026-11-02"),
    draft("d2", "2026-11-02"),
    draft("d3", "2027-01-04"),
    draft("d4", "2026-11-02", "br-1"),
    {
      ...draft("d5", "2026-10-01"),
      number: "Д-2026-0002",
      status: "cancelled",
      docStatus: "cancelled",
    },
  ],
})

const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: [{ companyId: null, resource: "docs", template: "Д-{YYYY}-{####}" }],
  counters: [{ companyId: null, resource: "docs", year: 2026, value: 2 }],
  branchCode: (_, branchId) => (branchId === "br-1" ? "001" : undefined),
})

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [
      user("full", ["docs:*", "numbering-series:*"]),
      user("viewer", ["docs:*", "numbering-series:read"]),
      user("stranger", ["docs:*"]),
    ],
  }),
  ...createTransitionHandlers({
    baseUrl: BASE,
    resource: "docs",
    db: docs.db,
    transitions: GRAPH,
    amend: (doc) => ({ status: "draft", date: doc.date, number: "копія" }),
    reverse: (doc) => ({
      status: "submitted",
      date: "2026-11-02",
      number: doc.number,
    }),
    numbering: numbering.forResource({ resource: "docs", db: docs.db }),
  }),
  ...docs.handlers,
  ...numbering.handlers,
)
const data = createDataProvider(createApiClient({ baseUrl: BASE }))

const run = (id: string, action: string, version = 1) =>
  data.runTransition("docs", id, action, { version }) as Promise<Doc>
const stored = (id: string) => docs.db.all().find((doc) => doc.id === id)
const seriesId = () => numbering.db.all()[0]?.id ?? ""
const patchSeries = (changes: Partial<NumberingSeries>) =>
  data.update<NumberingSeries>(NUMBERING_SERIES, {
    id: seriesId(),
    data: changes,
    previousData: { id: seriesId(), version: 1 } as NumberingSeries,
  })

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  docs.db.reset()
  numbering.reset()
  resetScenarios()
  signInMock("full")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

const failure = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe("номер на проведенні (lib/mock-numbering + lib/mock-transitions)", () => {
  it("два одночасні проведення отримують різні номери, лічильник — обидва", async () => {
    setScenario("slow", "docs")
    const [first, second] = await Promise.all([
      run("d1", "submit"),
      run("d2", "submit"),
    ])
    expect(new Set([first.number, second.number])).toEqual(
      new Set(["Д-2026-0003", "Д-2026-0004"]),
    )
    const { data: counters } = await data.getList<NumberingCounter>(
      NUMBERING_COUNTERS,
      {
        filter: { series: seriesId() },
        pagination: { page: 1, perPage: 50 },
        sort: { field: "id", order: "ASC" },
      },
    )
    expect(counters.map(({ year, value }) => ({ year, value }))).toEqual([
      { year: 2026, value: 4 },
    ])
  })

  it("чернетка номера не має; номер з'являється лише на проведенні", async () => {
    expect(stored("d1")?.number).toBeNull()
    const submitted = await run("d1", "submit")
    expect(submitted.docStatus).toBe("submitted")
    expect(submitted.number).toBe("Д-2026-0003")
  })

  it("виправлена копія — чернетка без номера; сторно бере наступний номер серії", async () => {
    const amended = await run("d5", "amend")
    expect(amended.docStatus).toBe("draft")
    expect(amended.number).toBeNull()
    // Скасований лишає свій номер.
    expect(stored("d5")?.number).toBe("Д-2026-0002")
    const submitted = await run("d1", "submit")
    const reversal = await run("d1", "reverse", submitted.version)
    expect(reversal.number).toBe("Д-2026-0004")
  })

  it("зайнятий у компанії номер мок пропускає: номер не повторюється", async () => {
    docs.db.patch("d2", { number: "Д-2026-0003" })
    expect((await run("d1", "submit")).number).toBe("Д-2026-0004")
  })

  it("новий рік дати документа починає лічильник з 1", async () => {
    expect((await run("d3", "submit")).number).toBe("Д-2027-0001")
    expect((await run("d1", "submit")).number).toBe("Д-2026-0003")
  })

  it("лічильник кожної філії: код філії в номері, свій відлік", async () => {
    await patchSeries({ template: "Д-{BRANCH}-{YY}-{##}", perBranch: true })
    expect((await run("d4", "submit")).number).toBe("Д-001-26-01")
    // Документ без філії рахує спільний лічильник компанії.
    expect((await run("d1", "submit")).number).toBe("Д--26-03")
  })
})

describe("серії й лічильники: контракт моку", () => {
  it("хибний шаблон — 422 з кодом біля поля, серія не змінюється", async () => {
    const error = await failure(
      patchSeries({ template: "Д-{####}", resetYearly: true }),
    )
    expect(error.status).toBe(422)
    expect(error.fieldErrors).toEqual({ template: "year_required" })
    expect(numbering.db.all()[0]?.template).toBe("Д-{YYYY}-{####}")
  })

  it("лише перегляд — 403 на зміну; без права на серії — 403 і на лічильники", async () => {
    signInMock("viewer")
    expect(
      (await failure(patchSeries({ template: "Х-{YY}-{#}" }))).status,
    ).toBe(403)
    signInMock("stranger")
    const error = await failure(
      data.getList(NUMBERING_COUNTERS, {
        pagination: { page: 1, perPage: 50 },
        sort: { field: "id", order: "ASC" },
      }),
    )
    expect(error.status).toBe(403)
  })
})
