import { onlineManager, QueryClient } from "@tanstack/react-query"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
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

import { DocumentActionBar } from "@/registry/erp/document-action-bar"
import {
  DocumentFlow,
  DocumentFlowView,
  type DocumentFlowType,
  type DocumentFlowViewProps,
} from "@/registry/erp/document-flow"
import { ApiError, createApiClient } from "@/registry/lib/api"
import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import type { DocumentFlow as DocumentFlowData } from "@/registry/lib/document-links"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { signInMock } from "@/registry/lib/mocks"

import { BASE, flowHandlers, orders, quotes } from "./document-flow.fixtures"

/**
 * Крок UI13 (ADR-0061): потік документів на картці — кроки за типами, поточний документ, позначки без
 * права й видаленого, стани SPEC §8, фокус після повтору, панель дій не чекає потоку.
 */
const server = setupServer(...flowHandlers)
const data = createDataProvider(createApiClient({ baseUrl: BASE }))

const TYPES: Record<string, DocumentFlowType> = {
  quotes: { label: "Пропозиція", href: (id) => `/quotes/${id}` },
  orders: { label: "Замовлення", href: (id) => `/orders/${id}` },
  invoices: { label: "Рахунок" },
}

const SAMPLE: DocumentFlowData = {
  truncated: false,
  documents: [
    {
      resource: "quotes",
      id: "q1",
      access: "granted",
      number: "ПРО-1",
      date: "2026-10-20",
      docStatus: "submitted",
      total: { amount: 120_000, currency: "UAH" },
    },
    {
      resource: "orders",
      id: "o1",
      access: "granted",
      number: "ЗАМ-1",
      docStatus: "submitted",
      links: [{ kind: "basedOn", resource: "quotes", id: "q1" }],
    },
    {
      resource: "invoices",
      id: "i1",
      access: "forbidden",
      number: "РАХ-1",
      links: [{ kind: "basedOn", resource: "orders", id: "o1" }],
    },
    { resource: "invoices", id: "i2", access: "deleted", number: null },
  ],
}

const offline = () => new ApiError(0, { code: "offline", message: "offline" })

/** Той самий екземпляр View з іншими пропсами: як картка, що перемальовується. */
function renderView(props: Partial<DocumentFlowViewProps> = {}) {
  const tree = (next: Partial<DocumentFlowViewProps>) => (
    <MemoryRouter>
      <DocumentFlowView
        resource="orders"
        id="o1"
        types={TYPES}
        flow={SAMPLE}
        {...next}
      />
    </MemoryRouter>
  )
  const view = render(tree(props))
  const show = (next: Partial<DocumentFlowViewProps>) => {
    view.rerender(tree(next))
  }
  return { ...view, show }
}

const item = (step: string, index = 0) => {
  const found = within(screen.getByRole("list", { name: step })).getAllByRole(
    "listitem",
  )[index]
  if (!found) throw new Error(`${step}: no item ${String(index)}`)
  return found
}

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  quotes.db.reset()
  orders.db.reset()
  resetScenarios()
  signInMock("full")
})
afterEach(() => {
  server.resetHandlers()
  vi.useRealTimers()
  onlineManager.setOnline(true)
})
afterAll(() => {
  server.close()
})

