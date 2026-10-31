import { onlineManager, QueryClient } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext } from "ra-core"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { InboxBell, NotificationInbox } from "@/registry/erp/notification-inbox"
import { ApiError } from "@/registry/lib/api"
import type { ErpAuthProvider, Me } from "@/registry/lib/auth"
import type {
  AppNotification,
  InboxApi,
  NotificationsPage,
} from "@/registry/lib/notifications"

/** Центр сповіщень (ADR-0014, ADR-0046): стани, яких не видно на моках із панелі розробника. */
const notification = (id: string): AppNotification => ({
  id,
  type: "tasks.assigned",
  title: `Сповіщення ${id}`,
  createdAt: "2026-10-30T10:00:00.000Z",
  readAt: null,
})
const PAGE_SIZE = 2
const FIRST_PAGE: NotificationsPage = {
  data: [notification("n1"), notification("n2")],
  total: 3,
  unread: 3,
}

function setup(
  ui: ReactNode,
  inbox: Partial<InboxApi>,
  me: Partial<Me> | null = null,
) {
  const authProvider = {
    getMe: vi.fn(() => Promise.resolve(me)),
    inbox: {
      list: vi.fn(() => Promise.resolve(FIRST_PAGE)),
      unreadCount: vi.fn(() => Promise.resolve(3)),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      push: {},
      ...inbox,
    },
  } as unknown as ErpAuthProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <CoreAdminContext authProvider={authProvider} queryClient={queryClient}>
      {ui}
    </CoreAdminContext>,
  )
}

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true)
  })
  document.title = ""
})

describe("NotificationInbox: стани", () => {
  it("немає мережі: «Немає з'єднання», а не вічний скелетон", async () => {
    act(() => {
      onlineManager.setOnline(false)
    })
    setup(<NotificationInbox />, {})
    expect(await screen.findByText("Немає з'єднання")).toBeInTheDocument()
  })

  it("403: «Немає доступу»", async () => {
    const list = vi.fn(() =>
      Promise.reject(new ApiError(403, { code: "forbidden", message: "No" })),
    )
    setup(<NotificationInbox />, { list })
    expect(await screen.findByText("Немає доступу")).toBeInTheDocument()
  })

  it("збій «Показати ще» лишає показане й дає повтор", async () => {
    const list = vi
      .fn<InboxApi["list"]>()
      .mockResolvedValueOnce(FIRST_PAGE)
      .mockRejectedValueOnce(
        new ApiError(500, { code: "server", message: "Boom" }),
      )
      .mockResolvedValue({ ...FIRST_PAGE, data: [notification("n3")] })
    const user = userEvent.setup()
    setup(<NotificationInbox perPage={PAGE_SIZE} />, { list })
    const items = await screen.findByRole("list", { name: "Сповіщення" })
    await user.click(screen.getByRole("button", { name: "Показати ще" }))
    const failure = await screen.findByRole("alert")
    expect(within(items).getAllByRole("listitem")).toHaveLength(PAGE_SIZE)
    await user.click(
      within(failure).getByRole("button", { name: "Спробувати ще" }),
    )
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })
    expect(within(items).getAllByRole("listitem")).toHaveLength(3)
  })

  it("посилання лише свого застосунку: чуже лишається текстом", async () => {
    const list = () =>
      Promise.resolve({
        data: [
          { ...notification("n1"), link: "/invoices/42" },
          { ...notification("n2"), link: "https://evil.example/x" },
        ],
        total: 2,
        unread: 2,
      })
    setup(<NotificationInbox />, { list })
    expect(
      await screen.findByRole("link", { name: "Сповіщення n1" }),
    ).toHaveAttribute("href", "/invoices/42")
    expect(screen.getByText("Сповіщення n2")).toBeInTheDocument()
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })

  it("чуже посилання не переходить роутером", async () => {
    const list = () =>
      Promise.resolve({
        data: [{ ...notification("n1"), link: "//evil.example" }],
        total: 1,
        unread: 1,
      })
    const onNavigate = vi.fn()
    setup(<NotificationInbox onNavigate={onNavigate} />, { list })
    await screen.findByText("Сповіщення n1")
    expect(
      screen.queryByRole("button", { name: "Сповіщення n1" }),
    ).not.toBeInTheDocument()
    expect(onNavigate).not.toHaveBeenCalled()
  })
})

describe("InboxBell", () => {
  it("лічильник у назві вкладки", async () => {
    document.title = "Рахунки"
    setup(<InboxBell />, {})
    await waitFor(() => {
      expect(document.title).toBe("(3) Рахунки")
    })
  })

  it("tabCounter={false} лишає назву", async () => {
    document.title = "Рахунки"
    const unreadCount = vi.fn(() => Promise.resolve(3))
    setup(<InboxBell tabCounter={false} />, { unreadCount })
    await waitFor(() => {
      expect(unreadCount).toHaveBeenCalled()
    })
    expect(document.title).toBe("Рахунки")
  })
})

