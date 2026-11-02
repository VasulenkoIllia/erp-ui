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
import { createDataProvider } from "@/registry/lib/data-provider"
import { addDays, todayIn } from "@/registry/lib/dates"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { recordDenial } from "@/registry/lib/record-access"
import {
  createCompanyModule,
  type Currency,
  type ExchangeRate,
} from "@/registry/modules/A1-company"
import {
  CURRENCIES,
  EXCHANGE_RATES,
  RATE_SOURCE_DENIAL,
  rateSchemaFor,
} from "@/registry/modules/A1-company/contract"
import { createCompanyFixtures } from "@/registry/modules/A1-company/fixtures"
import { createCompanyMocks } from "@/registry/modules/A1-company/mocks"

import { companyMockExtension } from "@/extensions/A1-company-fields"
import { COMPANY_PROFILES } from "@/mocks/team"

const BASE = "http://erp-company.test/api/v1"
const COMPANY = { id: "c1", name: "ТОВ «Тест»" }
const OTHER = { id: "c2", name: "ФОП Тестенко" }

const person = (id: string, roles: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies: [COMPANY, OTHER],
  companyId: COMPANY.id,
  factors: [],
})

const server = setupServer(
  ...createPlatformHandlers({
    users: [person("admin", ["admin"]), person("viewer", ["viewer"])],
    baseUrl: BASE,
    companyProfiles: {
      c1: COMPANY_PROFILES.zoriana,
      c2: COMPANY_PROFILES.zoriana,
    },
    roles: [
      {
        id: "admin",
        name: { uk: "Адміністратор", en: "Administrator" },
        permissions: ["company:*", "currencies:*", "exchange-rates:*"],
      },
      {
        id: "viewer",
        name: { uk: "Перегляд", en: "Viewer" },
        permissions: ["currencies:read", "exchange-rates:read"],
      },
    ],
  }),
  ...createCompanyMocks({
    baseUrl: BASE,
    companies: [COMPANY.id, OTHER.id],
    extension: companyMockExtension,
  }).handlers,
)

const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
const provider = createDataProvider(client)
const auth = createAuthProvider(client, { baseUrl: BASE })

const listCurrencies = () =>
  provider.getList<Currency>(CURRENCIES, {
    filter: {},
    pagination: { page: 1, perPage: 50 },
    sort: { field: "code", order: "ASC" },
  })
const listRates = (filter: Record<string, unknown> = {}) =>
  provider.getList<ExchangeRate>(EXCHANGE_RATES, {
    filter,
    pagination: { page: 1, perPage: 100 },
    sort: { field: "date", order: "DESC" },
  })
const currencyOf = async (code: string) => {
  const { data } = await listCurrencies()
  const found = data.find((currency) => currency.code === code)
  if (!found) throw new Error(`no currency ${code}`)
  return found
}
const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (isApiError(error) ? error : null),
  )

/** Дати фікстур відносні, тож завжди новіша за них. */
const TOMORROW = addDays(todayIn(), 1)

describe("фікстури A1", () => {
  it("кожна компанія має свої валюти й курси, id не повторюються", () => {
    const { currencies, rates } = createCompanyFixtures({
      companies: ["a", "b"],
    })
    expect(currencies.filter((row) => row.companyId === "a")).toHaveLength(4)
    expect(currencies.filter((row) => row.companyId === "b")).toHaveLength(4)
    expect(new Set(currencies.map((row) => row.id)).size).toBe(
      currencies.length,
    )
    expect(new Set(rates.map((row) => row.id)).size).toBe(rates.length)
  })

  it("найновіший курс валюти заповнено; вимкнена валюта курсів не має", () => {
    const { currencies, rates } = createCompanyFixtures()
    const usd = currencies.find((row) => row.code === "USD")
    const dates = rates
      .filter((row) => row.currency === "USD")
      .map((row) => row.date)
      .sort()
    expect(usd?.latestRateDate).toBe(dates.at(-1))
    const gbp = currencies.find((row) => row.code === "GBP")
    expect(gbp).toMatchObject({ active: false })
    expect(gbp?.latestRate ?? null).toBeNull()
  })
})

