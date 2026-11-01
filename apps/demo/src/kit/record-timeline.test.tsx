import { onlineManager, QueryClient } from "@tanstack/react-query"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext } from "ra-core"
import { toast } from "sonner"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { RecordTimeline } from "@/registry/erp/record-timeline"
import { preloadRichTextEditor } from "@/registry/erp/rich-text-field"
import { ApiError } from "@/registry/lib/api"
import type { ErpAuthProvider, Me } from "@/registry/lib/auth"
import { connectRealtime, getRealtimeStatus } from "@/registry/lib/realtime"
import { REALTIME_FLUSH_MS } from "@/registry/lib/realtime-cache"
import {
  TIMELINE_POLL_MS,
  type TimelineActivity,
  type TimelineApi,
  type TimelineEntry,
  type TimelinePage,
} from "@/registry/lib/timeline"

/** Стрічка запису (ADR-0053): стани, яких не видно на моках із панелі, і збереження тексту. */
const ME = { id: "u-1", name: "Олена Коваль", permissions: [] } as unknown as Me

const doc = (text: string) => ({
  type: "doc" as const,
  content: [
    { type: "paragraph" as const, content: [{ type: "text" as const, text }] },
  ],
})

const note = (id: string, text = `Нотатка ${id}`): TimelineEntry => ({
  id,
  at: "2026-10-30T10:00:00.000Z",
  kind: "note",
  author: { id: "u-1", name: "Олена Коваль" },
  version: 1,
  body: doc(text),
})

const pageOf = (
  entries: TimelineEntry[],
  total = entries.length,
): TimelinePage => ({ data: entries, total })

const ACTIVITY: TimelineActivity = {
  id: "a1",
  version: 1,
  type: "call",
  title: "Подзвонити",
  dueDate: "2020-01-01",
  assignee: { id: "u-1", name: "Олена Коваль" },
}

const serverError = () => new ApiError(500, { code: "server", message: "Boom" })

/** Запит, що летить, доки тест його не відпустить. */
function deferred<T>() {
  let accept!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    accept = resolve
  })
  return { promise, accept }
}

function setup(
  api: Partial<TimelineApi> = {},
  props: Partial<React.ComponentProps<typeof RecordTimeline>> = {},
) {
  const timeline = {
    list: vi.fn(() => Promise.resolve(pageOf([note("n1")]))),
    post: vi.fn(() => Promise.resolve(note("n2"))),
    updateNote: vi.fn(() => Promise.resolve(note("n1"))),
    remove: vi.fn(() => Promise.resolve()),
    uploadFile: vi.fn(() => Promise.resolve(note("f"))),
    followers: vi.fn(() => Promise.resolve([])),
    follow: vi.fn(() => Promise.resolve()),
    unfollow: vi.fn(() => Promise.resolve()),
    activities: vi.fn(() => Promise.resolve([])),
    addActivity: vi.fn(() => Promise.resolve(ACTIVITY)),
    updateActivity: vi.fn(() => Promise.resolve(ACTIVITY)),
    myActivities: vi.fn(() => Promise.resolve({ data: [], total: 0 })),
    ...api,
  } satisfies TimelineApi
  const authProvider = {
    getMe: vi.fn(() => Promise.resolve(ME)),
    checkError: vi.fn(() => Promise.resolve()),
    timeline,
  } as unknown as ErpAuthProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const element = (id: string) => (
    <CoreAdminContext authProvider={authProvider} queryClient={queryClient}>
      <RecordTimeline resource="invoices" id={id} {...props} />
    </CoreAdminContext>
  )
  const view = render(element("inv-1"))
  return {
    timeline,
    queryClient,
    showRecord: (id: string) => {
      view.rerender(element(id))
    },
  }
}

/** Вставлення, а не набір: на курсорі ProseMirror читає зміни з DOM, а в jsdom літери губляться. */
const write = async (
  user: ReturnType<typeof userEvent.setup>,
  editor: HTMLElement,
  text: string,
) => {
  act(() => {
    editor.focus()
  })
  await user.paste(text)
}

