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
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  activeFilters,
  clearFilters,
  emptyFilter,
  filterIssue,
  filterValueText,
  normalizeFilter,
  readFilter,
  writeFilter,
  type FilterDefinition,
} from "@/registry/lib/filters"
import {
  hasListParams,
  listParamsOf,
  listQueryFilter,
  listStateFromParams,
  listStateToParams,
  sameListState,
  type ListDefaults,
  type ListTab,
} from "@/registry/lib/list-state"
import { setScenario, resetScenarios } from "@/registry/lib/mock-scenarios"
import { createSavedViewHandlers } from "@/registry/lib/mock-views"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  DUPLICATE_VIEW_NAME,
  SAVED_VIEWS_RESOURCE,
  upsertView,
  type SavedView,
} from "@/registry/lib/saved-views"

const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
}
const TABS: ListTab[] = [
  { id: "all", label: "Усі", filter: {} },
  { id: "overdue", label: "Прострочені", filter: { status: "overdue" } },
]

describe("lib/list-state", () => {
  it("пише в адресу лише те, що не за замовчуванням, і читає назад", () => {
    const state = {
      tab: "overdue",
      filter: { client: ["Б", "А"], amount_gte: 100000, q: "агро" },
      sort: { field: "amount", order: "ASC" as const },
    }
    const params = listStateToParams(state, DEFAULTS, "view-1")
    expect(params.toString()).toBe(
      "view=view-1&tab=overdue&amount_gte=100000&client=%D0%90&client=%D0%91&q=%D0%B0%D0%B3%D1%80%D0%BE&sort=amount",
    )
    const back = listStateFromParams(params, DEFAULTS, TABS)
    expect(sameListState(back, state)).toBe(true)
    expect(back.filter).toEqual({
      amount_gte: "100000",
      client: ["А", "Б"],
      q: "агро",
    })
    expect(listStateToParams({ ...DEFAULTS, filter: {} }, DEFAULTS).size).toBe(
      0,
    )
  })

  it("невідома вкладка й сортування — за замовчуванням; службові ключі — не фільтри", () => {
    const state = listStateFromParams(
      new URLSearchParams("tab=nope&sort=&page=2&perPage=10&view=x&status="),
      DEFAULTS,
      TABS,
    )
    expect(state).toEqual({ tab: "all", filter: {}, sort: DEFAULTS.sort })
    expect(
      listStateFromParams(new URLSearchParams("sort=-number"), DEFAULTS).sort,
    ).toEqual({ field: "number", order: "DESC" })
  })

  it("порівняння не залежить від порядку, типу й порожніх значень", () => {
    const a = { ...DEFAULTS, filter: { client: ["А", "Б"], amount_gte: 5 } }
    const b = {
      ...DEFAULTS,
      filter: { amount_gte: "5", client: ["Б", "А"], q: "" },
    }
    expect(sameListState(a, b)).toBe(true)
    expect(sameListState(a, { ...b, tab: "overdue" })).toBe(false)
    expect(
      sameListState(a, { ...b, sort: { field: "date", order: "ASC" } }),
    ).toBe(false)
  })

  it("адреса без параметрів списку — «начисто»", () => {
    expect(hasListParams(new URLSearchParams(""))).toBe(false)
    expect(hasListParams(new URLSearchParams("page=2"))).toBe(false)
    expect(hasListParams(new URLSearchParams("view=standard"))).toBe(true)
  })

  it("фільтр запиту — фільтр вкладки поверх панелі; вид — без view", () => {
    const state = { tab: "overdue", filter: { status: "paid", q: "x" } }
    expect(listQueryFilter(state, TABS)).toEqual({ status: "overdue", q: "x" })
    expect(
      listParamsOf(
        { ...state, sort: DEFAULTS.sort, filter: { client: "А" } },
        DEFAULTS,
      ),
    ).toBe("tab=overdue&client=%D0%90")
  })
})

const CLIENT: FilterDefinition = {
  kind: "options",
  id: "client",
  field: "client",
  label: "Клієнт",
  options: [
    { value: "a", label: "А" },
    { value: "b", label: "Б" },
  ],
}
const DATE: FilterDefinition = {
  kind: "date-range",
  id: "date",
  field: "date",
  label: "Дата",
}
const AMOUNT: FilterDefinition = {
  kind: "money-range",
  id: "amount",
  field: "amount",
  label: "Сума",
  currency: "UAH",
}

