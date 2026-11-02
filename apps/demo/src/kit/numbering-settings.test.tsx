import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http } from "msw/http"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import { createMemoryRouter, RouterProvider } from "react-router"
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

import { NumberingSettings } from "@/registry/erp/numbering-settings"
import { createApiClient } from "@/registry/lib/api"
import { createAuthProvider, ME_QUERY_KEY } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { errorResponse } from "@/registry/lib/mock-server"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { NUMBERING_SERIES } from "@/registry/lib/numbering"
import { createQueryClient } from "@/registry/lib/query-client"

/**
 * Крок PF03b (ADR-0058): налаштування нумерації — серії, кнопки міток, перевірка шаблону, перегляд
 * наступного номера, лише перегляд і стани.
 */
const BASE = "http://erp.test/api/v1"

const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: [
    { companyId: null, resource: "quotes", template: "П-{YYYY}-{####}" },
    {
      companyId: null,
      resource: "orders",
      template: "З-{####}",
      resetYearly: false,
    },
  ],
  counters: [{ companyId: null, resource: "quotes", year: 2026, value: 41 }],
})

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [
      user("admin", ["numbering-series:*"]),
      user("viewer", ["numbering-series:read"]),
      user("stranger", []),
    ],
  }),
  ...numbering.handlers,
)

const LABELS = { quotes: "Пропозиції", orders: "Замовлення" }

function renderSettings() {
  const queryClient = createQueryClient()
  const client = createApiClient({ baseUrl: BASE })
  const authProvider = createAuthProvider(client, {
    baseUrl: BASE,
    onMe: (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me)
    },
  })
  const router = createMemoryRouter([
    { path: "/", element: <NumberingSettings labels={LABELS} /> },
  ])
  render(
    <CoreAdminContext
      queryClient={queryClient}
      authProvider={authProvider}
      dataProvider={createDataProvider(client)}
    >
      <RouterProvider router={router} />
    </CoreAdminContext>,
  )
  return { router, queryClient }
}

const template = () => screen.findByRole("textbox", { name: "Шаблон номера" })
const preview = () => screen.getByRole("status", { name: "Наступний номер" })

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  // Лише дата: таймери лишаються справжніми, на них чекає Testing Library.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-02T09:00:00Z"))
  numbering.reset()
  resetScenarios()
  signInMock("admin")
})
afterEach(() => {
  vi.useRealTimers()
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("NumberingSettings", () => {
  it("список серій, перша вибрана; перегляд наступного номера з лічильника сервера", async () => {
    renderSettings()
    const list = await screen.findByRole("list", { name: "Типи документів" })
    // Сервер сортує серії за ресурсом: замовлення перед пропозиціями.
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["ЗамовленняЗ-{####}", "ПропозиціїП-{YYYY}-{####}"])
    await userEvent.click(
      within(list).getByRole("button", { name: /Пропозиції/ }),
    )
    expect(
      await screen.findByRole("heading", { level: 2, name: "Пропозиції" }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(preview()).toHaveTextContent("П-2026-0042")
    })
  })

  it("кнопки міток вставляють мітку; перегляд іде за шаблоном до збереження", async () => {
    renderSettings()
    const field = await template()
    await userEvent.clear(field)
    await userEvent.type(field, "Р-")
    const tokens = screen.getByRole("group", { name: "Вставити мітку" })
    await userEvent.click(
      within(tokens).getByRole("button", {
        name: "Вставити {YY}, рік двома цифрами",
      }),
    )
    await userEvent.type(field, "/")
    await userEvent.click(
      within(tokens).getByRole("button", {
        name: "Вставити {####}, лічильник",
      }),
    )
    expect(field).toHaveValue("Р-{YY}/{####}")
    await waitFor(() => {
      expect(preview()).toHaveTextContent("Р-26/0001")
    })
  })

  it("шаблон без року при «Щороку з 1» — помилка біля поля; вимкнути скидання — помилки немає, збережено", async () => {
    renderSettings()
    const field = await template()
    await userEvent.clear(field)
    await userEvent.type(field, "З-{{####}-Н")
    await userEvent.tab()
    await userEvent.click(screen.getByRole("switch", { name: "Щороку з 1" }))
    expect(field).toHaveAccessibleDescription(/Додайте рік/)
    expect(preview()).toHaveTextContent(/^Додайте рік/)
    await userEvent.click(screen.getByRole("switch", { name: "Щороку з 1" }))
    await waitFor(() => {
      expect(field).not.toHaveAccessibleDescription(/Додайте рік/)
    })
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(
        numbering.db.all().find((series) => series.resource === "orders")
          ?.template,
      ).toBe("З-{####}-Н")
    })
  })

  it("лише перегляд: пояснення, поле для читання, без міток і збереження", async () => {
    signInMock("viewer")
    renderSettings()
    expect(
      await screen.findByText(/Ви бачите нумерацію, але змінювати її/),
    ).toBeInTheDocument()
    expect(await template()).toHaveAttribute("readonly")
    expect(
      screen.queryByRole("group", { name: "Вставити мітку" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Зберегти" }),
    ).not.toBeInTheDocument()
  })

  it("без права на нумерацію — «Немає доступу»", async () => {
    signInMock("stranger")
    renderSettings()
    expect(
      await screen.findByRole("heading", { name: "Немає доступу" }),
    ).toBeInTheDocument()
  })

  it("серій немає — порожній стан", async () => {
    setScenario("empty", "numbering-series")
    renderSettings()
    expect(
      await screen.findByRole("heading", { name: "Нумерувати ще нічого" }),
    ).toBeInTheDocument()
  })

  it("код 422 сервера — той самий текст помилки шаблону біля поля", async () => {
    server.use(
      http.patch(`${BASE}/${NUMBERING_SERIES}/:id`, () =>
        errorResponse(422, {
          code: "validation",
          message: "Validation failed",
          fieldErrors: { template: "unknown_token" },
        }),
      ),
    )
    renderSettings()
    const field = await template()
    await userEvent.type(field, "-Н")
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(field).toHaveAccessibleDescription(
        /Невідома мітка або дужка без пари/,
      )
    })
    expect(field).toHaveValue("З-{####}-Н")
  })

  it("серії не вдалося перечитати — стан помилки над формою, введене лишається", async () => {
    const { queryClient } = renderSettings()
    const field = await template()
    await userEvent.type(field, "-Н")
    // 403 не повторюється (lib/query-client): стан одразу, без паузи повтору.
    setScenario("forbidden", NUMBERING_SERIES)
    await queryClient.invalidateQueries({ queryKey: [NUMBERING_SERIES] })
    expect(
      await screen.findByRole("heading", { name: "Немає доступу" }),
    ).toBeInTheDocument()
    expect(await template()).toHaveValue("З-{####}-Н")
  })

  it("клік по вибраній серії зі змінами — без діалогу, форма та сама", async () => {
    renderSettings()
    const field = await template()
    await userEvent.type(field, "-Н")
    const list = screen.getByRole("list", { name: "Типи документів" })
    await userEvent.click(
      within(list).getByRole("button", { name: /Замовлення/ }),
    )
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(field).toHaveValue("З-{####}-Н")
  })
})