const findEditor = async (name = "Нотатка для команди") => {
  const editor = await screen.findByRole("textbox", { name })
  await waitFor(() => {
    expect(editor).toHaveAttribute("contenteditable", "true")
  })
  return editor
}

// Перше завантаження Tiptap довше за очікування `findBy`.
beforeAll(preloadRichTextEditor, 30_000)

// jsdom не рахує розмірів, а ProseMirror прокручує до курсора після кожної команди з фокусом.
beforeAll(() => {
  const noRect = () =>
    ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) as DOMRect
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: noRect,
  })
  Object.assign(Element.prototype, { getClientRects: () => [] })
})

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true)
  })
})

describe("RecordTimeline: перше завантаження", () => {
  it("немає мережі: «Немає з'єднання», а не вічний скелетон", async () => {
    act(() => {
      onlineManager.setOnline(false)
    })
    setup()
    expect(await screen.findByText("Немає з'єднання")).toBeInTheDocument()
  })

  it("403: «Немає доступу», поля нової нотатки немає", async () => {
    setup({
      list: vi.fn(() =>
        Promise.reject(new ApiError(403, { code: "forbidden", message: "No" })),
      ),
    })
    expect(await screen.findByText("Немає доступу")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("збій: помилка не підміняється порожнім станом, повтор працює", async () => {
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue(pageOf([note("n1")]))
    const user = userEvent.setup()
    setup({ list })
    await user.click(
      await screen.findByRole("button", { name: "Спробувати ще" }),
    )
    expect(await screen.findByText("Нотатка n1")).toBeInTheDocument()
  })

  it("порожньо: пояснення й дія веде у поле", async () => {
    const user = userEvent.setup()
    setup({ list: vi.fn(() => Promise.resolve(pageOf([]))) })
    await user.click(
      await screen.findByRole("button", { name: "Написати нотатку" }),
    )
    const editor = await findEditor()
    await waitFor(() => {
      expect(editor).toHaveFocus()
    })
  })
})

describe("RecordTimeline: варіанти", () => {
  it("лише читання: поля й дій немає, записи видно", async () => {
    setup(
      { activities: vi.fn(() => Promise.resolve([ACTIVITY])) },
      { readOnly: true },
    )
    expect(await screen.findByText("Нотатка n1")).toBeInTheDocument()
    expect(screen.getByText(/Стрічка лише для перегляду/)).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(await screen.findByText("Подзвонити")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Виконано/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Запланувати" }),
    ).not.toBeInTheDocument()
  })

  it("без пошти: лишаються нотатки", async () => {
    setup({}, { messages: false })
    await findEditor()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
  })

  it("без підписників і дій: запитів немає", async () => {
    const { timeline } = setup({}, { followers: false, activities: false })
    await screen.findByText("Нотатка n1")
    expect(timeline.followers).not.toHaveBeenCalled()
    expect(timeline.activities).not.toHaveBeenCalled()
  })

  it("фільтр не пропонує того, чого в проекті немає", async () => {
    const user = userEvent.setup()
    setup({}, { messages: false, files: false })
    await screen.findByText("Нотатка n1")
    await user.click(screen.getByRole("combobox", { name: "Що показати" }))
    expect(
      (await screen.findAllByRole("option")).map((row) => row.textContent),
    ).toEqual(["Усе", "Нотатки", "Зміни полів"])
  })

  it("кілька стрічок на сторінці розрізняються назвою області", async () => {
    setup({}, { label: "Закритий рахунок" })
    expect(
      await screen.findByRole("region", { name: "Закритий рахунок" }),
    ).toBeInTheDocument()
  })

  it("прострочену дію видно словом", async () => {
    setup({ activities: vi.fn(() => Promise.resolve([ACTIVITY])) })
    expect(await screen.findByText("Прострочено")).toBeInTheDocument()
  })
})

describe("RecordTimeline: частковий збій", () => {
  it("підписники й дії не вантажаться: стрічку видно, у кожного свій повтор", async () => {
    const followers = vi
      .fn<TimelineApi["followers"]>()
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue([{ id: "u-2", name: "Марта" }])
    const activities = vi.fn(() => Promise.reject(serverError()))
    const user = userEvent.setup()
    setup({ followers, activities })
    expect(await screen.findByText("Нотатка n1")).toBeInTheDocument()
    const alert = await screen.findByText("Не вдалося завантажити підписників.")
    expect(
      await screen.findByText("Не вдалося завантажити заплановані дії."),
    ).toBeInTheDocument()
    await user.click(
      within(alert.parentElement as HTMLElement).getByRole("button", {
        name: "Спробувати ще",
      }),
    )
    expect(
      await screen.findByRole("button", { name: "1 підписник" }),
    ).toBeInTheDocument()
  })

  it("кнопка «Показати ще» зникла: фокус на першому новому записі", async () => {
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockResolvedValueOnce(pageOf([note("n1")], 25))
      .mockResolvedValue(pageOf([note("n2")], 25))
    const user = userEvent.setup()
    setup({ list })
    await user.click(await screen.findByRole("button", { name: "Показати ще" }))
    const added = await screen.findByText("Нотатка n2")
    await waitFor(() => {
      expect(added.closest("li")).toHaveFocus()
    })
  })

  it("порожня сторінка завершує список, навіть якщо `total` більший", async () => {
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockResolvedValueOnce(pageOf([note("n1")], 50))
      .mockResolvedValue(pageOf([], 50))
    const user = userEvent.setup()
    setup({ list })
    await user.click(await screen.findByRole("button", { name: "Показати ще" }))
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Показати ще" }),
      ).not.toBeInTheDocument()
    })
  })

  it("збій «Показати ще» лишає показане й дає повтор", async () => {
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockResolvedValueOnce(pageOf([note("n1")], 25))
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue(pageOf([note("n2")], 25))
    const user = userEvent.setup()
    setup({ list })
    await user.click(await screen.findByRole("button", { name: "Показати ще" }))
    expect(
      await screen.findByText("Не вдалося завантажити ще записи."),
    ).toBeInTheDocument()
    expect(screen.getByText("Нотатка n1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(await screen.findByText("Нотатка n2")).toBeInTheDocument()
  })

  it("оновлення не вдалося: показане лишається, видно час і повтор", async () => {
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockResolvedValueOnce(pageOf([note("n1")]))
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue(pageOf([note("n2"), note("n1")]))
    const user = userEvent.setup()
    const { queryClient } = setup({ list })
    await screen.findByText("Нотатка n1")
    await act(() => queryClient.invalidateQueries())
    expect(
      await screen.findByText(/Не вдалося оновити стрічку/),
    ).toBeInTheDocument()
    expect(screen.getByText("Нотатка n1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Оновити" }))
    expect(await screen.findByText("Нотатка n2")).toBeInTheDocument()
  })

  it("фільтр без збігів: «Скинути фільтри» повертає все", async () => {
    const list = vi.fn<TimelineApi["list"]>((_target, filter) =>
      Promise.resolve(pageOf(filter === "all" ? [note("n1")] : [])),
    )
    const user = userEvent.setup()
    setup({ list })
    await screen.findByText("Нотатка n1")
    await user.click(screen.getByRole("combobox", { name: "Що показати" }))
    await user.click(await screen.findByRole("option", { name: "Файли" }))
    await user.click(
      await screen.findByRole("button", { name: "Скинути фільтри" }),
    )
    expect(await screen.findByText("Нотатка n1")).toBeInTheDocument()
  })
})

describe("RecordTimeline: оновлення", () => {
  const encoder = new TextEncoder()

  afterEach(() => {
    vi.useRealTimers()
  })

  async function openChannel() {
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
      companyId: "timeline-test",
    })
    await vi.waitFor(() => {
      expect(getRealtimeStatus()).toBe("open")
    })
    const send = (id?: string) => {
      const event = {
        type: "invoices.timeline",
        resource: "invoices",
        id,
        at: "2026-11-01T10:00:00.000Z",
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    }
    const ping = () => {
      controller.enqueue(encoder.encode(": ping\n\n"))
    }
    return { stop, send, ping }
  }

  it("події запису збираються в один запит, чужий запис не чіпає", async () => {
    const { stop, send } = await openChannel()
    const list = vi.fn(() => Promise.resolve(pageOf([note("n1")])))
    setup({ list })
    await screen.findByText("Нотатка n1")
    send("inv-2")
    await act(() => vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS * 2))
    expect(list).toHaveBeenCalledTimes(1)
    send("inv-1")
    send("inv-1")
    send("inv-1")
    await act(() => vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS / 2))
    expect(list).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS))
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2)
    })
    stop()
  })

  it("подія без `id` стосується всього ресурсу", async () => {
    const { stop, send } = await openChannel()
    const list = vi.fn(() => Promise.resolve(pageOf([note("n1")])))
    setup({ list })
    await screen.findByText("Нотатка n1")
    send()
    await act(() => vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS))
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2)
    })
    stop()
  })

  it("подія під час «Показати ще» чекає її кінця", async () => {
    const { stop, send } = await openChannel()
    const more = deferred<TimelinePage>()
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockResolvedValueOnce(pageOf([note("n1")], 25))
      .mockImplementationOnce(() => more.promise)
      .mockResolvedValue(pageOf([note("n1")], 25))
    setup({ list })
    fireEvent.click(await screen.findByRole("button", { name: "Показати ще" }))
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2)
    })
    send("inv-1")
    await act(() => vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS * 2))
    expect(list).toHaveBeenCalledTimes(2)
    await act(async () => {
      more.accept(pageOf([note("n2")], 25))
      await more.promise
    })
    expect(await screen.findByText("Нотатка n2")).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(REALTIME_FLUSH_MS * 2))
    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(2)
    })
    stop()
  })

  it("канал відкрито: опитування немає", async () => {
    const { stop, ping } = await openChannel()
    const list = vi.fn(() => Promise.resolve(pageOf([note("n1")])))
    setup({ list })
    await screen.findByText("Нотатка n1")
    await act(() => vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS - 1_000))
    ping()
    await act(() => vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS - 1_000))
    expect(list).toHaveBeenCalledTimes(1)
    stop()
  })

  it("каналу немає: стрічка опитується", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const list = vi.fn(() => Promise.resolve(pageOf([note("n1")])))
    setup({ list })
    await screen.findByText("Нотатка n1")
    await act(() => vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS))
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2)
    })
  })
})

