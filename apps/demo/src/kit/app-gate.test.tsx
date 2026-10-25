import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import { MemoryRouter, useRoutes, type RouteObject } from "react-router"
import {
  MemoryRouter as RaMemoryRouter,
  useRoutes as useRaRoutes,
} from "react-router-dom"
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

import { SessionGate, useSignOut } from "@/registry/erp/app-gate"
import { useAuthMethods } from "@/registry/erp/auth-layout"
import { AUTH_ROUTE_PATHS, createAuthRoutes } from "@/registry/erp/auth-routes"
import { SessionGuard } from "@/registry/erp/session-guard"
import { ApiError, createApiClient } from "@/registry/lib/api"
import { createAuthProvider, ME_QUERY_KEY } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createQueryClient } from "@/registry/lib/query-client"

/** Крок 1.9 (ADR-0029): брама сесії, вихід із повідомленням, маршрути входу, політика повторів. */

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

const BASE = "http://erp.test/api/v1"
const USERS: MockUser[] = [
  {
    id: "u1",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    password: "demo",
    totpCode: "123456",
    roles: ["accountant"],
    permissions: ["invoices:*"],
    companies: [{ id: "zoriana", name: "ТОВ «Зоряна логістика»" }],
    companyId: "zoriana",
    factors: [],
  },
]

const server = setupServer(
  ...createPlatformHandlers({
    users: USERS,
    baseUrl: BASE,
    methods: { idleTimeoutMinutes: 1 },
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
  setCompanyId(null)
  vi.mocked(toast).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(() => {
  server.resetHandlers()
})

/**
 * У Vitest ra-core підхоплює маршрутизатор через react-router-dom — інший екземпляр модуля, ніж
 * "react-router" у файлах кіта (у зібраному застосунку екземпляр один). Переходи ra-core (вихід,
 * гість → вхід) перевіряємо в його маршрутизаторі (`raRouter`), екрани входу кіта — у "react-router".
 */
function renderApp(
  element: React.ReactNode,
  {
    path = "/crm",
    routes = [],
    raRouter = true,
  }: { path?: string; routes?: RouteObject[]; raRouter?: boolean } = {},
) {
  const queryClient = createQueryClient()
  const client = createApiClient({ baseUrl: BASE })
  const authProvider = createAuthProvider(client, {
    baseUrl: BASE,
    onMe: (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me)
    },
  })
  const appRoutes: RouteObject[] = [
    ...routes,
    { path: "/login", element: <p>Сторінка входу</p> },
    { path: "*", element },
  ]
  const Router = raRouter ? RaMemoryRouter : MemoryRouter
  const useAppRoutes = raRouter ? useRaRoutes : useRoutes
  function Routes() {
    return useAppRoutes(appRoutes)
  }
  const result = render(
    <Router initialEntries={[path]}>
      <CoreAdminContext authProvider={authProvider} queryClient={queryClient}>
        <Routes />
      </CoreAdminContext>
    </Router>,
  )
  return { ...result, queryClient, authProvider }
}

describe("SessionGate", () => {
  it("користувач увійшов — вміст і охорона сесії", async () => {
    signInMock("u1")
    renderApp(
      <SessionGate>
        <p>Вміст застосунку</p>
      </SessionGate>,
    )
    expect(await screen.findByText("Вміст застосунку")).toBeVisible()
  })

  it("ставить SessionGuard з параметрами брами", async () => {
    signInMock("u1")
    renderApp(
      <SessionGate idleMinutes={1} warnSeconds={120}>
        <p>Вміст застосунку</p>
      </SessionGate>,
    )
    expect(
      await screen.findByRole("alertdialog", { name: "Ви ще тут?" }),
    ).toBeVisible()
  })

  it("повторна перевірка сесії («Увійти як…», вхід в іншій вкладці) не прибирає вміст", async () => {
    signInMock("u1")
    const { queryClient, authProvider } = renderApp(
      <SessionGate>
        <p>Вміст застосунку</p>
      </SessionGate>,
    )
    const content = await screen.findByText("Вміст застосунку")
    // Перевірка сесії не миттєва (мережа): інакше TanStack Query зводить «pending» і результат в одне.
    const checkAuth = authProvider.checkAuth.bind(authProvider)
    authProvider.checkAuth = async (params) => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return checkAuth(params)
    }
    // Так скидає дані useResetUserData: усе, крім профілю, зокрема перевірку сесії ra-core.
    await queryClient.resetQueries({
      predicate: (query) => query.queryKey[0] === "auth",
    })
    // Той самий вузол: оболонку не розмонтовано (незбережене, прокрутка й фокус лишились).
    expect(content.isConnected).toBe(true)
  })

  it("гість — на сторінку входу", async () => {
    renderApp(
      <SessionGate>
        <p>Вміст застосунку</p>
      </SessionGate>,
    )
    expect(await screen.findByText("Сторінка входу")).toBeVisible()
    expect(screen.queryByText("Вміст застосунку")).toBeNull()
  })

  it("профіль не завантажився — помилка з h1 і повтором, після повтору вміст", async () => {
    signInMock("u1")
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json({ code: "server", message: "Збій" }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderApp(
      <SessionGate>
        <p>Вміст застосунку</p>
      </SessionGate>,
    )
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Не вдалося завантажити профіль",
      }),
    ).toBeVisible()
    expect(screen.getByRole("alert")).toHaveAttribute("data-kind", "error")
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("alert"))
    // Повтор знову впав: стан і кнопка лишаються, фокус не губиться.
    const retry = screen.getByRole("button", { name: "Спробувати ще" })
    await user.click(retry)
    await vi.waitFor(() => {
      expect(screen.getByRole("alert")).toHaveAttribute("data-kind", "error")
    })
    expect(retry).toBeInTheDocument()
    expect(retry).toHaveFocus()
    server.resetHandlers()
    await user.click(retry)
    expect(await screen.findByText("Вміст застосунку")).toBeVisible()
  })

  it("мережа недоступна — стан «офлайн»", async () => {
    signInMock("u1")
    server.use(http.get(`${BASE}/me`, () => HttpResponse.error()))
    renderApp(
      <SessionGate>
        <p>Вміст застосунку</p>
      </SessionGate>,
    )
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Не вдалося завантажити профіль",
    )
    expect(screen.getByRole("alert")).toHaveAttribute("data-kind", "offline")
  })
})

