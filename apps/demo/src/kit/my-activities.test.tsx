import { QueryClient } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext } from "ra-core"
import { Suspense } from "react"
import { MemoryRouter, Route, Routes } from "react-router"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/registry/lib/api"
import type { ErpAuthProvider, Me } from "@/registry/lib/auth"
import { todayIn } from "@/registry/lib/dates"
import { connectRealtime, getRealtimeStatus } from "@/registry/lib/realtime"
import { REALTIME_FLUSH_MS } from "@/registry/lib/realtime-cache"
import type {
  TimelineApi,
  TimelineMyActivitiesPage,
  TimelineMyActivity,
} from "@/registry/lib/timeline"
import {
  createTimelineModule,
  type TimelineExtension,
} from "@/registry/modules/N1-timeline"

/** «Мої справи» (ADR-0054): стани SPEC §8.1, дії в рядку, фокус, вкладка в адресі. */
const ME = { id: "u-1", name: "Олена Коваль", permissions: [] } as unknown as Me
const PATH = "/my-activities"
const TODAY = todayIn()

const row = (
  id: string,
  overrides: Partial<TimelineMyActivity> = {},
): TimelineMyActivity => ({
  id,
  version: 1,
  type: "call",
  title: `Дія ${id}`,
  dueDate: "2020-01-01",
  assignee: { id: "u-1", name: "Олена Коваль" },
  record: { resource: "invoices", id: `inv-${id}`, title: `Рахунок ${id}` },
  ...overrides,
})

const pageOf = (
  rows: TimelineMyActivity[],
  total = rows.length,
): TimelineMyActivitiesPage => ({ data: rows, total })

const apiError = (status: number) =>
  new ApiError(status, { code: "x", message: "x" })

async function setup(
  api: Partial<TimelineApi> = {},
  extension: TimelineExtension = {
    myActivities: { recordHref: ({ id }) => `/invoices/${id}` },
  },
  path = PATH,
) {
  const timeline = {
    myActivities: vi.fn(() => Promise.resolve(pageOf([row("a")]))),
    updateActivity: vi.fn(() => Promise.resolve(row("a"))),
    ...api,
  }
  const authProvider = {
    getMe: vi.fn(() => Promise.resolve(ME)),
    checkAuth: vi.fn(() => Promise.resolve()),
    checkError: vi.fn(() => Promise.resolve()),
    timeline,
  } as unknown as ErpAuthProvider
  const timelineModule = createTimelineModule({ extension })
  // Чанк завантажено заздалегідь: призупинений поза `act` рендер React у тестах сам не відновлює.
  await import("@/registry/modules/N1-timeline/pages/my-activities-page")
  timelineModule.preload(PATH)
  await vi.dynamicImportSettled()
  render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext
        authProvider={authProvider}
        queryClient={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Suspense fallback={null}>
          <Routes>
            {timelineModule.routes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
              />
            ))}
            <Route path="/invoices/:id" element={<p>Картка запису</p>} />
          </Routes>
        </Suspense>
      </CoreAdminContext>
    </MemoryRouter>,
  )
  return timeline
}

