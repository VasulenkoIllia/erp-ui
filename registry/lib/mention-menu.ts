import type {
  MentionCandidate,
  MentionSearch,
  RichTextMention,
} from "@/registry/lib/rich-text"

/**
 * Список згадок під курсором (UI12, ADR-0052): що шукаємо, що знайшли, що підсвічено. Живе поза React,
 * бо Tiptap викликає його з плагіна, і без Tiptap, тож тестується окремо. Запитами керує сам, а не
 * `items` плагіна: так помилка стає станом із повтором, якого плагін не вміє.
 *
 * - Кожна літера скасовує попередній запит, пауза не дає слати запит на кожне натискання.
 * - Поки запит іде, видно попередній список. Індикатор лише після `MENTION_SLOW_MS` (SPEC §8.2).
 *   Вибирати з нього клавішею не можна: швидкий Enter вставив би не ту людину.
 */
export const MENTION_DEBOUNCE_MS = 200
export const MENTION_SLOW_MS = 1_000
export const MENTION_RESULTS = 8
/** Запас на заблокованих: їх прибирає браузер, тож сервер віддає більше, ніж показує список. */
export const MENTION_FETCHED = MENTION_RESULTS * 3

export type MentionMenuStatus = "loading" | "ready" | "failed"

export interface MentionMenuState {
  readonly query: string
  readonly items: readonly MentionCandidate[]
  readonly status: MentionMenuStatus
  /** Запит іде понад `MENTION_SLOW_MS`. */
  readonly slow: boolean
  /** Індекс підсвіченого рядка. */
  readonly active: number
  /** Де курсор: прямокутник перераховується, бо текст прокручується. */
  readonly anchor: () => DOMRect | null
}

/** Те, що Tiptap дає на кожній зміні запиту. */
export interface MentionMenuInput {
  readonly query: string
  readonly clientRect?: (() => DOMRect | null) | null
  readonly command: (mention: RichTextMention) => void
}

export interface MentionMenu {
  subscribe: (listener: () => void) => () => void
  getState: () => MentionMenuState | null
  setSearch: (search: MentionSearch | null) => void
  /** Запит змінився або список щойно відкрито. Той самий запит нічого не робить. */
  update: (input: MentionMenuInput) => void
  close: () => void
  select: (index: number) => void
  retry: () => void
  /** Обробив натискання, далі редактору його не віддавати. */
  handleKey: (key: string) => boolean
}

/** Стан із підписниками для `useSyncExternalStore`. */
function createMentionStore() {
  const listeners = new Set<() => void>()
  let state: MentionMenuState | null = null
  const publish = (next: MentionMenuState | null) => {
    state = next
    for (const listener of listeners) listener()
  }
  return {
    getState: () => state,
    publish,
    patch: (next: Partial<MentionMenuState>) => {
      if (state) publish({ ...state, ...next })
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Один запит: скасований не чіпає стан, повільний вмикає індикатор. */
async function runSearch(
  search: MentionSearch,
  query: string,
  signal: AbortSignal,
  patch: (next: Partial<MentionMenuState>) => void,
) {
  const slow = setTimeout(() => {
    if (!signal.aborted) patch({ slow: true })
  }, MENTION_SLOW_MS)
  try {
    const found = await search(query, signal)
    if (signal.aborted) return
    patch({
      items: found.slice(0, MENTION_RESULTS),
      status: "ready",
      slow: false,
      active: 0,
    })
  } catch {
    if (!signal.aborted) patch({ items: [], status: "failed", slow: false })
  } finally {
    clearTimeout(slow)
  }
}

export function createMentionMenu(): MentionMenu {
  const { getState, publish, patch, subscribe } = createMentionStore()
  let search: MentionSearch | null = null
  let command: MentionMenuInput["command"] | null = null
  let request: AbortController | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    clearTimeout(debounce)
    request?.abort()
    request = null
  }

  const start = (query: string, wait: number) => {
    stop()
    patch({ query, status: "loading", slow: false })
    if (!search) return
    const find = search
    const controller = new AbortController()
    request = controller
    debounce = setTimeout(() => {
      void runSearch(find, query, controller.signal, patch)
    }, wait)
  }

  const move = (step: 1 | -1) => {
    const state = getState()
    if (!state?.items.length) return
    const count = state.items.length
    patch({ active: (state.active + step + count) % count })
  }
  const select = (index: number) => {
    const item = getState()?.items[index]
    if (item && command) command({ id: item.id, label: item.label })
  }

  return {
    subscribe,
    getState,
    setSearch(next) {
      search = next
    },
    update({ query, clientRect, command: insert }) {
      if (!search) return
      command = insert
      const anchor = clientRect ?? (() => null)
      const state = getState()
      if (state?.query === query) {
        patch({ anchor })
        return
      }
      if (state) patch({ anchor })
      else
        publish({
          query,
          items: [],
          status: "loading",
          slow: false,
          active: 0,
          anchor,
        })
      // Перший запит без паузи: список згадки має з'явитись одразу після «@».
      start(query, state ? MENTION_DEBOUNCE_MS : 0)
    },
    close() {
      stop()
      command = null
      publish(null)
    },
    select,
    retry() {
      const state = getState()
      if (state) start(state.query, 0)
    },
    handleKey(key) {
      const state = getState()
      if (state?.status === "failed" && key === "Enter") {
        start(state.query, 0)
        return true
      }
      if (!state?.items.length) return false
      if (key === "ArrowDown" || key === "ArrowUp") {
        move(key === "ArrowDown" ? 1 : -1)
        return true
      }
      // Список ще від попереднього запиту: Enter нічого не робить, а Tab просто виходить із поля.
      if (state.status !== "ready") return key === "Enter"
      if (key === "Enter" || key === "Tab") {
        select(state.active)
        return true
      }
      return false
    },
  }
}
