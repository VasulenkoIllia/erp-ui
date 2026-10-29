import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import { MemoryRouter } from "react-router-dom"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"

import { SecurityPolicyForm } from "@/registry/erp/security-policy-form"
import { createApiClient } from "@/registry/lib/api"
import { createAuthProvider, ME_QUERY_KEY } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createQueryClient } from "@/registry/lib/query-client"

/**
 * Крок A2c1 (ADR-0036): форма політики безпеки — лише перегляд зі свіжими даними без
 * перемонтування; фонове оновлення, зокрема невдале, не прибирає введене (SPEC §8.3).
 */

const BASE = "http://erp.test/api/v1"
const COMPANY = { id: "c1", name: "ТОВ «Тест»" }
const person = (id: string, roles: string[]): MockUser => ({
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
const users: MockUser[] = [
  person("a1", ["admin"]),
  { ...person("p0", ["admin"]), isPlatformAdmin: true },
]
const ROLES = [
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: ["security:*", "users:*"],
  },
]

const server = setupServer(
  ...createPlatformHandlers({ users, baseUrl: BASE, roles: ROLES }),
)

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  signInMock(null)
  localStorage.clear()
  setCompanyId(COMPANY.id)
})
afterEach(() => {
  server.resetHandlers()
})

async function renderForm(userId: string) {
  signInMock(userId)
  const queryClient = createQueryClient()
  const client = createApiClient({ baseUrl: BASE })
  const authProvider = createAuthProvider(client, { baseUrl: BASE })
  queryClient.setQueryData(ME_QUERY_KEY, await authProvider.getMe())
  render(
    <MemoryRouter>
      <CoreAdminContext authProvider={authProvider} queryClient={queryClient}>
        <SecurityPolicyForm />
      </CoreAdminContext>
    </MemoryRouter>,
  )
  return { queryClient }
}

async function refetch(queryClient: ReturnType<typeof createQueryClient>) {
  await act(() => queryClient.refetchQueries({ type: "active" }))
  // Підписників TanStack Query сповіщає наступною макрозадачею: чекаємо перемальовування.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

describe("SecurityPolicyForm — лише перегляд (ADR-0036)", () => {
  it("адміністратор компанії: пояснення, значення в порядку Tab, свіжі дані без втрати фокуса", async () => {
    const { queryClient } = await renderForm("a1")
    expect(
      await screen.findByText(/Лише перегляд: політика одна для всіх компаній/),
    ).toBeVisible()
    const ips = screen.getByLabelText("Адреси й мережі")
    expect(ips).toHaveAttribute("readonly")
    for (const input of screen.getAllByRole("spinbutton"))
      expect(input).toHaveAttribute("readonly")
    expect(
      screen.queryByRole("button", { name: "Зберегти політику" }),
    ).not.toBeInTheDocument()

    ips.focus()
    // Платформа тим часом змінила список адрес.
    server.use(
      http.get(`${BASE}/security-policy`, () =>
        HttpResponse.json({
          policy: {
            twoFactor: "off",
            twoFactorRoles: [],
            allowedFactors: ["totp", "email"],
            passwordless: [],
            ssoProviders: [],
            password: { minLength: 8, expiryDays: null, preventReuse: 0 },
            sessionMinutes: 480,
            idleTimeoutMinutes: null,
            trustedDeviceDays: 30,
            ipAllowlist: ["198.51.100.0/24"],
          },
          options: { roles: [], providers: [] },
          canUpdate: false,
        }),
      ),
    )
    await refetch(queryClient)
    expect(await screen.findByDisplayValue("198.51.100.0/24")).toBe(ips)
    expect(ips).toHaveFocus()
  })

  it("адміністратор платформи: фонове оновлення, і невдале теж, не прибирає введене", async () => {
    const user = userEvent.setup()
    const { queryClient } = await renderForm("p0")
    const ips = await screen.findByLabelText("Адреси й мережі")
    expect(ips).not.toHaveAttribute("readonly")
    await user.type(ips, "198.51.100.0/24")

    await refetch(queryClient)
    expect(screen.getByLabelText("Адреси й мережі")).toHaveValue(
      "198.51.100.0/24",
    )

    server.use(
      http.get(`${BASE}/security-policy`, () =>
        HttpResponse.json(
          { code: "forbidden", message: "Forbidden" },
          { status: 403 },
        ),
      ),
    )
    await refetch(queryClient)
    // Фонове оновлення справді впало: дані лишились, стан — помилка.
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .some((query) => query.state.status === "error" && query.state.data),
    ).toBe(true)
    expect(screen.getByLabelText("Адреси й мережі")).toHaveValue(
      "198.51.100.0/24",
    )
    expect(
      screen.getByRole("button", { name: "Зберегти політику" }),
    ).toBeVisible()
  })
})
