import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode } from "react"
import {
  Link,
  MemoryRouter,
  useLocation,
  useNavigationType,
  useRoutes,
} from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createAuthRoutes } from "@/registry/erp/auth-routes"
import {
  clearEmailLinkTokens,
  useEmailLinkToken,
  type EmailLinkScreen,
} from "@/registry/hooks/use-email-link-token"

/**
 * Крок A2a: токен із листа зникає з адреси й історії, щойно екран його прочитав, і живе у вкладці,
 * поки людина на екрані (вікторина 25.10.2026). ra-core у Vitest бере роутер із react-router-dom.
 */

const key = (screen: EmailLinkScreen) => `erp-ui:email-link-token:${screen}`

// Екрани кіта тут не потрібні: лише межа помилок і хук `erp/auth-routes` навколо них.
const resetScreen = vi.hoisted(() => ({ failing: true }))
vi.mock("@/registry/erp/account-recovery", () => ({
  ResetPasswordScreen: ({ token }: { token: string | null }) => {
    if (resetScreen.failing) throw new Error("екран упав")
    return <p>екран: {token}</p>
  },
}))
vi.mock("@/registry/erp/login-screen", () => ({
  LoginScreen: () => <h1>Вхід</h1>,
}))

function Probe({ screen: id }: { screen: EmailLinkScreen }) {
  const token = useEmailLinkToken(id)
  const location = useLocation()
  const navigation = useNavigationType()
  return (
    <>
      <p>токен: {token ?? "немає"}</p>
      <p>адреса: {`${location.pathname}${location.search}${location.hash}`}</p>
      <p>перехід: {navigation}</p>
      <Link to="/login/invite?token=t3">Друге посилання</Link>
    </>
  )
}

function renderAt(path: string, id: EmailLinkScreen) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe screen={id} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe("useEmailLinkToken", () => {
  it("токен з адреси: запис історії замінено без токена, решта адреси лишилась; пішли — токена немає", () => {
    const view = renderAt("/login/reset?token=t1&lang=en#form", "reset")
    expect(screen.getByText("токен: t1")).toBeVisible()
    expect(screen.getByText("адреса: /login/reset?lang=en#form")).toBeVisible()
    expect(screen.getByText("перехід: REPLACE")).toBeVisible()
    expect(sessionStorage.getItem(key("reset"))).toBe("t1")

    view.unmount()
    expect(sessionStorage.getItem(key("reset"))).toBeNull()
  })

  it("оновлення сторінки: у адресі токена вже немає — береться з вкладки", () => {
    sessionStorage.setItem(key("invite"), "t2")
    renderAt("/login/invite", "invite")
    expect(screen.getByText("токен: t2")).toBeVisible()
    // Токен іншого екрана сюди не потрапляє.
    sessionStorage.setItem(key("reset"), "чужий")
    expect(screen.getByText("токен: t2")).toBeVisible()
  })

  it("друге посилання в тій самій вкладці замінює збережений токен", () => {
    renderAt("/login/invite?token=t2", "invite")
    expect(screen.getByText("токен: t2")).toBeVisible()
    act(() => {
      screen.getByRole("link", { name: "Друге посилання" }).click()
    })
    expect(screen.getByText("токен: t3")).toBeVisible()
    expect(screen.getByText("адреса: /login/invite")).toBeVisible()
    expect(sessionStorage.getItem(key("invite"))).toBe("t3")
  })

  it("без токена в адресі й у вкладці — немає (екран покаже «Посилання застаріло»)", () => {
    renderAt("/login/link", "link")
    expect(screen.getByText("токен: немає")).toBeVisible()
  })

  it("StrictMode знімає й ставить ефекти — токен лише з вкладки лишається у вкладці (рев'ю A2a)", () => {
    sessionStorage.setItem(key("reset"), "t4")
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/login/reset"]}>
          <Probe screen="reset" />
        </MemoryRouter>
      </StrictMode>,
    )
    expect(screen.getByText("токен: t4")).toBeVisible()
    // Друге оновлення сторінки теж знайде токен.
    expect(sessionStorage.getItem(key("reset"))).toBe("t4")
  })

  it("інший екран без перемонтування — свій токен, а не попереднього", () => {
    sessionStorage.setItem(key("reset"), "t5")
    const view = renderAt("/login/reset", "reset")
    expect(screen.getByText("токен: t5")).toBeVisible()
    view.rerender(
      <MemoryRouter initialEntries={["/login/reset"]}>
        <Probe screen="invite" />
      </MemoryRouter>,
    )
    expect(screen.getByText("токен: немає")).toBeVisible()
  })

  it("сховище недоступне — токен з адреси все одно прибрано й екран його має", () => {
    const denied = () => {
      throw new DOMException("denied", "SecurityError")
    }
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied)
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(denied)
    const view = renderAt("/login/link?token=t6", "link")
    expect(screen.getByText("токен: t6")).toBeVisible()
    expect(screen.getByText("адреса: /login/link")).toBeVisible()
    view.unmount()
    expect(() => {
      clearEmailLinkTokens()
    }).not.toThrow()
  })

  it("після входу й виходу токени листів у вкладці стерто", () => {
    sessionStorage.setItem(key("reset"), "a")
    sessionStorage.setItem(key("invite"), "b")
    sessionStorage.setItem("інше", "c")
    clearEmailLinkTokens()
    expect(sessionStorage.getItem(key("reset"))).toBeNull()
    expect(sessionStorage.getItem(key("invite"))).toBeNull()
    expect(sessionStorage.getItem("інше")).toBe("c")
  })
})

describe("createAuthRoutes і токен із листа", () => {
  const auth = createAuthRoutes()

  async function renderRoute(path: string) {
    auth.preload(path)
    await vi.dynamicImportSettled()
    function Routes() {
      return useRoutes(auth.routes)
    }
    await act(() => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes />
        </MemoryRouter>,
      )
      return Promise.resolve()
    })
  }

  it("помилка екрана й «Спробувати ще» токен не стирають: хук — над межею помилок", async () => {
    // React пише перехоплену помилку в консоль — у тесті це шум.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    resetScreen.failing = true
    await renderRoute("/login/reset?token=t9")
    const retry = await screen.findByRole("button", { name: "Спробувати ще" })
    expect(sessionStorage.getItem(key("reset"))).toBe("t9")

    resetScreen.failing = false
    await userEvent.click(retry)
    expect(await screen.findByText("екран: t9")).toBeVisible()
    expect(sessionStorage.getItem(key("reset"))).toBe("t9")
  })

  it("екран входу стирає токени листів: сюди веде кожен вихід", async () => {
    sessionStorage.setItem(key("invite"), "t10")
    await renderRoute("/login")
    expect(await screen.findByRole("heading", { name: "Вхід" })).toBeVisible()
    expect(sessionStorage.getItem(key("invite"))).toBeNull()
  })
})
