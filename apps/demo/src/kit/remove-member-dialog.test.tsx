import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import { toast } from "sonner"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest"

import { RemoveMemberDialog } from "@/registry/erp/remove-member-dialog"
import { createApiClient } from "@/registry/lib/api"
import { createAuthProvider } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import { setMockUsers } from "@/registry/lib/mock-server"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createQueryClient } from "@/registry/lib/query-client"
import {
  createAdminApi,
  REMOVE_MEMBER_TIMEOUT_MS,
} from "@/registry/lib/security-policy"

/**
 * Крок A2c3b (ADR-0041): відповіді сервера, яких демо не відтворює: людину щойно вилучив інший
 * адміністратор (404), відмова через зміни поза екраном (403, 409) і скасований пароль.
 */

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}))

const BASE = "http://erp.test/api/v1"
const ROUTE = `${BASE}/users/u2/remove-from-company`
const PASSWORD = "demo-password"
const COMPANY = { id: "c1", name: "ТОВ «Тест»" }
const TARGET = { id: "u2", name: "Іван", email: "u2@zoriana.example" }

const person = (id: string, roles: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@zoriana.example`,
  password: PASSWORD,
  totpCode: "111111",
  roles,
  permissions: [],
  companies: [COMPANY],
  companyId: COMPANY.id,
  factors: [],
})

const seed = () => [person("a1", ["admin"]), person("u2", ["sales"])]

const ROLES = [
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: ["users:*", "notes:read"],
  },
  {
    id: "sales",
    name: { uk: "Продажі", en: "Sales" },
    permissions: ["notes:read"],
  },
]

const server = setupServer(
  ...createPlatformHandlers({
    users: seed(),
    baseUrl: BASE,
    roles: ROLES,
    permissionResources: {
      notes: { label: { uk: "Нотатки", en: "Notes" } },
      users: {
        label: { uk: "Користувачі", en: "Users" },
        actions: ["read", "create", "update", "impersonate"],
      },
    },
  }),
)

const failWith = (status: number, code: string) =>
  server.use(
    http.post(ROUTE, () =>
      HttpResponse.json({ code, message: code }, { status }),
    ),
  )

function renderDialog() {
  const handlers = { onClose: vi.fn(), onRemoved: vi.fn(), onStale: vi.fn() }
  const authProvider = createAuthProvider(createApiClient({ baseUrl: BASE }), {
    baseUrl: BASE,
  })
  render(
    <CoreAdminContext
      authProvider={authProvider}
      queryClient={createQueryClient()}
    >
      <RemoveMemberDialog target={TARGET} {...handlers} />
    </CoreAdminContext>,
  )
  return handlers
}

async function confirm() {
  const user = userEvent.setup()
  const dialog = await screen.findByRole("alertdialog", {
    name: "Іван: вилучити з компанії ТОВ «Тест»?",
  })
  await user.click(
    Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent === "Вилучити з компанії",
    ) ?? dialog,
  )
  return user
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  localStorage.clear()
  setMockUsers(seed())
  applyMockRoles()
  signInMock("a1")
  setCompanyId(COMPANY.id)
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.info).mockClear()
  vi.mocked(toast.success).mockClear()
})
afterEach(() => {
  server.resetHandlers()
})

describe("RemoveMemberDialog", () => {
  it("пароль, потім успіх: тост і onRemoved", async () => {
    const { onRemoved, onStale } = renderDialog()
    const user = await confirm()
    await user.type(await screen.findByLabelText("Пароль"), PASSWORD)
    await user.click(screen.getByRole("button", { name: "Підтвердити" }))
    await waitFor(() => {
      expect(onRemoved).toHaveBeenCalledOnce()
    })
    expect(toast.success).toHaveBeenCalledWith("Іван: вилучено з компанії")
    expect(onStale).not.toHaveBeenCalled()
  })

  it("404: людину вже вилучили, панель іде, це не помилка", async () => {
    failWith(404, "not_found")
    const { onRemoved, onStale } = renderDialog()
    await confirm()
    await waitFor(() => {
      expect(onRemoved).toHaveBeenCalledOnce()
    })
    expect(toast.info).toHaveBeenCalledWith(
      "Іван: людини вже немає в цій компанії",
    )
    expect(toast.error).not.toHaveBeenCalled()
    expect(onStale).not.toHaveBeenCalled()
  })

  it("404 без коду сервера — це не «людини вже немає»", async () => {
    failWith(404, "route_missing")
    const { onRemoved } = renderDialog()
    await confirm()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledOnce()
    })
    expect(onRemoved).not.toHaveBeenCalled()
  })

  it.each([
    [403, "forbidden", "Недостатньо прав для цієї дії"],
    [409, "conflict", "Запис змінив інший користувач"],
  ])("%i: зрозумілий текст і перечитати доступ", async (status, code, text) => {
    failWith(status, code)
    const { onRemoved, onStale } = renderDialog()
    await confirm()
    await waitFor(() => {
      expect(onStale).toHaveBeenCalledOnce()
    })
    expect(toast.error).toHaveBeenCalledWith(text)
    expect(onRemoved).not.toHaveBeenCalled()
  })

  it("поки запит летить, скасувати не можна: ні кнопкою, ні Escape", async () => {
    let answer = () => {}
    server.use(
      http.post(
        ROUTE,
        () =>
          new Promise<Response>((resolve) => {
            answer = () => {
              resolve(new HttpResponse(null, { status: 204 }))
            }
          }),
      ),
    )
    const { onClose, onRemoved } = renderDialog()
    await confirm()
    const dialog = screen.getByRole("alertdialog")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Скасувати" })).toBeDisabled()
    })
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()
    answer()
    await waitFor(() => {
      expect(onRemoved).toHaveBeenCalledOnce()
    })
  })

  it("сервер мовчить: запит обривається за межею часу", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const silent = vi.fn(() => new Promise<Response>(() => {}))
    const admin = createAdminApi(
      createApiClient({ baseUrl: BASE, fetch: silent }),
    )
    const outcome = admin
      .removeFromCompany(TARGET.id)
      .catch((failure: unknown) => failure)
    await vi.advanceTimersByTimeAsync(REMOVE_MEMBER_TIMEOUT_MS)
    expect(silent).toHaveBeenCalledOnce()
    expect(await outcome).toMatchObject({ status: 0, code: "offline" })
  })

  it("обрив мережі: замок знято, можна спробувати ще", async () => {
    server.use(http.post(ROUTE, () => HttpResponse.error()))
    const { onRemoved } = renderDialog()
    await confirm()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledOnce()
    })
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeEnabled()
    expect(onRemoved).not.toHaveBeenCalled()
  })

  it("500: діалог лишається, можна спробувати ще", async () => {
    failWith(500, "server")
    const { onRemoved, onStale } = renderDialog()
    await confirm()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledOnce()
    })
    expect(onRemoved).not.toHaveBeenCalled()
    expect(onStale).not.toHaveBeenCalled()
  })

  it("скасований пароль не перечитує доступ", async () => {
    const { onRemoved, onStale } = renderDialog()
    const user = await confirm()
    await screen.findByLabelText("Пароль")
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Скасувати",
      }),
    )
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Дію не виконано: підтвердження скасовано",
      )
    })
    expect(onRemoved).not.toHaveBeenCalled()
    expect(onStale).not.toHaveBeenCalled()
  })
})
