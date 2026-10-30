import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import { MemoryRouter, useRoutes } from "react-router-dom"
import { toast } from "sonner"
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

import { AcceptInviteScreen } from "@/registry/erp/account-recovery"
import { createApiClient } from "@/registry/lib/api"
import { createAuthProvider } from "@/registry/lib/auth"
import { getCompanyId, setCompanyId } from "@/registry/lib/company-scope"
import {
  addMockUser,
  mockUsersList,
  removeMockUser,
  setMockUsers,
} from "@/registry/lib/mock-server"
import {
  createPlatformHandlers,
  signInMock,
  type MockInvite,
  type MockUser,
} from "@/registry/lib/mocks"
import { createQueryClient } from "@/registry/lib/query-client"

/**
 * Крок A2c3 (ADR-0040): екран прийняття запрошення там, де e2e демо не дістає: другий крок входу
 * людини з обліковим записом і адреса, що отримала обліковий запис, поки людина заповнювала форму.
 */

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

const BASE = "http://erp.test/api/v1"
const COMPANIES = [
  { id: "c1", name: "ТОВ «Тест»" },
  { id: "c2", name: "ФОП Тестенко" },
]
const NEW_ADDRESS = "new@zoriana.example"
const CODE = "123456"

const seed = (): MockUser[] => [
  {
    id: "u1",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    password: "demo-password",
    totpCode: CODE,
    roles: ["accountant"],
    permissions: ["invoices:*"],
    companies: COMPANIES.slice(0, 1),
    companyId: "c1",
    factors: ["totp"],
  },
  // Без другого кроку: вхід одним паролем одразу доходить до прийняття запрошення.
  {
    id: "u2",
    name: "Ірина Мельник",
    email: "iryna@zoriana.example",
    password: "demo-password",
    totpCode: CODE,
    roles: ["accountant"],
    permissions: ["invoices:*"],
    companies: COMPANIES.slice(0, 1),
    companyId: "c1",
    factors: [],
  },
]

const invited = (token: string, email: string): MockInvite => ({
  token,
  email,
  companyName: "ФОП Тестенко",
  invitedBy: "Ірина",
  user: {
    roles: ["accountant"],
    permissions: ["invoices:read"],
    companies: COMPANIES.slice(1),
    companyId: "c2",
  },
})

const server = setupServer(
  ...createPlatformHandlers({
    users: seed(),
    baseUrl: BASE,
    invites: [
      invited("for-account", "olena@zoriana.example"),
      invited("for-new-account", "iryna@zoriana.example"),
      invited("for-new", NEW_ADDRESS),
    ],
  }),
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
  setMockUsers(seed())
  setCompanyId(null)
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
})
afterEach(() => {
  server.resetHandlers()
})

function renderScreen(token: string) {
  const authProvider = createAuthProvider(createApiClient({ baseUrl: BASE }), {
    baseUrl: BASE,
  })
  function Routes() {
    return useRoutes([
      { path: "/home", element: <p>Застосунок</p> },
      {
        path: "*",
        element: <AcceptInviteScreen token={token} afterLogin="/home" />,
      },
    ])
  }
  render(
    <MemoryRouter initialEntries={["/login/invite"]}>
      <CoreAdminContext
        authProvider={authProvider}
        queryClient={createQueryClient()}
      >
        <Routes />
      </CoreAdminContext>
    </MemoryRouter>,
  )
}

describe("екран прийняття запрошення", () => {
  it("другий крок входу: запрошення приймається після коду, а не після пароля", async () => {
    const user = userEvent.setup()
    renderScreen("for-account")
    await user.type(await screen.findByLabelText("Пароль"), "demo-password")
    await user.click(screen.getByRole("button", { name: "Увійти" }))
    await screen.findByRole("heading", { name: "Підтвердьте вхід" })
    const person = mockUsersList().find((item) => item.id === "u1")
    expect(person?.companies.map((company) => company.id)).toEqual(["c1"])

    fireEvent.change(screen.getByLabelText("Код"), {
      target: { value: CODE },
    })
    await screen.findByText("Застосунок")
    expect(person?.companies.map((company) => company.id)).toEqual(["c1", "c2"])
    expect(getCompanyId()).toBe("c2")
    expect(toast.success).toHaveBeenCalledWith("Ви приєднались до ФОП Тестенко")
  })

  const acceptFails = (status: number) => {
    server.use(
      http.post(`${BASE}/auth/invite/accept`, () =>
        HttpResponse.json({ code: "server_error" }, { status }),
      ),
    )
  }

  it("збій після входу: людина лишається на екрані запрошення, причина й кнопка на місці", async () => {
    acceptFails(500)
    const user = userEvent.setup()
    renderScreen("for-new-account")
    await user.type(await screen.findByLabelText("Пароль"), "demo-password")
    await user.click(screen.getByRole("button", { name: "Увійти" }))

    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement()
    expect(
      screen.getByRole("button", { name: "Прийняти запрошення" }),
    ).toBeEnabled()
    expect(screen.queryByText("Застосунок")).toBeNull()
  })

  it("уже ввійшла: збій кнопки — причина над нею, кнопка знову активна", async () => {
    acceptFails(500)
    signInMock("u2")
    const user = userEvent.setup()
    renderScreen("for-new-account")
    await user.click(
      await screen.findByRole("button", { name: "Прийняти запрошення" }),
    )

    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement()
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Прийняти запрошення" }),
      ).toBeEnabled()
    })
  })

  it("адреса щойно отримала обліковий запис: замість нового пароля — вхід", async () => {
    const user = userEvent.setup()
    renderScreen("for-new")
    await user.type(await screen.findByLabelText("Ваше ім'я"), "Нова колега")
    await user.type(
      screen.getByLabelText("Новий пароль"),
      "мій-перший-пароль-тут",
    )
    addMockUser({ ...seed()[0], id: "u-new", email: NEW_ADDRESS })
    await user.click(screen.getByRole("button", { name: "Приєднатися" }))

    await screen.findByText("Увійдіть, щоб прийняти запрошення.", {
      exact: false,
    })
    await waitFor(() => {
      expect(screen.queryByLabelText("Новий пароль")).toBeNull()
    })
    expect(mockUsersList().filter((u) => u.email === NEW_ADDRESS)).toHaveLength(
      1,
    )
    expect(toast).toHaveBeenCalledWith("Ця адреса вже має обліковий запис")
    removeMockUser("u-new")
  })

  it("сервер без поля account відповів 409: форма лишається, причину видно", async () => {
    server.use(
      http.post(`${BASE}/auth/invite/accept`, () =>
        HttpResponse.json(
          { code: "conflict", message: "Taken" },
          { status: 409 },
        ),
      ),
      http.post(`${BASE}/auth/invite/check`, () =>
        HttpResponse.json({ email: NEW_ADDRESS, companyName: "ФОП Тестенко" }),
      ),
    )
    const user = userEvent.setup()
    renderScreen("for-new")
    await user.type(await screen.findByLabelText("Ваше ім'я"), "Нова колега")
    await user.type(
      screen.getByLabelText("Новий пароль"),
      "мій-перший-пароль-тут",
    )
    await user.click(screen.getByRole("button", { name: "Приєднатися" }))

    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement()
    expect(screen.getByLabelText("Новий пароль")).toBeTruthy()
  })
})