describe("DocumentFlowView", () => {
  it("кроки за типами, посилання на картки, поточний документ без посилання", () => {
    renderView()
    const flow = screen.getByRole("list", { name: "Потік документів" })
    expect(
      within(flow)
        .getAllByRole("listitem")
        .filter((li) => li.dataset.slot === "document-flow-step"),
    ).toHaveLength(3)
    expect(
      within(item("Пропозиція")).getByRole("link", { name: "ПРО-1" }),
    ).toHaveAttribute("href", "/quotes/q1")
    expect(item("Пропозиція")).toHaveTextContent("Проведено")
    const current = item("Замовлення")
    expect(current).toHaveAttribute("aria-current", "page")
    expect(current).toHaveTextContent("Цей документ")
    expect(current).toHaveTextContent("На підставі ПРО-1")
    expect(within(current).queryByRole("link")).toBeNull()
  })

  it("без права — «Немає доступу» без посилання; видалений — позначка й «Без номера»", () => {
    renderView()
    const forbidden = item("Рахунок", 0)
    expect(forbidden).toHaveTextContent("РАХ-1")
    expect(forbidden).toHaveTextContent("Немає доступу")
    expect(forbidden).toHaveTextContent("На підставі ЗАМ-1")
    expect(within(forbidden).queryByRole("link")).toBeNull()
    const deleted = item("Рахунок", 1)
    expect(deleted).toHaveTextContent("Без номера")
    expect(deleted).toHaveTextContent("Видалено")
    expect(within(deleted).queryByRole("link")).toBeNull()
  })

  it("лише поточний документ — пояснення, а не порожній список", () => {
    renderView({
      flow: { documents: SAMPLE.documents.slice(1, 2), truncated: false },
    })
    expect(screen.queryByRole("list")).toBeNull()
    expect(
      screen.getByText(/Пов'язаних документів ще немає/),
    ).toBeInTheDocument()
  })

  it("помилка, офлайн і запит на паузі без мережі — повідомлення з повтором; немає права — без повтору", async () => {
    const onRetry = vi.fn()
    const { show } = renderView({
      flow: undefined,
      error: new ApiError(500, { code: "server", message: "boom" }),
      onRetry,
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося завантажити пов'язані документи.",
    )
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(onRetry).toHaveBeenCalledOnce()
    show({ flow: undefined, error: offline(), onRetry })
    expect(screen.getByRole("alert")).toHaveTextContent("Немає з'єднання")
    // Без мережі TanStack Query ставить запит на паузу без помилки: скелетон лишився б назавжди.
    show({ flow: undefined, isPaused: true, onRetry })
    expect(screen.getByRole("alert")).toHaveTextContent("Немає з'єднання")
    show({
      flow: undefined,
      error: new ApiError(403, { code: "forbidden", message: "no" }),
      onRetry,
    })
    expect(
      screen.getByText("Немає права бачити пов'язані документи."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("завантаження — скелетон; збій оновлення — дані лишаються з повідомленням; обрізаний — підпис", () => {
    const { show } = renderView({ flow: undefined })
    expect(
      screen.getByRole("status", {
        name: "Завантаження пов'язаних документів",
      }),
    ).toBeInTheDocument()
    show({
      flow: { ...SAMPLE, truncated: true },
      error: offline(),
      onRetry: vi.fn(),
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося оновити пов'язані документи",
    )
    expect(screen.getByRole("link", { name: "ПРО-1" })).toBeInTheDocument()
    expect(screen.getByText(/Показано не всі/)).toBeInTheDocument()
  })

  it("оновлення з видимими даними: до 1 с без індикатора, далі спінер; список зайнятий одразу", () => {
    vi.useFakeTimers()
    const { container, show } = renderView()
    show({ isFetching: true })
    const spinner = () => container.querySelector('[data-slot="spinner"]')
    expect(
      screen.getByRole("list", { name: "Потік документів" }),
    ).toHaveAttribute("aria-busy", "true")
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(spinner()).toBeNull()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(spinner()).not.toBeNull()
    show({ isFetching: false })
    expect(spinner()).toBeNull()
  })
})

const me: Me = {
  id: "full",
  name: "full",
  email: "full@test.example",
  roles: [],
  permissions: ["quotes:*", "orders:*"],
  companies: [],
  companyId: null,
  factors: [],
}

function renderLive(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData<Me>(ME_QUERY_KEY, me)
  render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={data} queryClient={queryClient}>
        {children}
      </CoreAdminContext>
    </MemoryRouter>,
  )
  return queryClient
}

describe("DocumentFlow", () => {
  it("бере потік із сервера й перечитує його разом із ресурсом картки", async () => {
    const queryClient = renderLive(
      <DocumentFlow resource="orders" id="o3" types={TYPES} />,
    )
    const step = await screen.findByRole("list", { name: "Замовлення" })
    expect(within(step).getByRole("link", { name: "ЗАМ-2" })).toHaveAttribute(
      "href",
      "/orders/o2",
    )
    expect(within(step).getAllByRole("listitem")[1]).toHaveTextContent(
      "Виправлена копія ЗАМ-2",
    )
    orders.db.patch("o5", { number: "ЗАМ-55" })
    await act(() => queryClient.invalidateQueries({ queryKey: ["orders"] }))
    expect(
      await within(step).findByRole("link", { name: "ЗАМ-55" }),
    ).toBeInTheDocument()
  })

  it("без мережі запит на паузі — повідомлення, а не вічний скелетон; з мережею потік приходить сам", async () => {
    onlineManager.setOnline(false)
    renderLive(<DocumentFlow resource="orders" id="o3" types={TYPES} />)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Немає з'єднання",
    )
    const retry = screen.getByRole("button", { name: "Спробувати ще" })
    await userEvent.click(retry)
    // Стан не змінився: фокус лишився на кнопці, а не перейшов на потік.
    expect(retry).toHaveFocus()
    act(() => {
      onlineManager.setOnline(true)
    })
    expect(
      await screen.findByRole("list", { name: "Замовлення" }),
    ).toBeInTheDocument()
  })

  it("«Спробувати ще» лишає фокус у потоці, а не на body", async () => {
    setScenario("error", "orders")
    renderLive(<DocumentFlow resource="orders" id="o3" types={TYPES} />)
    const retry = await screen.findByRole("button", { name: "Спробувати ще" })
    resetScenarios()
    await userEvent.click(retry)
    expect(document.activeElement).toBe(
      document.querySelector('[data-slot="document-flow"]'),
    )
    expect(
      await screen.findByRole("list", { name: "Замовлення" }),
    ).toBeInTheDocument()
  })

  it("панель дій не чекає, поки повільний сервер перечитає потік", async () => {
    const created = vi.fn()
    renderLive(
      <>
        <DocumentActionBar
          resource="orders"
          record={{ id: "o5", version: 1, status: "cancelled" }}
          transitions={[
            { id: "amend", label: "Виправити", from: ["cancelled"] },
          ]}
          onCreated={created}
        />
        <DocumentFlow resource="orders" id="o5" types={TYPES} />
      </>,
    )
    await screen.findByRole("list", { name: "Замовлення" })
    let flowRequests = 0
    server.use(
      http.get(`${BASE}/orders/:id/flow`, async () => {
        flowRequests += 1
        await delay("infinite")
      }),
    )
    await userEvent.click(screen.getByRole("button", { name: "Виправити" }))
    await vi.waitFor(() => {
      expect(created).toHaveBeenCalledOnce()
    })
    // Потік однаково перечитується після дії, просто панель на нього не чекає.
    await vi.waitFor(() => {
      expect(flowRequests).toBe(1)
    })
  })
})