describe("моки A1", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })
  beforeEach(() => {
    localStorage.clear()
    applyMockRoles()
    resetScenarios()
    signInMock("admin")
    setCompanyId(COMPANY.id)
  })
  afterEach(() => {
    server.resetHandlers()
  })

  it("валюти й курси — лише компанії запиту", async () => {
    const { data, total } = await listCurrencies()
    expect(total).toBeGreaterThanOrEqual(4)
    expect(new Set(data.map((row) => row.companyId))).toEqual(
      new Set([COMPANY.id]),
    )
    setCompanyId(OTHER.id)
    const other = await listCurrencies()
    expect(new Set(other.data.map((row) => row.companyId))).toEqual(
      new Set([OTHER.id]),
    )
  })

  it("той самий код валюти — 422 біля поля", async () => {
    const error = await failureOf(
      provider.create(CURRENCIES, { data: { code: "USD" } }),
    )
    expect(error).toMatchObject({ status: 422 })
    expect(error?.fieldErrors?.code).toBe("duplicate")
  })

  it("новий курс оновлює найновіший курс валюти, а видалення повертає попередній", async () => {
    const before = await currencyOf("PLN")
    const { data: created } = await provider.create<ExchangeRate>(
      EXCHANGE_RATES,
      { data: { currency: "PLN", date: TOMORROW, rate: 12.5 } },
    )
    expect(created).toMatchObject({ source: "manual" })
    expect(await currencyOf("PLN")).toMatchObject({
      latestRate: 12.5,
      latestRateDate: TOMORROW,
    })
    await provider.delete(EXCHANGE_RATES, {
      id: created.id,
      previousData: created,
    })
    expect(await currencyOf("PLN")).toMatchObject({
      latestRate: before.latestRate,
      latestRateDate: before.latestRateDate,
    })
  })

  it("другий курс на ту саму валюту й дату — 422 біля дати, інша валюта на цю дату — можна", async () => {
    await provider.create(EXCHANGE_RATES, {
      data: { currency: "CHF", date: "2026-01-15", rate: 44 },
    })
    const error = await failureOf(
      provider.create(EXCHANGE_RATES, {
        data: { currency: "CHF", date: "2026-01-15", rate: 45 },
      }),
    )
    expect(error).toMatchObject({ status: 422 })
    expect(error?.fieldErrors?.date).toBe("duplicate")
    await expect(
      provider.create(EXCHANGE_RATES, {
        data: { currency: "SEK", date: "2026-01-15", rate: 4 },
      }),
    ).resolves.toBeTruthy()
  })

  it("зміна курсу на вже зайняту дату — 422, той самий запис — без помилки", async () => {
    const { data } = await listRates({ currency: "PLN" })
    const [latest, previous] = data
    if (!latest || !previous) throw new Error("no rates")
    const error = await failureOf(
      provider.update(EXCHANGE_RATES, {
        id: latest.id,
        data: { date: previous.date, version: latest.version },
        previousData: latest,
      }),
    )
    expect(error?.fieldErrors?.date).toBe("duplicate")
    await expect(
      provider.update(EXCHANGE_RATES, {
        id: latest.id,
        data: { rate: 11, version: latest.version },
        previousData: latest,
      }),
    ).resolves.toBeTruthy()
  })

  it("курс із НБУ не змінюється й не видаляється: причина в записі, 403 на запит", async () => {
    const { data } = await listRates({ currency: "USD" })
    const rate = data[0]
    if (!rate) throw new Error("no rates")
    expect(recordDenial(rate, "update")).toBe(RATE_SOURCE_DENIAL)
    expect(recordDenial(rate, "delete")).toBe(RATE_SOURCE_DENIAL)
    const update = await failureOf(
      provider.update(EXCHANGE_RATES, {
        id: rate.id,
        data: { rate: 1, version: rate.version },
        previousData: rate,
      }),
    )
    expect(update).toMatchObject({ status: 403 })
    const remove = await failureOf(
      provider.delete(EXCHANGE_RATES, { id: rate.id, previousData: rate }),
    )
    expect(remove).toMatchObject({ status: 403 })
  })

  it("без права — 403 на зміни, читати можна", async () => {
    signInMock("viewer")
    expect((await listRates()).total).toBeGreaterThan(0)
    const error = await failureOf(
      provider.create(EXCHANGE_RATES, {
        data: { currency: "PLN", date: TOMORROW, rate: 1 },
      }),
    )
    expect(error).toMatchObject({ status: 403 })
  })

  it("фільтри курсів: валюта, період, джерело", async () => {
    const { data } = await listRates({ source: "manual" })
    const currencies = new Set(data.map((row) => row.currency))
    expect(currencies.has("PLN")).toBe(true)
    expect(currencies.has("USD")).toBe(false)
    const [newest] = data.filter((row) => row.currency === "PLN")
    if (!newest) throw new Error("no rates")
    const single = await listRates({
      currency: "PLN",
      date_gte: newest.date,
      date_lte: newest.date,
    })
    expect(single.total).toBe(1)
  })

  it("сценарії ресурсу: empty — порожній список, forbidden — 403, conflict — 409", async () => {
    setScenario("empty", CURRENCIES)
    expect(await listCurrencies()).toMatchObject({ data: [], total: 0 })
    setScenario("forbidden", EXCHANGE_RATES)
    expect(await failureOf(listRates())).toMatchObject({ status: 403 })
    resetScenarios()
    const gbp = await currencyOf("GBP")
    setScenario("conflict", CURRENCIES)
    const error = await failureOf(
      provider.update(CURRENCIES, {
        id: gbp.id,
        data: { active: true, version: gbp.version },
        previousData: gbp,
      }),
    )
    expect(error).toMatchObject({ status: 409 })
  })

  it("`db.reset` повертає початкові значення", () => {
    const mocks = createCompanyMocks({ companies: [COMPANY.id] })
    const [first] = mocks.db.currencies.all()
    if (!first) throw new Error("no currencies")
    first.active = false
    mocks.db.currencies.reset()
    expect(mocks.db.currencies.all()[0]?.active).toBe(true)
  })

  it("поле розширення курсу зберігається за схемою проекту", async () => {
    const { data } = await provider.create<ExchangeRate & { note?: string }>(
      EXCHANGE_RATES,
      {
        data: {
          currency: "NOK",
          date: "2026-02-01",
          rate: 4,
          note: "Договір 7",
        },
      },
    )
    const schema = rateSchemaFor(companyMockExtension.rates)
    expect(schema.parse(data)).toMatchObject({ note: "Договір 7" })
  })

  describe("локалізація компанії", () => {
    it("PATCH змінює лише передане, решта лишається", async () => {
      const saved = await auth.company.update({
        baseCurrency: "eur",
        fiscalYearStartMonth: 4,
      })
      expect(saved).toMatchObject({
        baseCurrency: "EUR",
        fiscalYearStartMonth: 4,
        name: COMPANY_PROFILES.zoriana.name,
      })
    })

    it.each([
      ["baseCurrency", { baseCurrency: "гривня" }],
      ["language", { language: "ukrainian language" }],
      ["fiscalYearStartMonth", { fiscalYearStartMonth: 13 }],
    ])("%s: неправильне значення — 422 біля поля", async (field, patch) => {
      const error = await failureOf(auth.company.update(patch))
      expect(error).toMatchObject({ status: 422 })
      expect(error?.fieldErrors?.[field]).toBeTruthy()
    })

    it("порожнє значення й невідома мова чи часовий пояс — 422, null — можна", async () => {
      for (const [field, patch] of [
        ["baseCurrency", { baseCurrency: "" }],
        ["language", { language: "de" }],
        ["timezone", { timezone: "Mars/Olympus" }],
      ] as const) {
        const error = await failureOf(auth.company.update(patch))
        expect(error?.fieldErrors?.[field]).toBe("invalid")
      }
      await expect(
        auth.company.update({ baseCurrency: null }),
      ).resolves.toMatchObject({ baseCurrency: null })
    })

    it("сценарії: conflict — один 409, далі зберігає; forbidden — 403", async () => {
      setScenario("conflict", "company")
      expect(
        await failureOf(auth.company.update({ language: "en" })),
      ).toMatchObject({ status: 409 })
      await expect(
        auth.company.update({ language: "en" }),
      ).resolves.toMatchObject({ language: "en" })
      setScenario("forbidden", "company")
      expect(await failureOf(auth.company.get())).toMatchObject({ status: 403 })
    })

    it("без `company:update` — 403", async () => {
      signInMock("viewer")
      expect(
        await failureOf(auth.company.update({ language: "en" })),
      ).toMatchObject({ status: 403 })
    })
  })
})

