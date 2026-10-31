import { onlineManager, QueryClient } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext } from "ra-core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NotificationSettingsForm } from "@/registry/erp/notification-settings-form"
import { PushDeviceSection } from "@/registry/erp/push-device-section"
import { ApiError } from "@/registry/lib/api"
import type { ErpAuthProvider, Me } from "@/registry/lib/auth"
import type { NotificationSettings } from "@/registry/lib/notification-settings"
import type { PushApi } from "@/registry/lib/web-push"

/** Форма налаштувань сповіщень (ADR-0013, ADR-0046): стани й блок push за каналами сервера. */
const SETTINGS: NotificationSettings = {
  channels: [{ id: "in_app" }, { id: "push" }],
  events: [
    {
      id: "tasks.assigned",
      group: "Завдання",
      label: "Вам призначили завдання",
      channels: ["in_app", "push"],
      defaults: ["in_app"],
    },
  ],
  settings: { "tasks.assigned": ["in_app"] },
  quietHours: { enabled: false, from: "22:00", to: "08:00" },
}

function setup(
  getNotificationSettings: () => Promise<NotificationSettings>,
  {
    me = null,
    push = {},
  }: { me?: Partial<Me> | null; push?: Partial<PushApi> } = {},
) {
  const authProvider = {
    getMe: vi.fn(() => Promise.resolve(me)),
    account: { getNotificationSettings },
    inbox: { push: { publicKey: () => Promise.resolve("AQID"), ...push } },
  } as unknown as ErpAuthProvider
  render(
    <CoreAdminContext
      authProvider={authProvider}
      queryClient={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NotificationSettingsForm />
    </CoreAdminContext>,
  )
}

/** Блок окремо: форма без мережі показує свій стан і до блоку не доходить. */
function PushDeviceHost() {
  const authProvider = {
    getMe: () => Promise.resolve({ id: "u1" }),
    inbox: {
      push: {
        publicKey: () =>
          Promise.reject(new ApiError(0, { code: "offline", message: "" })),
      },
    },
  } as unknown as ErpAuthProvider
  return (
    <CoreAdminContext
      authProvider={authProvider}
      queryClient={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PushDeviceSection />
    </CoreAdminContext>
  )
}

/** Браузер, що вміє push: реєстрації ще немає, дозвіл не питали. */
function installPushBrowser(
  getRegistration: () => Promise<undefined> = () => Promise.resolve(undefined),
) {
  vi.stubGlobal("PushManager", class {})
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: () => Promise.resolve("default"),
  })
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration },
  })
}

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true)
  })
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, "PushManager")
  Reflect.deleteProperty(navigator, "serviceWorker")
})

describe("NotificationSettingsForm", () => {
  it("канал push є: блок пристрою видно", async () => {
    setup(() => Promise.resolve(SETTINGS))
    expect(await screen.findByText("Push на цьому пристрої")).toBeVisible()
  })

  it("проект без каналу push: блоку немає", async () => {
    setup(() => Promise.resolve({ ...SETTINGS, channels: [{ id: "in_app" }] }))
    await screen.findByText("Вам призначили завдання")
    expect(screen.queryByText("Push на цьому пристрої")).not.toBeInTheDocument()
  })

  it("бекенд без адрес push: блоку немає", async () => {
    setup(() => Promise.resolve(SETTINGS), {
      push: {
        publicKey: () =>
          Promise.reject(new ApiError(404, { code: "not_found", message: "" })),
      },
    })
    await screen.findByText("Вам призначили завдання")
    await act(() => new Promise((resolve) => setTimeout(resolve)))
    expect(screen.queryByText("Push на цьому пристрої")).not.toBeInTheDocument()
  })

  it("блок push не кричить: група з назвою, стан як статус", async () => {
    setup(() => Promise.resolve(SETTINGS))
    expect(
      await screen.findByRole("group", { name: "Push на цьому пристрої" }),
    ).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent(
      "На iPhone і iPad вони працюють лише в застосунку",
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("без мережі блок показує стан браузера, а не вічний скелетон", async () => {
    act(() => {
      onlineManager.setOnline(false)
    })
    installPushBrowser()
    render(<PushDeviceHost />)
    expect(
      await screen.findByText(/Сповіщення з'являтимуться на цьому пристрої/),
    ).toBeVisible()
  })

  it("збій браузера: не маскується під «не підтримує», є повтор", async () => {
    const getRegistration = vi
      .fn<() => Promise<undefined>>()
      .mockRejectedValueOnce(new Error("SecurityError"))
      .mockResolvedValue(undefined)
    installPushBrowser(getRegistration)
    const user = userEvent.setup()
    setup(() => Promise.resolve(SETTINGS), { me: { id: "u1" } })
    await user.click(
      await screen.findByRole("button", { name: "Спробувати ще" }),
    )
    expect(
      await screen.findByRole("button", {
        name: "Увімкнути на цьому пристрої",
      }),
    ).toBeVisible()
  })

  it("«Увійти як…»: пояснення замість кнопок", async () => {
    installPushBrowser()
    setup(() => Promise.resolve(SETTINGS), {
      me: { id: "u2", impersonator: { id: "u1", name: "Адмін" } },
    })
    expect(
      await screen.findByText(/працюєте від імені іншої людини/),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Увімкнути на цьому пристрої" }),
    ).not.toBeInTheDocument()
  })

  it("запит дозволу закрили: кажемо про це, кнопка не мертва", async () => {
    installPushBrowser()
    const user = userEvent.setup()
    setup(() => Promise.resolve(SETTINGS), { me: { id: "u1" } })
    await user.click(
      await screen.findByRole("button", {
        name: "Увімкнути на цьому пристрої",
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Браузер не отримав дозволу",
    )
  })

  it("немає мережі: «Немає з'єднання», а не вічний скелетон", async () => {
    act(() => {
      onlineManager.setOnline(false)
    })
    setup(() => Promise.resolve(SETTINGS))
    expect(await screen.findByText("Немає з'єднання")).toBeInTheDocument()
  })

  it("403: «Немає доступу»", async () => {
    setup(() =>
      Promise.reject(new ApiError(403, { code: "forbidden", message: "No" })),
    )
    expect(await screen.findByText("Немає доступу")).toBeInTheDocument()
  })
})