describe("useSignOut", () => {
  function SignOutButton() {
    const signOut = useSignOut()
    return (
      <button type="button" onClick={signOut}>
        Вийти
      </button>
    )
  }

  it("вийшли — повідомлення «Ви вийшли»", async () => {
    signInMock("u1")
    const user = userEvent.setup()
    renderApp(<SignOutButton />)
    await user.click(screen.getByRole("button", { name: "Вийти" }))
    await vi.waitFor(() => {
      expect(toast).toHaveBeenCalledWith("Ви вийшли")
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("сервер не завершив сесію — помилка, а не «Ви вийшли»", async () => {
    signInMock("u1")
    server.use(http.post(`${BASE}/auth/logout`, () => HttpResponse.error()))
    const user = userEvent.setup()
    renderApp(<SignOutButton />)
    await user.click(screen.getByRole("button", { name: "Вийти" }))
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Не вдалося вийти. Перевірте з'єднання й спробуйте ще раз.",
      )
    })
    expect(toast).not.toHaveBeenCalledWith("Ви вийшли")
  })
})

describe("createAuthRoutes", () => {
  const auth = createAuthRoutes({ afterLogin: "/crm", title: "Бухгалтерія" })

  it("усі екрани входу за адресами кіта", () => {
    expect(auth.routes.map((route) => route.path)).toEqual([
      AUTH_ROUTE_PATHS.login,
      AUTH_ROUTE_PATHS.forgot,
      AUTH_ROUTE_PATHS.reset,
      AUTH_ROUTE_PATHS.invite,
      AUTH_ROUTE_PATHS.link,
      AUTH_ROUTE_PATHS.signUp,
      AUTH_ROUTE_PATHS.callback,
    ])
    // Вхід — завжди /login (туди веде ra-core); інші адреси змінюються.
    expect(
      createAuthRoutes({ paths: { forgot: "/password/forgot" } }).routes[1]
        ?.path,
    ).toBe("/password/forgot")
  })

  /** Чанк екрана завантажено заздалегідь: призупинений поза `act` рендер React у тестах сам не відновлює. */
  async function renderAuthScreen(path: string) {
    auth.preload(path)
    await vi.dynamicImportSettled()
    renderApp(<p>Інше</p>, { path, routes: auth.routes, raRouter: true })
  }

  it("екран входу з назвою застосунку", async () => {
    await renderAuthScreen("/login")
    expect(
      await screen.findByRole("heading", { name: "Бухгалтерія" }),
    ).toBeVisible()
  })

  it("новий пароль бере токен з адреси й тримає його у вкладці (A2a)", async () => {
    await renderAuthScreen("/login/reset?token=t1")
    expect(
      await screen.findByRole("heading", { name: "Новий пароль" }),
    ).toBeVisible()
    expect(sessionStorage.getItem("erp-ui:email-link-token:reset")).toBe("t1")
  })

  it("відновлення пароля; адреса з кінцевою косою", async () => {
    await renderAuthScreen("/login/forgot/")
    expect(
      await screen.findByRole("heading", { name: "Відновлення пароля" }),
    ).toBeVisible()
  })

  it("реєстрація", async () => {
    await renderAuthScreen("/signup")
    expect(
      await screen.findByRole("heading", { name: "Реєстрація" }),
    ).toBeVisible()
  })

  it("без токена — «Посилання застаріло»", async () => {
    await renderAuthScreen("/login/reset")
    expect(
      await screen.findByRole("heading", { name: "Посилання застаріло" }),
    ).toBeVisible()
  })
})

describe("SessionGuard: автовихід за політикою сервера", () => {
  // Перша позначка активності — на 5 с уперед (lib/session), тож попередження за 120 с до
  // автовиходу через 1 хв показується одразу.
  it("без пропса — idleTimeoutMinutes з GET /auth/methods", async () => {
    signInMock("u1")
    renderApp(<SessionGuard warnSeconds={120} />)
    expect(
      await screen.findByRole("alertdialog", { name: "Ви ще тут?" }),
    ).toBeVisible()
  })

  it("idleMinutes={null} — лише термін сесії сервера", async () => {
    function MethodsLoaded() {
      return useAuthMethods().data ? <p>Політику завантажено</p> : null
    }
    signInMock("u1")
    renderApp(
      <>
        <SessionGuard idleMinutes={null} warnSeconds={120} />
        <MethodsLoaded />
      </>,
    )
    expect(await screen.findByText("Політику завантажено")).toBeVisible()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})

describe("createQueryClient", () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry
  const shouldRetry = (count: number, error: unknown) =>
    typeof retry === "function" && retry(count, error as Error)

  it("тимчасовий збій читання — один повтор", () => {
    const offline = new ApiError(0, { code: "offline", message: "Network" })
    const server500 = new ApiError(503, { code: "server", message: "x" })
    expect(shouldRetry(0, offline)).toBe(true)
    expect(shouldRetry(0, server500)).toBe(true)
    expect(shouldRetry(1, server500)).toBe(false)
  })

  it("4xx і не помилки API — без повтору; мутації — без повтору", () => {
    for (const [status, code] of [
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
      [409, "conflict"],
      [422, "validation"],
      [429, "rate_limited"],
    ] as const)
      expect(shouldRetry(0, new ApiError(status, { code, message: "x" }))).toBe(
        false,
      )
    expect(shouldRetry(0, new TypeError("bug"))).toBe(false)
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false)
  })
})
