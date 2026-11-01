import { QueryClient } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext, type DataProvider } from "ra-core"
import { Suspense } from "react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/registry/lib/api"
import type { ImportRun } from "@/registry/modules/A4-import-export/contract"
import type { ErpAuthProvider, Me } from "@/registry/lib/auth"
import {
  createImportExportModule,
  type ImportExportExtension,
} from "@/registry/modules/A4-import-export"
import { CONTACTS_TARGET } from "@/registry/modules/A4-import-export/targets"

/** Сторінки модуля A4 (ADR-0050): стани, яких не дають люди демо, і розширення проекту. */
const TARGETS = "/import-export"
/** Перший імпорт ліниво вантаженої сторінки довший за очікування `findBy`. */
const PAGES_TIMEOUT_MS = 60_000
/** Як у `createQueryClient`: кеш запису ще свіжий, коли людина відкриває подробиці. */
const STALE_MS = 30_000
/** Трохи довше за один крок опитування запусків. */
const POLL_WAIT_MS = 4000

beforeAll(async () => {
  await Promise.all([
    import("@/registry/modules/A4-import-export/pages/targets-page"),
    import("@/registry/modules/A4-import-export/pages/run-page"),
    import("@/registry/modules/A4-import-export/pages/history-page"),
  ])
}, PAGES_TIMEOUT_MS)

async function setup({
  permissions = ["*"],
  extension,
  getMe,
  canAccess = () => Promise.resolve(true),
  dataProvider,
  path = TARGETS,
}: {
  dataProvider?: DataProvider
  permissions?: string[]
  extension?: ImportExportExtension
  getMe?: () => Promise<Partial<Me>>
  canAccess?: () => Promise<boolean>
  path?: string
} = {}) {
  const { routes } = createImportExportModule({ extension })
  const authProvider = {
    checkAuth: () => Promise.resolve(),
    getIdentity: () => Promise.resolve({ id: "u1" }),
    canAccess,
    getMe: getMe ?? (() => Promise.resolve({ permissions })),
  } as unknown as ErpAuthProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: STALE_MS } },
  })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  // Сторінка лінива й призупиняє перший рендер: без асинхронного `act` React не повторює його.
  await act(async () => {
    render(
      <CoreAdminContext
        authProvider={authProvider}
        dataProvider={dataProvider}
        queryClient={queryClient}
      >
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </CoreAdminContext>,
    )
    await Promise.resolve()
  })
}

const targetHeadings = async () => {
  await screen.findByRole("list", {
    name: "Що можна імпортувати й експортувати",
  })
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent)
}