describe("RecordTimeline: новий запис", () => {
  it("надсилання: запит із ключем, поле порожнє лише після відповіді", async () => {
    const post = vi.fn<TimelineApi["post"]>(() => Promise.resolve(note("n2")))
    const user = userEvent.setup()
    setup({ post })
    const editor = await findEditor()
    await write(user, editor, "Погоджено")
    await user.click(screen.getByRole("button", { name: "Додати нотатку" }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
    })
    const [target, sent] = post.mock.calls[0] ?? []
    expect(target).toEqual({ resource: "invoices", id: "inv-1" })
    expect(sent).toMatchObject({ kind: "note", body: doc("Погоджено") })
    expect(sent?.requestId).toBeTruthy()
    await waitFor(() => {
      expect(editor).not.toHaveTextContent("Погоджено")
    })
  })

  it("поки запит летить, текст на місці", async () => {
    const pending = deferred<TimelineEntry>()
    const post = vi.fn<TimelineApi["post"]>(() => pending.promise)
    const user = userEvent.setup()
    setup({ post })
    const editor = await findEditor()
    await write(user, editor, "Погоджено")
    await user.click(screen.getByRole("button", { name: "Додати нотатку" }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
    })
    expect(editor).toHaveTextContent("Погоджено")
    act(() => {
      pending.accept(note("n2"))
    })
    await waitFor(() => {
      expect(editor).not.toHaveTextContent("Погоджено")
    })
  })

  it("дописане під час запиту лишається чернеткою того самого виду", async () => {
    const pending = deferred<TimelineEntry>()
    const post = vi.fn<TimelineApi["post"]>(() => pending.promise)
    const user = userEvent.setup()
    setup({ post })
    await findEditor()
    await user.click(screen.getByRole("tab", { name: "Повідомлення" }))
    const editor = await findEditor("Повідомлення клієнту")
    await write(user, editor, "Перше")
    const send = screen.getByRole("button", { name: "Надіслати клієнту" })
    await user.click(send)
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
    })
    await write(user, editor, " друге")
    await act(async () => {
      pending.accept(note("n2"))
      await pending.promise
    })
    await waitFor(() => {
      expect(send).not.toHaveAttribute("aria-disabled", "true")
    })
    expect(editor).toHaveTextContent("Перше друге")
    expect(screen.getByRole("tab", { name: "Повідомлення" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })

  it("стерли текст під час запиту: вид повертається до нотатки", async () => {
    const pending = deferred<TimelineEntry>()
    const post = vi.fn<TimelineApi["post"]>(() => pending.promise)
    const user = userEvent.setup()
    setup({ post })
    await findEditor()
    await user.click(screen.getByRole("tab", { name: "Повідомлення" }))
    const editor = await findEditor("Повідомлення клієнту")
    await write(user, editor, "Текст")
    await user.click(screen.getByRole("button", { name: "Надіслати клієнту" }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
    })
    act(() => {
      editor.focus()
    })
    await user.keyboard("{Control>}a{/Control}{Backspace}")
    await waitFor(() => {
      expect(editor).toHaveTextContent("")
    })
    await act(async () => {
      pending.accept(note("n2"))
      await pending.promise
    })
    expect(
      await screen.findByRole("button", { name: "Додати нотатку" }),
    ).toBeInTheDocument()
  })

  it("перечитування зависло: кнопка звільняється, запис уже збережено", async () => {
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockResolvedValueOnce(pageOf([note("n1")]))
      .mockImplementation(() => new Promise(() => undefined))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ list })
    const editor = await findEditor()
    await write(user, editor, "Погоджено")
    await user.click(screen.getByRole("button", { name: "Додати нотатку" }))
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    await waitFor(() => {
      expect(editor).not.toHaveTextContent("Погоджено")
    })
    vi.useRealTimers()
  })

  it("порожнє поле не йде на сервер, помилка біля поля", async () => {
    const user = userEvent.setup()
    const { timeline } = setup()
    await findEditor()
    await user.click(screen.getByRole("button", { name: "Додати нотатку" }))
    expect(await screen.findByText("Напишіть текст")).toBeInTheDocument()
    expect(timeline.post).not.toHaveBeenCalled()
  })

  it("збій: текст лишається, повтор іде з тим самим ключем", async () => {
    const post = vi
      .fn<TimelineApi["post"]>()
      .mockRejectedValueOnce(
        new ApiError(0, { code: "offline", message: "Network" }),
      )
      .mockResolvedValue(note("n2"))
    const user = userEvent.setup()
    setup({ post })
    const editor = await findEditor()
    await write(user, editor, "Важливий текст")
    const send = screen.getByRole("button", { name: "Додати нотатку" })
    await user.click(send)
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(editor).toHaveTextContent("Важливий текст")
    await user.click(send)
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(2)
    })
    expect(post.mock.calls[1]?.[1].requestId).toBe(
      post.mock.calls[0]?.[1].requestId,
    )
  })

  it("текст змінився після збою: ключ новий, інакше сервер поверне старий запис", async () => {
    const post = vi
      .fn<TimelineApi["post"]>()
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue(note("n2"))
    const user = userEvent.setup()
    setup({ post })
    const editor = await findEditor()
    await write(user, editor, "Текст")
    const send = screen.getByRole("button", { name: "Додати нотатку" })
    await user.click(send)
    await screen.findByRole("alert")
    await write(user, editor, " ще")
    await user.click(send)
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(2)
    })
    expect(post.mock.calls[1]?.[1].requestId).not.toBe(
      post.mock.calls[0]?.[1].requestId,
    )
  })

  it("після надсилання вид повертається до нотатки", async () => {
    const user = userEvent.setup()
    const { timeline } = setup()
    const editor = await findEditor()
    await user.click(screen.getByRole("tab", { name: "Повідомлення" }))
    await findEditor("Повідомлення клієнту")
    await write(user, editor, "Вітаю")
    await user.click(screen.getByRole("button", { name: "Надіслати клієнту" }))
    await waitFor(() => {
      expect(timeline.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: "message" }),
      )
    })
    expect(
      await screen.findByRole("button", { name: "Додати нотатку" }),
    ).toBeInTheDocument()
  })

  it("чернетка не переходить на інший запис", async () => {
    const user = userEvent.setup()
    const { showRecord } = setup()
    const editor = await findEditor()
    await write(user, editor, "Чернетка першого запису")
    showRecord("inv-2")
    const next = await findEditor()
    expect(next).not.toHaveTextContent("Чернетка")
  })
})

