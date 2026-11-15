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
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { resetScenarios } from "@/registry/lib/mock-scenarios"
import { createTrashMocks } from "@/registry/lib/mock-trash"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createTrashApi, RESTORE_CONFLICT } from "@/registry/lib/trash"
import {
  CREATE_ORDER,
  orderCardSchemaFor,
  ORDERS,
  QUOTES,
  type QuoteCard,
} from "@/registry/modules/B3-sales/contract"
import {
  createSalesMocks,
  salesNumberingSeeds,
} from "@/registry/modules/B3-sales/mocks"

/**
 * Крок PF16 (ADR-0095), кошик у модулі B3: видалена чернетка замовлення звільняє пропозицію, відновлення
 * займає її знову; пропозиція вже дала інше замовлення — 409; кошик однієї компанії не видно з іншої.
 */
const BASE = "http://erp-sales-trash.test/api/v1"
const COMPANY = "c1"
const OTHER = "c2"
const TODAY = "2026-11-08"
/** Прийнята пропозиція засіву без замовлення. */
const ACCEPTED = "qt-c1-05"

const MANAGER: MockUser = {
  id: "manager",
  name: "manager",
  email: "manager@test.example",
  password: "demo-password",
  totpCode: "111111",
  roles: [],
  permissions: ["quotes:*", "orders:*"],
  companies: [
    { id: COMPANY, name: "ТОВ «Тест»" },
    { id: OTHER, name: "ФОП Тестенко" },
  ],
  companyId: COMPANY,
  factors: [],
}

const options = { companies: [COMPANY, OTHER], today: TODAY } as const
const seeds = salesNumberingSeeds(options)
const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: [...seeds.series],
  counters: [...seeds.counters],
})
const trash = createTrashMocks({ baseUrl: BASE })
const mocks = createSalesMocks({
  ...options,
  baseUrl: BASE,
  numbering,
  trash: { bin: trash.bin },
})
const server = setupServer(
  ...createPlatformHandlers({ users: [MANAGER], baseUrl: BASE }),
  ...numbering.handlers,
  ...trash.handlers,
  ...mocks.handlers,
)
const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
const provider = createDataProvider(client)
const api = createTrashApi(client)
const orderSchema = orderCardSchemaFor()

const quote = (id: string) =>
  provider.getOne<QuoteCard>(QUOTES, { id }).then(({ data }) => data)
const createOrder = async (id: string) => {
  const { version } = await quote(id)
  return orderSchema.parse(
    await provider.runTransition(QUOTES, id, CREATE_ORDER, { version }),
  )
}
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}
const trashedOrders = async () =>
  (await api.list(ORDERS, 1, 20)).data.map((entry) => entry.id)

describe("модуль B3: кошик замовлень (мок)", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    trash.reset()
    mocks.db.quotes.reset()
    mocks.db.orders.reset()
    setCompanyId(COMPANY)
    signInMock(MANAGER.id)
  })
  afterEach(() => {
    resetScenarios()
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })

  it("відновлене замовлення знову займає пропозицію, версія нова", async () => {
    const created = await createOrder(ACCEPTED)
    await provider.delete(ORDERS, { id: created.id })
    expect((await quote(ACCEPTED)).orderId).toBeNull()
    expect(await trashedOrders()).toContain(created.id)
    const restored = await api.restore(ORDERS, created.id)
    expect(restored.version).toBe(created.version + 1)
    expect((await quote(ACCEPTED)).orderId).toBe(created.id)
    expect(await trashedOrders()).not.toContain(created.id)
  })

  it("пропозиція вже дала інше замовлення — 409 restore_conflict, перше лишається в кошику", async () => {
    const first = await createOrder(ACCEPTED)
    await provider.delete(ORDERS, { id: first.id })
    const second = await createOrder(ACCEPTED)
    const conflict = await failureOf(api.restore(ORDERS, first.id))
    expect(conflict.status).toBe(409)
    expect(conflict.code).toBe(RESTORE_CONFLICT)
    expect((await quote(ACCEPTED)).orderId).toBe(second.id)
    expect(await trashedOrders()).toContain(first.id)
  })

  it("кошик компанії: з іншої компанії запису не видно й не відновити", async () => {
    const created = await createOrder(ACCEPTED)
    await provider.delete(ORDERS, { id: created.id })
    setCompanyId(OTHER)
    expect(await trashedOrders()).not.toContain(created.id)
    expect((await failureOf(api.restore(ORDERS, created.id))).status).toBe(404)
    setCompanyId(COMPANY)
    expect(await trashedOrders()).toContain(created.id)
  })
})