describe("сторінка цілей", () => {
  it("видно лише цілі з правами, без права дія неактивна", async () => {
    await setup({ permissions: ["contacts:read", "taxes:create"] })
    expect(await targetHeadings()).toEqual(["Контакти", "Податки"])
    expect(
      screen.getByRole("button", { name: "Імпортувати: Контакти" }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByRole("link", { name: "Імпортувати: Податки" }),
    ).toHaveAttribute("href", "/import-export/taxes")
    expect(
      screen.getByRole("button", { name: "Експортувати: Податки" }),
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("`read:own` дає експорт", async () => {
    await setup({ permissions: ["contacts:read:own"] })
    await targetHeadings()
    expect(
      screen.getByRole("button", { name: "Експортувати: Контакти" }),
    ).not.toHaveAttribute("aria-disabled")
  })

  it("без жодної цілі — немає доступу", async () => {
    await setup({ permissions: ["invoices:read"] })
    expect(await screen.findByText("Немає доступу")).toBeVisible()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })

  it("профіль не завантажився: помилка з повтором, а не вічний скелетон", async () => {
    const getMe = vi
      .fn<() => Promise<Partial<Me>>>()
      .mockRejectedValueOnce(
        new ApiError(500, { code: "server", message: "Boom" }),
      )
      .mockResolvedValue({ permissions: ["*"] })
    await setup({ getMe })
    await userEvent.click(
      await screen.findByRole("button", { name: "Спробувати ще" }),
    )
    expect(await targetHeadings()).toContain("Контакти")
  })

  it("розширення ховає, міняє й додає цілі", async () => {
    await setup({
      extension: {
        targets: {
          hide: ["taxes", "units", "tags", "reasons"],
          change: [
            {
              id: "contacts",
              label: "Клієнти",
              fields: [
                ...CONTACTS_TARGET.fields,
                { key: "source", label: "Джерело" },
              ],
            },
          ],
          add: [
            {
              id: "products",
              label: "Товари",
              fields: [{ key: "sku", label: "Артикул", required: true }],
              place: "start",
            },
          ],
        },
      },
    })
    expect(await targetHeadings()).toEqual(["Товари", "Клієнти", "Організації"])
  })

  it("проект сховав усі цілі: порожньо, а не «немає доступу»", async () => {
    await setup({
      extension: {
        targets: {
          hide: [
            "contacts",
            "organizations",
            "taxes",
            "units",
            "tags",
            "reasons",
          ],
        },
      },
    })
    expect(
      await screen.findByText("Імпорту й експорту тут немає"),
    ).toBeVisible()
    expect(screen.queryByText("Немає доступу")).not.toBeInTheDocument()
  })

  it("без сторінки історії немає й посилання на неї", async () => {
    await setup({ extension: { history: { page: false } } })
    await targetHeadings()
    expect(
      screen.queryByRole("link", { name: "Історія імпорту" }),
    ).not.toBeInTheDocument()
  })
})

describe("історія", () => {
  const RUN: ImportRun = {
    id: "run-1",
    version: 1,
    target: "contacts",
    fileName: "контакти.csv",
    status: "running",
    total: 2,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    startedBy: "u1",
    startedByName: "Олена Коваль",
    startedAt: "2026-10-31T10:00:00.000Z",
    finishedAt: null,
  }

  function historyProvider({
    running = () => ({ data: [RUN], total: 1 }),
    getOne = () => RUN,
  }: {
    running?: () => { data: ImportRun[]; total: number }
    getOne?: () => ImportRun
  }) {
    const isProbe = (params: { filter?: { status?: string } }) =>
      params.filter?.status === "running"
    const getList = vi.fn((resource: string, params: object) => {
      if (resource !== "import-runs")
        return Promise.resolve({ data: [], total: 0 })
      return isProbe(params)
        ? Promise.resolve(running())
        : Promise.resolve({ data: [RUN], total: 1 })
    })
    const provider = {
      getList,
      getOne: () => Promise.resolve({ data: getOne() }),
    } as unknown as DataProvider
    const listReads = () =>
      getList.mock.calls.filter(
        ([resource, params]) => resource === "import-runs" && !isProbe(params),
      ).length
    const probes = () =>
      getList.mock.calls.filter(([, params]) => isProbe(params)).length
    return { provider, listReads, probes }
  }

  it("подробиці показують свіжий запис, а не рядок списку", async () => {
    const { provider } = historyProvider({
      getOne: () => ({ ...RUN, status: "done", created: 2 }),
    })
    await setup({ path: "/import-history", dataProvider: provider })
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Подробиці запуску: контакти.csv",
      }),
    )
    const details = await screen.findByRole("dialog", { name: "контакти.csv" })
    expect(await within(details).findByText("Готово")).toBeVisible()
  })

  it("запуск закінчився: список читається знову", async () => {
    const { provider, listReads } = historyProvider({
      running: vi
        .fn(() => ({ data: [] as ImportRun[], total: 0 }))
        .mockReturnValueOnce({ data: [RUN], total: 1 }),
    })
    await setup({ path: "/import-history", dataProvider: provider })
    await screen.findByText("контакти.csv")
    const before = listReads()
    await waitFor(
      () => {
        expect(listReads()).toBeGreaterThan(before)
      },
      { timeout: POLL_WAIT_MS },
    )
  })

  it(
    "збій запиту зупиняє опитування",
    async () => {
      const running = vi
        .fn<() => { data: ImportRun[]; total: number }>()
        .mockReturnValueOnce({ data: [RUN], total: 1 })
        .mockImplementation(() => {
          throw new ApiError(500, { code: "server", message: "Boom" })
        })
      const { provider, probes } = historyProvider({ running })
      await setup({ path: "/import-history", dataProvider: provider })
      await screen.findByText("контакти.csv")
      await waitFor(
        () => {
          expect(probes()).toBe(2)
        },
        { timeout: POLL_WAIT_MS },
      )
      await new Promise((resolve) => setTimeout(resolve, POLL_WAIT_MS))
      expect(probes()).toBe(2)
    },
    3 * POLL_WAIT_MS,
  )
})

describe("майстер цілі", () => {
  it("невідома ціль — не знайдено", async () => {
    await setup({ path: `${TARGETS}/unknown` })
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Сторінку не знайдено",
      }),
    ).toBeVisible()
  })

  it("невідома ціль не питає про права й не лишає порожньої назви", async () => {
    const canAccess = vi.fn(() => Promise.resolve(true))
    await setup({ path: `${TARGETS}/unknown`, canAccess })
    await screen.findByRole("heading", {
      level: 1,
      name: "Сторінку не знайдено",
    })
    expect(canAccess).not.toHaveBeenCalled()
    expect(document.title).toBe("Імпорт і експорт")
  })

  it("збій перевірки прав — помилка з повтором, а не «немає доступу»", async () => {
    const canAccess = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(
        new ApiError(500, { code: "server", message: "Boom" }),
      )
      .mockResolvedValue(true)
    await setup({ path: `${TARGETS}/contacts`, canAccess })
    await userEvent.click(
      await screen.findByRole("button", { name: "Спробувати ще" }),
    )
    await screen.findByRole("heading", { level: 1, name: "Імпорт: Контакти" })
  })

  it("майстер показує ціль у заголовку й веде назад", async () => {
    await setup({ path: `${TARGETS}/contacts` })
    await screen.findByRole("heading", { level: 1, name: "Імпорт: Контакти" })
    await userEvent.click(
      screen.getByRole("link", { name: "До імпорту й експорту" }),
    )
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Імпорт і експорт" }),
      ).toBeVisible()
    })
  })
})
