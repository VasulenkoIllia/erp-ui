/**
 * Ліниві компоненти з попереднім завантаженням (ADR-0009): сторінки, палітра команд, важкі діалоги —
 * окремими чанками, щоб перший екран лишався легким.
 *
 * - `lazyWithPreload(load)` — як `React.lazy`, плюс `preload()`: чанк вантажиться заздалегідь, при
 *   наведенні чи фокусі на посиланні, на старті для поточної адреси або коли браузер вільний.
 *   Завантажений заздалегідь компонент рендериться одразу, без кадру з `Suspense fallback`.
 * - Компонент мемоізований: сторінка без пропсів не перемальовується, коли оновлюється оболонка
 *   (відкрили палітру, згорнули сайдбар), — це прямо впливає на відгук (INP).
 * - Невдале завантаження (офлайн, застарілий чанк після деплою) кидає `ChunkLoadError` до
 *   найближчого `ErrorBoundary` (erp/error-boundary); його «Спробувати ще» вантажить чанк заново.
 *   `React.lazy` так не вміє: відмову він запам'ятовує назавжди.
 * - `whenIdle(task)` — запустити, коли браузер вільний (після першого кадру).
 *
 *   const ReportPage = lazyWithPreload(() => import(…).then((m) => m.ReportPage))
 *   <ErrorBoundary><Suspense fallback={<PageSkeleton />}><ReportPage /></Suspense></ErrorBoundary>
 */
import {
  createElement,
  memo,
  use,
  type ComponentType,
  type FulfilledReactPromise,
  type PendingReactPromise,
  type RejectedReactPromise,
} from "react"

/** Чанк не завантажився; `retry()` починає завантаження заново. */
export class ChunkLoadError extends Error {
  readonly retry: () => void

  constructor(cause: unknown, retry: () => void) {
    super("erp-ui: chunk failed to load", { cause })
    this.name = "ChunkLoadError"
    this.retry = retry
  }
}

/** Проміс зі станом, який читає `use()` React: готовий результат віддається без призупинення. */
type TrackedPromise<T> = Promise<T> &
  (PendingReactPromise<T> | FulfilledReactPromise<T> | RejectedReactPromise<T>)

function track<T>(promise: Promise<T>): TrackedPromise<T> {
  const state = promise as Promise<T> & {
    status: TrackedPromise<T>["status"]
    value?: T
    reason?: unknown
  }
  state.status = "pending"
  void promise.then(
    (value) => {
      state.status = "fulfilled"
      state.value = value
    },
    (reason: unknown) => {
      state.status = "rejected"
      state.reason = reason
    },
  )
  return state as TrackedPromise<T>
}

export type PreloadableComponent<P extends object> = ComponentType<P> & {
  /**
   * Почати завантаження чанка; після збою — спробувати ще раз. Проміс виконується, коли чанк
   * завантажився або не зміг (збій покаже ErrorBoundary при рендері), і ніколи не відхиляється.
   */
  preload: () => Promise<void>
}

export function lazyWithPreload<P extends object>(
  load: () => Promise<ComponentType<P>>,
): PreloadableComponent<P> {
  let current: TrackedPromise<ComponentType<P>> | undefined
  // Завантаження, яке вже чекав рендер. Його відмова лишається, доки її не повторять: інакше кожен
  // рендер після збою запускав би нове завантаження. Відмову, якої рендер не бачив (невдалий
  // попередній прогрів, поки мережа моргнула), перший рендер повторює сам.
  const rendered = new WeakSet<Promise<unknown>>()
  const start = () => {
    current = track(
      load().catch((cause: unknown) => {
        // Повтор — як preload: якщо чанк тим часом довантажився (наведення), нового запиту немає.
        throw new ChunkLoadError(cause, () => {
          void preload()
        })
      }),
    )
    return current
  }
  const preload = () => {
    const loading =
      !current || current.status === "rejected" ? start() : current
    return loading.then(
      () => undefined,
      () => undefined,
    )
  }
  function Preloadable(props: P) {
    const loading =
      !current || (current.status === "rejected" && !rendered.has(current))
        ? start()
        : current
    rendered.add(loading)
    return createElement(use(loading), props)
  }
  return Object.assign(memo(Preloadable), { preload })
}

/** Виконати, коли браузер вільний; повертає скасування (для очищення в `useEffect`). */
export function whenIdle(task: () => void): () => void {
  // Де requestIdleCallback немає (Safari), — просто трохи згодом.
  const idle:
    Pick<Window, "requestIdleCallback" | "cancelIdleCallback"> | undefined =
    "requestIdleCallback" in window ? window : undefined
  if (idle) {
    const id = idle.requestIdleCallback(task, { timeout: 2000 })
    return () => {
      idle.cancelIdleCallback(id)
    }
  }
  const id = window.setTimeout(task, 200)
  return () => {
    window.clearTimeout(id)
  }
}