describe("lib/filters", () => {
  it("читає значення з параметрів і пропускає те, що не розібрати", () => {
    const filter = {
      client: "a",
      date_gte: "2026-01-01",
      date_lte: "2026-13-40",
      amount_gte: "abc",
      amount_lte: "500000",
    }
    expect(readFilter(CLIENT, filter)).toEqual({
      kind: "options",
      values: ["a"],
    })
    expect(readFilter(DATE, filter)).toEqual({
      kind: "date-range",
      from: "2026-01-01",
      to: null,
    })
    expect(readFilter(AMOUNT, filter)).toEqual({
      kind: "money-range",
      from: null,
      to: 500000,
    })
  })

  it("сума поза безпечним цілим неактивна; у запит — лише описане й розібране", () => {
    expect(readFilter(AMOUNT, { amount_gte: "99999999999999999999" })).toEqual({
      kind: "money-range",
      from: null,
      to: null,
    })
    expect(
      normalizeFilter([CLIENT, AMOUNT], {
        q: ["a", "b"],
        client: ["x", "x"],
        amount_gte: "abc",
        amount_lte: ["500", "700"],
        utm_source: "mail",
      }),
    ).toEqual({ q: "a", client: ["x"], amount_lte: 500 })
    expect(() =>
      writeFilter(CLIENT, {}, { kind: "money-range", from: 1, to: null }),
    ).toThrow()
  })

  it("пише значення й прибирає порожні ключі", () => {
    const base = { q: "x", client: "a", amount_gte: 1 }
    const next = writeFilter(AMOUNT, base, {
      kind: "money-range",
      from: null,
      to: 900,
    })
    expect(next).toEqual({ q: "x", client: "a", amount_lte: 900 })
    expect(writeFilter(CLIENT, next, { kind: "options", values: [] })).toEqual({
      q: "x",
      amount_lte: 900,
    })
  })

  it("діапазон із початком після кінця — помилка", () => {
    expect(filterIssue({ kind: "money-range", from: 10, to: 5 })).toBe("range")
    expect(
      filterIssue({ kind: "date-range", from: "2026-02-01", to: "2026-01-31" }),
    ).toBe("range")
    expect(
      filterIssue({ kind: "date-range", from: "2026-01-01", to: null }),
    ).toBe(null)
  })

  it("активні фільтри й «Скинути» лишають пошук", () => {
    const filter = { q: "агро", client: ["a", "b"], date_lte: "2026-03-31" }
    expect(
      activeFilters([CLIENT, DATE, AMOUNT], filter).map(
        (item) => item.definition.id,
      ),
    ).toEqual(["client", "date"])
    expect(clearFilters([CLIENT, DATE, AMOUNT], filter)).toEqual({ q: "агро" })
  })
})

describe("lib/filters — текст чипа", () => {
  const format = {
    date: (v: string) => `d(${v})`,
    dateRange: (a: string, b: string) => `${a}..${b}`,
    money: (amount: number, currency: string) =>
      `${String(amount)} ${currency}`,
    from: (v: string) => `від ${v}`,
    to: (v: string) => `до ${v}`,
    between: (a: string, b: string) => `від ${a} до ${b}`,
  }
  it("назви варіантів, період, межі суми", () => {
    expect(
      filterValueText(CLIENT, { kind: "options", values: ["b", "x"] }, format),
    ).toBe("Б, x")
    expect(
      filterValueText(
        DATE,
        { kind: "date-range", from: "2026-01-01", to: "2026-03-31" },
        format,
      ),
    ).toBe("2026-01-01..2026-03-31")
    expect(
      filterValueText(
        DATE,
        { kind: "date-range", from: null, to: "2026-03-31" },
        format,
      ),
    ).toBe("до d(2026-03-31)")
    expect(
      filterValueText(
        AMOUNT,
        { kind: "money-range", from: 100, to: 900 },
        format,
      ),
    ).toBe("від 100 UAH до 900 UAH")
    expect(emptyFilter({ kind: "money-range", from: 1, to: 2 })).toEqual({
      kind: "money-range",
      from: null,
      to: null,
    })
  })
})

const BASE = "http://erp.test/api/v1"
const users: MockUser[] = [
  {
    id: "u1",
    name: "Олена Коваль",
    email: "olena@test.example",
    password: "demo-password",
    totpCode: "111111",
    roles: ["admin"],
    permissions: [],
    companies: [{ id: "c1", name: "ТОВ «Тест»" }],
    companyId: "c1",
    factors: [],
  },
  {
    id: "u2",
    name: "Іван Петренко",
    email: "ivan@test.example",
    password: "demo-password",
    totpCode: "222222",
    roles: ["sales"],
    permissions: [],
    companies: [{ id: "c1", name: "ТОВ «Тест»" }],
    companyId: "c1",
    factors: [],
  },
]
const server = setupServer(
  ...createPlatformHandlers({ users, baseUrl: BASE }),
  ...createSavedViewHandlers({ baseUrl: BASE }),
)
const provider = createDataProvider(createApiClient({ baseUrl: BASE }))
const list = async (resource = "invoices") =>
  (
    await provider.getList<SavedView>(SAVED_VIEWS_RESOURCE, {
      filter: { resource },
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
    })
  ).data