describe("web push у вкладці", () => {
  type MessageListener = (event: { data: unknown; source: unknown }) => void
  const listeners = new Set<MessageListener>()
  const OWN_WORKER = { scriptURL: "http://localhost/erp-ui-push-sw.js" }
  const OTHER_WORKER = { scriptURL: "http://localhost/mockServiceWorker.js" }
  const getRegistration = vi.fn(() => Promise.resolve(undefined))

  const installWorkerEvents = () => {
    vi.stubGlobal("PushManager", class {})
    vi.stubGlobal("Notification", { permission: "default" })
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration,
        addEventListener: (_: string, listener: MessageListener) => {
          listeners.add(listener)
        },
        removeEventListener: (_: string, listener: MessageListener) => {
          listeners.delete(listener)
        },
      },
    })
  }
  const message = (data: unknown, source: unknown = OWN_WORKER) => {
    act(() => {
      listeners.forEach((listener) => {
        listener({ data, source })
      })
    })
  }

  afterEach(() => {
    getRegistration.mockClear()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, "PushManager")
    Reflect.deleteProperty(navigator, "serviceWorker")
    listeners.clear()
  })

  it("прийшов push: лічильник перечитується", async () => {
    installWorkerEvents()
    const unreadCount = vi.fn(() => Promise.resolve(3))
    setup(<InboxBell />, { unreadCount })
    await waitFor(() => {
      expect(unreadCount).toHaveBeenCalledOnce()
    })
    message({ type: "erp-ui:push-received" })
    await waitFor(() => {
      expect(unreadCount).toHaveBeenCalledTimes(2)
    })
  })

  it("клік за push: позначає прочитаним і переходить роутером", async () => {
    installWorkerEvents()
    const markRead = vi.fn(() => Promise.resolve(notification("n1")))
    const onNavigate = vi.fn()
    setup(<InboxBell onNavigate={onNavigate} />, { markRead })
    await waitFor(() => {
      expect(listeners.size).toBe(1)
    })
    message({ type: "erp-ui:push-open", id: "n1", link: "/invoices/42" })
    expect(markRead).toHaveBeenCalledWith("n1", true)
    expect(onNavigate).toHaveBeenCalledWith("/invoices/42")
  })

  it("перевірочний push не в інбоксі: 404 не заважає", async () => {
    installWorkerEvents()
    const markRead = vi.fn(() =>
      Promise.reject(new ApiError(404, { code: "not_found", message: "No" })),
    )
    setup(<InboxBell />, { markRead })
    await waitFor(() => {
      expect(listeners.size).toBe(1)
    })
    message({ type: "erp-ui:push-open", id: "test" })
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledOnce()
    })
  })

  it("перехід на чужий домен неможливий", async () => {
    installWorkerEvents()
    const onNavigate = vi.fn()
    setup(<InboxBell onNavigate={onNavigate} />, {})
    await waitFor(() => {
      expect(listeners.size).toBe(1)
    })
    message({ type: "erp-ui:push-open", link: "//evil.example" })
    expect(onNavigate).toHaveBeenCalledWith("/")
  })

  it("чуже повідомлення іншого фонового файла нічого не робить", async () => {
    installWorkerEvents()
    const onNavigate = vi.fn()
    setup(<InboxBell onNavigate={onNavigate} />, {})
    await waitFor(() => {
      expect(listeners.size).toBe(1)
    })
    message({ type: "erp-ui:push-open", link: "/x" }, OTHER_WORKER)
    message(null, OTHER_WORKER)
    message({ type: "erp-ui:push-open", link: "/x" }, null)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it("без роутера: перехід звичайною адресою", async () => {
    installWorkerEvents()
    const assign = vi.fn()
    setup(<InboxBell />, {})
    await waitFor(() => {
      expect(listeners.size).toBe(1)
    })
    vi.stubGlobal("location", { assign, hash: "" })
    message({ type: "erp-ui:push-open", link: "/invoices/42" })
    expect(assign).toHaveBeenCalledWith("/invoices/42")
  })

  it("без роутера, адреси в хеші: перехід із початком застосунку", async () => {
    installWorkerEvents()
    const assign = vi.fn()
    setup(<InboxBell />, {})
    await waitFor(() => {
      expect(listeners.size).toBe(1)
    })
    vi.stubGlobal("location", { assign, hash: "#/m/N5/inbox" })
    message({ type: "erp-ui:push-open", link: "/invoices/42" })
    expect(assign).toHaveBeenCalledWith("/#/invoices/42")
  })

  it("людина ввійшла: підписка звіряється", async () => {
    installWorkerEvents()
    setup(<InboxBell />, {}, { id: "u1" })
    await waitFor(() => {
      expect(getRegistration).toHaveBeenCalled()
    })
  })

  it("«Увійти як…»: підписку адміністратора не чіпає", async () => {
    installWorkerEvents()
    const unreadCount = vi.fn(() => Promise.resolve(3))
    setup(
      <InboxBell />,
      { unreadCount },
      { id: "u2", impersonator: { id: "u1", name: "Адмін" } },
    )
    await waitFor(() => {
      expect(document.title).toContain("(3)")
    })
    await act(() => new Promise((resolve) => setTimeout(resolve)))
    expect(getRegistration).not.toHaveBeenCalled()
  })
})