describe("фабрика A1", () => {
  it("маршрути картки, валют і курсів; адреса модуля веде на картку", () => {
    const module = createCompanyModule({ basePath: "/m/A1" })
    expect(module.routes.map((route) => route.path)).toEqual([
      "/m/A1/company",
      "/m/A1/setup",
      "/m/A1/currencies",
      "/m/A1/exchange-rates",
      "/m/A1",
    ])
    expect(module.nav.map((item) => item.id)).toEqual([
      "A1-company",
      "A1-currencies",
      "A1-rates",
    ])
    expect(module.resources.map((resource) => resource.name)).toEqual([
      "company",
      "currencies",
      "exchange-rates",
    ])
  })

  it("`currencies.page: false` — без валют і курсів", () => {
    const module = createCompanyModule({
      basePath: "/settings",
      extension: { currencies: { page: false } },
    })
    expect(module.routes.map((route) => route.path)).toEqual([
      "/settings/company",
      "/settings/setup",
      "/settings",
    ])
    expect(module.nav.map((item) => item.id)).toEqual(["A1-company"])
  })

  it("`setup.page: false` — без адреси майстра", () => {
    const module = createCompanyModule({
      basePath: "/settings",
      extension: { setup: { page: false } },
    })
    expect(module.routes.map((route) => route.path)).not.toContain(
      "/settings/setup",
    )
  })
})