const list = () => screen.findByRole("list", { name: "Мої заплановані дії" })
const tab = (name: string) => screen.findByRole("tab", { name })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("«Мої справи»: рядки", () => {
  it("запис посиланням, виконавця немає, прострочене словом", async () => {
    await setup()
    const item = within(await list()).getByRole("listitem")
    expect(
      within(item).getByRole("link", { name: "Рахунок a" }),
    ).toHaveAttribute("href", "/invoices/inv-a")
    expect(item).toHaveTextContent("Прострочено")
    expect(item).not.toHaveTextContent("Олена Коваль")
  })

  it("без адреси картки назва лишається текстом, запис без назви показує `id`", async () => {
    await setup(
      {
        myActivities: vi.fn(() =>
          Promise.resolve(
            pageOf([
              row("a", {
                record: { resource: "deals", id: "d-7", title: undefined },
              }),
            ]),
          ),
        ),
      },
      { myActivities: {} },
    )
    const item = within(await list()).getByRole("listitem")
    expect(item).toHaveTextContent("d-7")
    expect(within(item).queryByRole("link")).not.toBeInTheDocument()
  })

  it("порожня назва запису: посилання називає `id`, а не лишається без імені", async () => {
    await setup({
      myActivities: vi.fn(() =>
        Promise.resolve(
          pageOf([
            row("a", {
              record: { resource: "invoices", id: "inv-7", title: "  " },
            }),
          ]),
        ),
      ),
    })
    expect(
      within(await list()).getByRole("link", { name: "inv-7" }),
    ).toBeInTheDocument()
  })

  it("той самий `id` дії в різних записах — різні рядки", async () => {
    await setup({
      myActivities: vi.fn(() =>
        Promise.resolve(
          pageOf([
            row("a"),
            row("a", {
              record: { resource: "contacts", id: "c-1", title: "Контакт" },
            }),
          ]),
        ),
      ),
    })
    expect(within(await list()).getAllByRole("listitem")).toHaveLength(2)
  })

  it("заборонена дія: причина замість кнопок (ADR-0037)", async () => {
    await setup({
      myActivities: vi.fn(() =>
        Promise.resolve(
          pageOf([row("a", { deniedActions: { update: "own" } })]),
        ),
      ),
    })
    const item = within(await list()).getByRole("listitem")
    expect(
      within(item).getByRole("button", { name: "Виконано: Дія a" }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      within(item).queryByRole("button", { name: "Дії: Дія a" }),
    ).not.toBeInTheDocument()
  })
})

describe("«Мої справи»: вкладки", () => {
  it("вкладка йде в запит межами дат і лишається в адресі", async () => {
    const timeline = await setup()
    await userEvent.click(await tab("Сьогодні"))
    await waitFor(() => {
      expect(timeline.myActivities).toHaveBeenLastCalledWith(
        { dueFrom: TODAY, dueTo: TODAY },
        1,
        20,
        expect.anything(),
      )
    })
    expect(await tab("Сьогодні")).toHaveAttribute("aria-selected", "true")
  })

  it("вкладка з адреси; невідома — «Усі»", async () => {
    await setup({}, undefined, `${PATH}?tab=overdue`)
    expect(await tab("Прострочені")).toHaveAttribute("aria-selected", "true")
  })

  it("невідома вкладка в адресі — «Усі»", async () => {
    const timeline = await setup({}, undefined, `${PATH}?tab=strange`)
    await list()
    expect(timeline.myActivities).toHaveBeenLastCalledWith(
      {},
      1,
      20,
      expect.anything(),
    )
  })

  it("`perPage` з розширення", async () => {
    const timeline = await setup({}, { myActivities: { perPage: 5 } })
    await list()
    expect(timeline.myActivities).toHaveBeenLastCalledWith(
      {},
      1,
      5,
      expect.anything(),
    )
  })

  it("`perPage` понад стелю контракту обрізається: рахунок сторінок не розходиться", async () => {
    const timeline = await setup({}, { myActivities: { perPage: 500 } })
    await list()
    expect(timeline.myActivities).toHaveBeenLastCalledWith(
      {},
      1,
      100,
      expect.anything(),
    )
  })

  it("«Показати ще» не стосується рядків попередньої вкладки", async () => {
    const myActivities = vi
      .fn<TimelineApi["myActivities"]>()
      .mockResolvedValueOnce(pageOf([row("a")], 5))
      .mockReturnValue(new Promise(() => undefined))
    await setup({ myActivities }, { myActivities: { perPage: 1 } })
    await screen.findByRole("button", { name: "Показати ще" })
    await userEvent.click(await tab("Прострочені"))
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Показати ще" }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText("Дія a")).toBeInTheDocument()
  })
})

describe("«Мої справи»: стани SPEC §8.1", () => {
  it("порожньо вперше: пояснення, а не «нічого не знайдено»", async () => {
    await setup({
      myActivities: vi.fn(() => Promise.resolve(pageOf([]))),
    })
    expect(await screen.findByText("Справ немає")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Скинути/ }),
    ).not.toBeInTheDocument()
  })

  it("порожня вкладка: «0 збігів» і повернення до всіх", async () => {
    const myActivities = vi.fn((range: object) =>
      Promise.resolve(pageOf(Object.keys(range).length ? [] : [row("a")])),
    )
    await setup({ myActivities }, undefined, `${PATH}?tab=today`)
    expect(
      await screen.findByText("На цій вкладці справ немає"),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Скинути/ }))
    expect(await list()).toBeInTheDocument()
    expect(await tab("Усі")).toHaveAttribute("aria-selected", "true")
  })

  it("збій: повідомлення з повтором, порожній стан його не підміняє", async () => {
    const myActivities = vi
      .fn<TimelineApi["myActivities"]>()
      .mockRejectedValueOnce(apiError(500))
      .mockResolvedValue(pageOf([row("a")]))
    await setup({ myActivities })
    await userEvent.click(
      await screen.findByRole("button", { name: "Спробувати ще" }),
    )
    expect(await list()).toBeInTheDocument()
    expect(screen.queryByText("Справ немає")).not.toBeInTheDocument()
  })

  it("403: «Немає доступу»", async () => {
    await setup({
      myActivities: vi.fn(() => Promise.reject(apiError(403))),
    })
    expect(await screen.findByText("Немає доступу")).toBeInTheDocument()
  })

  it("мережевий збій: «Немає з'єднання» з повтором", async () => {
    await setup({
      myActivities: vi.fn(() =>
        Promise.reject(new ApiError(0, { code: "offline", message: "x" })),
      ),
    })
    expect(await screen.findByText("Немає з'єднання")).toBeInTheDocument()
  })

  it("«Показати ще»: дозавантаження, повтор рядка не двоїться, фокус на першому новому", async () => {
    const myActivities = vi.fn((_range: object, page: number) =>
      Promise.resolve(
        page === 1
          ? pageOf([row("a"), row("b")], 3)
          : pageOf([row("b"), row("c")], 3),
      ),
    )
    await setup({ myActivities }, { myActivities: { perPage: 2 } })
    expect(await screen.findByText("Показано 2 з 3")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }))
    expect(await screen.findByText("Показано 3 з 3")).toBeInTheDocument()
    const items = within(await list()).getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(
      screen.queryByRole("button", { name: "Показати ще" }),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(items[2]).toHaveFocus()
    })
  })

  it("збій «Показати ще» лишає показане й дає повтор", async () => {
    const myActivities = vi
      .fn<TimelineApi["myActivities"]>()
      .mockResolvedValueOnce(pageOf([row("a")], 2))
      .mockRejectedValueOnce(apiError(500))
      .mockResolvedValue(pageOf([row("b")], 2))
    await setup({ myActivities }, { myActivities: { perPage: 1 } })
    await userEvent.click(
      await screen.findByRole("button", { name: "Показати ще" }),
    )
    expect(
      await screen.findByText("Не вдалося завантажити ще записи."),
    ).toBeInTheDocument()
    expect(within(await list()).getAllByRole("listitem")).toHaveLength(1)
  })
})