describe("RecordTimeline: файл", () => {
  const input = () => screen.getByTestId("timeline-file-input")

  it("завеликий файл не йде на сервер", async () => {
    const user = userEvent.setup()
    const { timeline } = setup({}, { maxFileBytes: 1 })
    await findEditor()
    await user.upload(input(), new File(["вміст"], "великий.pdf"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Файл завеликий")
    expect(timeline.uploadFile).not.toHaveBeenCalled()
  })

  it("збій: повтор тим самим ключем", async () => {
    const uploadFile = vi
      .fn<TimelineApi["uploadFile"]>()
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue(note("f"))
    const user = userEvent.setup()
    setup({ uploadFile })
    await findEditor()
    await user.upload(input(), new File(["вміст"], "договір.pdf"))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("договір.pdf")
    await user.click(
      within(alert).getByRole("button", { name: "Спробувати ще" }),
    )
    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledTimes(2)
    })
    expect(uploadFile.mock.calls[1]?.[2]).toBe(uploadFile.mock.calls[0]?.[2])
  })
})

describe("RecordTimeline: запис у стрічці", () => {
  it("небезпечна адреса файла не стає посиланням", async () => {
    setup({
      list: vi.fn(() =>
        Promise.resolve(
          pageOf([
            {
              id: "f1",
              at: "2026-10-30T10:00:00.000Z",
              kind: "file",
              author: { name: "Система" },
              file: {
                id: "1",
                name: "звіт.pdf",
                size: 2048,
                url: "javascript:alert(1)",
              },
            },
          ]),
        ),
      ),
    })
    expect(await screen.findByText("звіт.pdf")).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("чужу нотатку не змінити: дії неактивні, причина видна", async () => {
    const user = userEvent.setup()
    setup({
      list: vi.fn(() =>
        Promise.resolve(
          pageOf([
            {
              ...note("n1"),
              deniedActions: { update: "own", delete: "own" },
            } as TimelineEntry,
          ]),
        ),
      ),
    })
    await user.click(
      await screen.findByRole("button", { name: /Дії із записом/ }),
    )
    const edit = await screen.findByRole("menuitem", { name: /^Змінити/ })
    expect(edit).toHaveAttribute("aria-disabled", "true")
    expect(edit).toHaveAccessibleName(/лише свої записи/)
  })

  it("«Скасувати» в діалозі видалення: фокус на меню цього запису", async () => {
    const user = userEvent.setup()
    setup()
    const menu = await screen.findByRole("button", { name: /Дії із записом/ })
    await user.click(menu)
    await user.click(await screen.findByRole("menuitem", { name: "Видалити" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Скасувати" }))
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(menu).toHaveFocus()
    })
  })

  it("закрили поле нотатки: фокус на меню цього запису", async () => {
    const user = userEvent.setup()
    setup()
    const menu = await screen.findByRole("button", { name: /Дії із записом/ })
    await user.click(menu)
    await user.click(await screen.findByRole("menuitem", { name: "Змінити" }))
    const form = await screen.findByRole("textbox", { name: "Текст нотатки" })
    await waitFor(() => {
      expect(form).toHaveAttribute("contenteditable", "true")
    })
    await user.click(screen.getByRole("button", { name: "Скасувати" }))
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Дії із записом/ }),
      ).toHaveFocus()
    })
  })

  it("відповідь загубилась, текст дійшов: порівнювати нічого", async () => {
    const saved = { ...note("n1"), version: 2 }
    const updateNote = vi.fn<TimelineApi["updateNote"]>(() =>
      Promise.reject(
        new ApiError(409, {
          code: "conflict",
          message: "Changed",
          current: saved,
        }),
      ),
    )
    const user = userEvent.setup()
    setup({ updateNote })
    await user.click(
      await screen.findByRole("button", { name: /Дії із записом/ }),
    )
    await user.click(await screen.findByRole("menuitem", { name: "Змінити" }))
    const form = await screen.findByRole("textbox", { name: "Текст нотатки" })
    await waitFor(() => {
      expect(form).toHaveAttribute("contenteditable", "true")
    })
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Текст нотатки" }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("запис уже видалено: це результат, а не помилка, стрічка перечитується", async () => {
    const list = vi
      .fn<TimelineApi["list"]>()
      .mockResolvedValueOnce(pageOf([note("n1")]))
      .mockResolvedValue(pageOf([]))
    const failed = vi.spyOn(toast, "error")
    const user = userEvent.setup()
    setup({
      list,
      remove: vi.fn(() =>
        Promise.reject(new ApiError(404, { code: "gone", message: "Gone" })),
      ),
    })
    await user.click(
      await screen.findByRole("button", { name: /Дії із записом/ }),
    )
    await user.click(await screen.findByRole("menuitem", { name: "Видалити" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Видалити нотатку" }),
    )
    expect(
      await screen.findByText("У стрічці ще нічого немає"),
    ).toBeInTheDocument()
    expect(failed).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })
  })

  it("чужа версія нотатки: порівняння, «зберегти моє» бере нову версію", async () => {
    const current = { ...note("n1", "Текст колеги"), version: 5 }
    const updateNote = vi
      .fn<TimelineApi["updateNote"]>()
      .mockRejectedValueOnce(
        new ApiError(409, { code: "conflict", message: "Changed", current }),
      )
      .mockResolvedValue(current)
    const user = userEvent.setup()
    setup({ updateNote })
    await user.click(
      await screen.findByRole("button", { name: /Дії із записом/ }),
    )
    await user.click(await screen.findByRole("menuitem", { name: "Змінити" }))
    const form = await screen.findByRole("textbox", { name: "Текст нотатки" })
    await waitFor(() => {
      expect(form).toHaveAttribute("contenteditable", "true")
    })
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Текст колеги")).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole("button", { name: /Зберегти мої/ }),
    )
    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledTimes(2)
    })
    expect(updateNote.mock.calls[0]?.[2].version).toBe(1)
    expect(updateNote.mock.calls[1]?.[2].version).toBe(5)
  })
})