const create = (name: string, isDefault = false, resource = "invoices") =>
  provider
    .create<SavedView>(SAVED_VIEWS_RESOURCE, {
      data: { resource, name, params: "tab=overdue", isDefault },
    })
    .then(({ data }) => data)

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  localStorage.clear()
  resetScenarios()
  signInMock("u1")
})
afterEach(() => {
  server.resetHandlers()
})

describe("lib/saved-views", () => {
  it("upsertView: замінює чи додає; один вид за замовчуванням у ресурсі", () => {
    const a: SavedView = {
      id: "a",
      version: 1,
      resource: "invoices",
      name: "А",
      params: "",
      isDefault: true,
    }
    const b: SavedView = { ...a, id: "b", name: "Б", isDefault: false }
    const c: SavedView = { ...a, id: "c", resource: "users" }
    const next = upsertView([a, c], { ...b, isDefault: true }, (view) => ({
      ...view,
      version: view.version + 1,
    }))
    expect(next.map((v) => [v.id, v.isDefault, v.version])).toEqual([
      ["a", false, 2],
      ["c", true, 1],
      ["b", true, 1],
    ])
    expect(upsertView(next, { ...a, name: "Нова" })[0]?.name).toBe("Нова")
  })
})

describe("lib/mock-views — /me/views", () => {
  it("створює, сортує за назвою й тримає один вид за замовчуванням", async () => {
    await create("Прострочені", true)
    const second = await create("Великі суми", true)
    await create("Інший ресурс", true, "users")
    const views = await list()
    expect(views.map((v) => [v.name, v.isDefault])).toEqual([
      ["Великі суми", true],
      ["Прострочені", false],
    ])
    expect(second.version).toBe(1)
    expect((await list("users"))[0]?.isDefault).toBe(true)
  })

  it("назва, яка вже є, — 422 duplicate; інша версія — 409", async () => {
    const view = await create("Прострочені")
    const duplicate = await create(" прострочені ").catch((e: unknown) => e)
    expect(isApiError(duplicate) && duplicate.fieldErrors?.name).toBe(
      DUPLICATE_VIEW_NAME,
    )
    const renamed = await provider.update<SavedView>(SAVED_VIEWS_RESOURCE, {
      id: view.id,
      data: { ...view, name: "Борги" },
      previousData: view,
    })
    expect(renamed.data).toMatchObject({ name: "Борги", version: 2 })
    const stale = await provider
      .update<SavedView>(SAVED_VIEWS_RESOURCE, {
        id: view.id,
        data: { ...view, name: "Ще раз" },
        previousData: view,
      })
      .catch((e: unknown) => e)
    expect(isApiError(stale) && stale.code).toBe("conflict")
  })

  it("види бачить лише власник; видалення; сценарій ресурсу views", async () => {
    const view = await create("Мій")
    signInMock("u2")
    expect(await list()).toEqual([])
    signInMock("u1")
    await provider.delete(SAVED_VIEWS_RESOURCE, {
      id: view.id,
      previousData: view,
    })
    expect(await list()).toEqual([])
    setScenario("error", "views")
    const failed = await list().catch((e: unknown) => e)
    expect(isApiError(failed) && failed.status).toBe(500)
  })

  it("сценарій conflict: перше збереження — 409 з новою версією, повтор із нею проходить", async () => {
    const view = await create("Мій")
    setScenario("conflict", "views")
    const rename = (from: SavedView) =>
      provider.update<SavedView>(SAVED_VIEWS_RESOURCE, {
        id: from.id,
        data: { ...from, name: "Новий" },
        previousData: from,
      })
    const failed = await rename(view).catch((e: unknown) => e)
    expect(isApiError(failed) && failed.code).toBe("conflict")
    const current = (isApiError(failed) ? failed.current : null) as SavedView
    expect(current.version).toBe(2)
    expect((await rename(current)).data).toMatchObject({
      name: "Новий",
      version: 3,
    })
  })

  it("зіпсований запис у сховищі не стирає інших видів", async () => {
    const view = await create("Мій")
    const key = "erp-ui:mock-views:u1"
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[]
    localStorage.setItem(key, JSON.stringify([...stored, { id: 1 }]))
    expect((await list()).map((v) => v.id)).toEqual([view.id])
  })
})
