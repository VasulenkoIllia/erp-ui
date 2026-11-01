import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  MENTION_DEBOUNCE_MS,
  MENTION_RESULTS,
  MENTION_SLOW_MS,
  createMentionMenu,
} from "@/registry/lib/mention-menu"
import type { MentionCandidate, MentionSearch } from "@/registry/lib/rich-text"

const person = (id: string): MentionCandidate => ({ id, label: `Людина ${id}` })
const PEOPLE = [person("a"), person("b"), person("c")]

function setup(find: MentionSearch = () => Promise.resolve(PEOPLE)) {
  const menu = createMentionMenu()
  const command = vi.fn()
  const search = vi.fn(find)
  menu.setSearch(search)
  return {
    menu,
    search,
    command,
    open: (query: string) => {
      menu.update({ query, command })
    },
  }
}

const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("запити", () => {
  it("перший запит одразу, наступні з паузою", async () => {
    const { menu, search, open } = setup()
    open("")
    await settle()
    expect(search).toHaveBeenCalledTimes(1)
    expect(menu.getState()?.status).toBe("ready")
    open("о")
    open("ол")
    await settle(MENTION_DEBOUNCE_MS - 1)
    expect(search).toHaveBeenCalledTimes(1)
    await settle(1)
    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenLastCalledWith("ол", expect.any(AbortSignal))
  })

  it("новий запит скасовує попередній, стара відповідь не потрапляє у список", async () => {
    const resolvers: ((items: MentionCandidate[]) => void)[] = []
    const search = vi.fn(
      () =>
        new Promise<MentionCandidate[]>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const { menu, open } = setup(search)
    open("а")
    await settle()
    open("аб")
    await settle(MENTION_DEBOUNCE_MS)
    resolvers[1]?.([person("новий")])
    await settle()
    resolvers[0]?.([person("старий")])
    await settle()
    expect(menu.getState()?.items.map((item) => item.id)).toEqual(["новий"])
    expect(menu.getState()?.status).toBe("ready")
  })

  it("той самий запит не йде вдруге: плагін кличе оновлення двічі", async () => {
    const { search, open } = setup()
    open("а")
    open("а")
    await settle(MENTION_DEBOUNCE_MS)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it("обрізає список до межі", async () => {
    const many = Array.from({ length: MENTION_RESULTS + 5 }, (_, index) =>
      person(String(index)),
    )
    const { menu, open } = setup(vi.fn(() => Promise.resolve(many)))
    open("")
    await settle()
    expect(menu.getState()?.items).toHaveLength(MENTION_RESULTS)
  })

  it("без пошуку список не відкривається", () => {
    const menu = createMentionMenu()
    menu.update({ query: "", command: vi.fn() })
    expect(menu.getState()).toBeNull()
  })

  it("закриття скасовує запит у паузі й той, що йде", async () => {
    const signals: AbortSignal[] = []
    const search = vi.fn(
      (_query: string, signal: AbortSignal) =>
        new Promise<MentionCandidate[]>(() => {
          signals.push(signal)
        }),
    )
    const { menu, open } = setup(search)
    open("а")
    await settle()
    open("аб")
    menu.close()
    await settle(MENTION_DEBOUNCE_MS)
    expect(search).toHaveBeenCalledTimes(1)
    expect(signals[0]?.aborted).toBe(true)
    expect(menu.getState()).toBeNull()
  })
})

describe("стани", () => {
  it("повільний запит вмикає індикатор лише після межі", async () => {
    const { menu, open } = setup(
      vi.fn(() => new Promise<MentionCandidate[]>(() => undefined)),
    )
    open("")
    await settle(MENTION_SLOW_MS - 1)
    expect(menu.getState()?.slow).toBe(false)
    await settle(1)
    expect(menu.getState()?.slow).toBe(true)
  })

  it("скасований запит не вмикає індикатор", async () => {
    const { menu, open } = setup(
      vi.fn(() => new Promise<MentionCandidate[]>(() => undefined)),
    )
    open("")
    await settle()
    menu.close()
    open("а")
    await settle(MENTION_SLOW_MS - 1)
    expect(menu.getState()?.slow).toBe(false)
  })

  it("поки йде новий запит, видно попередній список", async () => {
    const { menu, open } = setup()
    open("")
    await settle()
    open("а")
    expect(menu.getState()?.status).toBe("loading")
    expect(menu.getState()?.items).toHaveLength(PEOPLE.length)
  })

  it("збій стає станом, повтор іде тим самим запитом", async () => {
    const search = vi
      .fn<() => Promise<MentionCandidate[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(PEOPLE)
    const { menu, open } = setup(search)
    open("ол")
    await settle()
    expect(menu.getState()).toMatchObject({ status: "failed", items: [] })
    menu.retry()
    expect(menu.getState()?.status).toBe("loading")
    await settle()
    expect(menu.getState()?.status).toBe("ready")
    expect(search).toHaveBeenLastCalledWith("ол", expect.any(AbortSignal))
  })

  it("сповіщає підписників і перестає після відписки", async () => {
    const { menu, open } = setup()
    const listener = vi.fn()
    const unsubscribe = menu.subscribe(listener)
    open("")
    await settle()
    expect(listener).toHaveBeenCalled()
    listener.mockClear()
    unsubscribe()
    menu.close()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe("клавіші", () => {
  const ready = async () => {
    const context = setup()
    context.open("")
    await settle()
    return context
  }

  it("стрілки ходять по колу", async () => {
    const { menu } = await ready()
    expect(menu.handleKey("ArrowUp")).toBe(true)
    expect(menu.getState()?.active).toBe(PEOPLE.length - 1)
    expect(menu.handleKey("ArrowDown")).toBe(true)
    expect(menu.getState()?.active).toBe(0)
  })

  it.each(["Enter", "Tab"])("%s вставляє підсвічену людину", async (key) => {
    const { menu, command } = await ready()
    menu.handleKey("ArrowDown")
    expect(menu.handleKey(key)).toBe(true)
    expect(command).toHaveBeenCalledWith({ id: "b", label: "Людина b" })
  })

  it("у вставку не потрапляє підказка", async () => {
    const { menu, command } = setup(
      vi.fn(() =>
        Promise.resolve([{ ...person("a"), hint: "a@firma.example" }]),
      ),
    )
    menu.update({ query: "", command })
    await settle()
    menu.select(0)
    expect(command).toHaveBeenCalledWith({ id: "a", label: "Людина a" })
  })

  it("без списку клавіші лишаються редактору", async () => {
    const { menu, open } = setup(vi.fn(() => Promise.resolve([])))
    expect(menu.handleKey("Enter")).toBe(false)
    open("")
    await settle()
    expect(menu.handleKey("Enter")).toBe(false)
    expect(menu.handleKey("ArrowDown")).toBe(false)
  })

  it("інша клавіша не перехоплюється", async () => {
    const { menu, command } = await ready()
    expect(menu.handleKey("а")).toBe(false)
    expect(command).not.toHaveBeenCalled()
  })
})