describe("RecordTimeline: дії й підписники", () => {
  it("«Виконано» йде з версією дії", async () => {
    const updateActivity = vi.fn(() => Promise.resolve(ACTIVITY))
    const user = userEvent.setup()
    setup({
      activities: vi.fn(() => Promise.resolve([ACTIVITY])),
      updateActivity,
    })
    await user.click(
      await screen.findByRole("button", { name: "Виконано: Подзвонити" }),
    )
    await waitFor(() => {
      expect(updateActivity).toHaveBeenCalledWith(expect.anything(), "a1", {
        version: 1,
        status: "done",
      })
    })
  })

  it("«Виконано» по двох діях: зайнята кожна своя", async () => {
    const other = { ...ACTIVITY, id: "a2", title: "Написати" }
    const first = deferred<TimelineActivity>()
    const second = deferred<TimelineActivity>()
    const updateActivity = vi.fn<TimelineApi["updateActivity"]>((_, id) =>
      id === "a1" ? first.promise : second.promise,
    )
    const user = userEvent.setup()
    setup({
      activities: vi.fn(() => Promise.resolve([ACTIVITY, other])),
      updateActivity,
    })
    const call = await screen.findByRole("button", {
      name: "Виконано: Подзвонити",
    })
    const mail = screen.getByRole("button", { name: "Виконано: Написати" })
    await user.click(call)
    await user.click(mail)
    await act(async () => {
      first.accept(ACTIVITY)
      await first.promise
    })
    await waitFor(() => {
      expect(call).not.toHaveAttribute("aria-disabled", "true")
    })
    expect(mail).toHaveAttribute("aria-disabled", "true")
    await act(async () => {
      second.accept(other)
      await second.promise
    })
  })

  it("рядок зник після «Виконано»: фокус лишається в блоці", async () => {
    const activities = vi
      .fn<TimelineApi["activities"]>()
      .mockResolvedValueOnce([ACTIVITY])
      .mockResolvedValue([])
    const user = userEvent.setup()
    setup({ activities })
    await user.click(
      await screen.findByRole("button", { name: "Виконано: Подзвонити" }),
    )
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Запланувати" })).toHaveFocus()
    })
  })

  it("чужа версія дії: повторне «Зберегти» знову показує порівняння", async () => {
    const current = { ...ACTIVITY, title: "Колега змінив", version: 4 }
    const updateActivity = vi.fn<TimelineApi["updateActivity"]>(() =>
      Promise.reject(
        new ApiError(409, { code: "conflict", message: "Changed", current }),
      ),
    )
    const user = userEvent.setup()
    setup({
      activities: vi.fn(() => Promise.resolve([ACTIVITY])),
      updateActivity,
    })
    await user.click(
      await screen.findByRole("button", { name: "Дії: Подзвонити" }),
    )
    await user.click(await screen.findByRole("menuitem", { name: "Змінити" }))
    const save = await screen.findByRole("button", { name: "Зберегти дію" })
    await user.click(save)
    await screen.findByRole("button", { name: "Зберегти мої зміни" })
    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Зберегти мої зміни" }),
      ).not.toBeInTheDocument()
    })
    await user.click(save)
    await screen.findByRole("button", { name: "Зберегти мої зміни" })
    expect(updateActivity.mock.calls[1]?.[2].version).toBe(1)
  })

  it("чужа версія дії: список перечитується", async () => {
    const activities = vi.fn(() => Promise.resolve([ACTIVITY]))
    const user = userEvent.setup()
    setup({
      activities,
      updateActivity: vi.fn(() =>
        Promise.reject(
          new ApiError(409, { code: "conflict", message: "Changed" }),
        ),
      ),
    })
    await user.click(
      await screen.findByRole("button", { name: "Виконано: Подзвонити" }),
    )
    await waitFor(() => {
      expect(activities.mock.calls.length).toBeGreaterThan(1)
    })
  })

  it("«Стежити» додає себе, далі кнопка каже «Не стежити»", async () => {
    const followers = vi
      .fn<TimelineApi["followers"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: "u-1", name: "Олена Коваль" }])
    const user = userEvent.setup()
    const { timeline } = setup({ followers })
    await user.click(await screen.findByRole("button", { name: "Стежити" }))
    expect(
      await screen.findByRole("button", { name: "Не стежити" }),
    ).toBeInTheDocument()
    expect(timeline.follow).toHaveBeenCalledWith(expect.anything(), "u-1")
  })
})