describe("«Мої справи»: оновлення за подіями", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("подія стрічки будь-якого ресурсу перечитує список, інша подія ні", async () => {
    const timeline = await setup()
    await list()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
    })
    const stop = connectRealtime({
      open: () =>
        Promise.resolve(
          new Response(body, {
            headers: { "Content-Type": "text/event-stream" },
          }),
        ),
      accountId: ME.id,
      companyId: "my-activities-test",
    })
    await vi.waitFor(() => {
      expect(getRealtimeStatus()).toBe("open")
    })
    const send = async (type: string) => {
      const event = { type, resource: "contacts", id: "c-1", at: TODAY }
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
      )
      await act(() => vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS * 2))
    }
    await send("contacts.exported")
    expect(timeline.myActivities).toHaveBeenCalledTimes(1)
    await send("contacts.timeline")
    await waitFor(() => {
      expect(timeline.myActivities).toHaveBeenCalledTimes(2)
    })
    stop()
  })
})

describe("«Мої справи»: дії в рядку", () => {
  it("«Виконано»: PATCH адреси запису, рядок зник, фокус на заголовку", async () => {
    const myActivities = vi
      .fn<TimelineApi["myActivities"]>()
      .mockResolvedValueOnce(pageOf([row("a")]))
      .mockResolvedValue(pageOf([]))
    const timeline = await setup({ myActivities })
    await userEvent.click(
      await screen.findByRole("button", { name: "Виконано: Дія a" }),
    )
    await waitFor(() => {
      expect(timeline.updateActivity).toHaveBeenCalledWith(
        { resource: "invoices", id: "inv-a" },
        "a",
        { version: 1, status: "done" },
      )
    })
    expect(await screen.findByText("Справ немає")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus()
    })
  })

  it("«Виконано» посеред списку: фокус на сусідньому рядку, сторінка не стрибає", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    const myActivities = vi
      .fn<TimelineApi["myActivities"]>()
      .mockResolvedValueOnce(pageOf([row("a"), row("b")]))
      .mockResolvedValue(pageOf([row("b")]))
    await setup({ myActivities })
    await userEvent.click(
      await screen.findByRole("button", { name: "Виконано: Дія a" }),
    )
    await waitFor(async () => {
      expect(within(await list()).getByRole("listitem")).toHaveFocus()
    })
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  })

  it.each([404, 409])(
    "%i: дію змінили, список перечитано, рядок лишився без фокуса на сторінці",
    async (status) => {
      const error = vi.spyOn(toast, "error")
      const myActivities = vi.fn(() => Promise.resolve(pageOf([row("a")])))
      await setup({
        myActivities,
        updateActivity: vi.fn(() => Promise.reject(apiError(status))),
      })
      await userEvent.click(
        await screen.findByRole("button", { name: "Виконано: Дія a" }),
      )
      await waitFor(() => {
        expect(error).toHaveBeenCalledWith(
          "Дію щойно змінили. Перевірте нові значення й спробуйте ще раз.",
        )
      })
      await waitFor(() => {
        expect(myActivities.mock.calls.length).toBeGreaterThan(1)
      })
    },
  )

  it("скасування: підтвердження, останній рядок зникає, діалог закривається", async () => {
    const myActivities = vi
      .fn<TimelineApi["myActivities"]>()
      .mockResolvedValueOnce(pageOf([row("a")]))
      .mockResolvedValue(pageOf([]))
    const timeline = await setup({ myActivities })
    await userEvent.click(
      await screen.findByRole("button", { name: "Дії: Дія a" }),
    )
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Скасувати дію" }),
    )
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Скасувати дію" }),
    )
    await waitFor(() => {
      expect(timeline.updateActivity).toHaveBeenCalledWith(
        { resource: "invoices", id: "inv-a" },
        "a",
        { version: 1, status: "cancelled" },
      )
    })
    expect(await screen.findByText("Справ немає")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })
  })
})
