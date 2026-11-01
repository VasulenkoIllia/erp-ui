/**
 * Реальний час (PF19, ADR-0051): один канал подій сервера з перепідключенням.
 *
 * Контракт (під `/api/v1`):
 * - `GET /events` з `Accept: text/event-stream` і `X-Company-Id` → потік SSE компанії. Запит фоновий
 *   (`X-Background-Request: 1`): відкритий канал не продовжує сесію. Після обриву клієнт шле
 *   `Last-Event-ID`, якщо сервер давав `id`.
 * - Кожне повідомлення — JSON у `data`: `{ type, resource, id?, at }`. `type` — `<ресурс>.<дія>`, ті самі
 *   назви, що у вебхуків (`invoices.updated`). Даних запису в події немає: клієнт перечитує запис зі
 *   своїми правами, а сервер не мусить фільтрувати потік за полями.
 * - Сервер шле серцебиття (рядок-коментар `: ping`) не рідше ніж раз на `HEARTBEAT_TIMEOUT_MS` / 2:
 *   інакше клієнт вважає з'єднання мертвим.
 * - 401, 403, 404, 405, 501 — каналу в цього бекенду чи людини немає, клієнт більше не пробує. Решта
 *   збоїв — пауза зростає від 1 до 30 с, сервер може задати свою полем `retry`.
 *
 * Канал не обов'язковий: його вмикає застосунок (`RealtimeSync`, erp/realtime-sync). Без нього
 * статус лишається `idle`, і дзвіник та списки працюють опитуванням, як раніше.
 *
 * Канал тримає одна вкладка на людину й компанію: браузер дає шість з'єднань на адресу в HTTP/1.1, і
 * сьома вкладка інакше повисла б. Хто тримає — вирішує Web Locks: закрилась вкладка, замок переходить до
 * наступної. Решта вкладок отримує події через `BroadcastChannel`. Без цих API кожна вкладка
 * тримає свій канал: працює так само, лише з'єднань більше.
 */
import { z } from "zod"

import { ApiError, isApiError, type ApiClient } from "@/registry/lib/api"
import { createSseParser, readSseBody } from "@/registry/lib/sse"

export const REALTIME_PATH = "/events"

export const realtimeEventSchema = z.object({
  /** `<ресурс>.<дія>`: `invoices.updated`, `notifications.created`. */
  type: z.string().min(1),
  resource: z.string().min(1),
  id: z.string().optional(),
  at: z.string(),
})
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>

/**
 * - `idle` — канал не запущено;
 * - `connecting` — перше з'єднання;
 * - `open` — події йдуть, опитувати не треба;
 * - `retrying` — обрив, пауза перед новою спробою;
 * - `off` — каналу немає й не буде до нового запуску.
 */
export type RealtimeStatus = "idle" | "connecting" | "open" | "retrying" | "off"

/** Вдвічі більше за межу серцебиття сервера: одне загублене не обриває канал. */
export const HEARTBEAT_TIMEOUT_MS = 60_000
export const RETRY_BASE_MS = 1_000
export const RETRY_MAX_MS = 30_000
/** Скільки має прожити з'єднання, щоб спроби рахувались знову з першої. */
export const STABLE_CONNECTION_MS = 10_000

/** Канал відновився після обриву: подій за цей час могло не дійти, усе видиме варто перечитати. */
export const REALTIME_RESYNC = "realtime.resync"

const FINAL_STATUSES = new Set([401, 403, 404, 405, 501])

export const isFinalRealtimeFailure = (error: unknown) =>
  isApiError(error) && FINAL_STATUSES.has(error.status)

/** Пауза перед спробою `attempt` (з 0): експонента до межі, випадкова половина розводить вкладки й клієнтів. */
export function realtimeRetryDelay(
  attempt: number,
  baseMs: number = RETRY_BASE_MS,
  random: () => number = Math.random,
): number {
  const capped = Math.min(RETRY_MAX_MS, baseMs * 2 ** attempt)
  return capped * (0.5 + random() / 2)
}

export interface RealtimeOpenOptions {
  readonly signal: AbortSignal
  readonly lastEventId?: string
}

/** Відкрити потік: `provider.realtime.open`, той самий клієнт API з компанією й заголовками адаптера. */
export type RealtimeOpen = (options: RealtimeOpenOptions) => Promise<Response>

export interface RealtimeApi {
  readonly open: RealtimeOpen
}

export function createRealtimeApi(client: ApiClient): RealtimeApi {
  return {
    open: (options) => client.stream(REALTIME_PATH, options),
  }
}

export interface RealtimeChannelHandlers {
  onEvent: (event: RealtimeEvent) => void
  onStatus: (status: RealtimeStatus) => void
  /** З'єднання відновлено після обриву. */
  onResync: () => void
}

export interface RealtimeChannel {
  /** Зупинити; `done` завершиться. Сам він завершується, коли каналу немає (`off`). */
  stop: () => void
  /** Перервати паузу: мережа повернулась, вкладка знову видима. */
  wake: () => void
  done: Promise<void>
}

export interface RealtimeChannelOptions {
  /** Канал перейшов від іншої вкладки: подій між ними могло не дійти, тож і перше з'єднання — відновлення. */
  readonly isResumed?: boolean
}

/** Цикл одного каналу: з'єднання, читання, пауза, знову з'єднання. */
export function createRealtimeChannel(
  open: RealtimeOpen,
  { onEvent, onStatus, onResync }: RealtimeChannelHandlers,
  { isResumed = false }: RealtimeChannelOptions = {},
): RealtimeChannel {
  let isStopped = false
  let current: AbortController | null = null
  let cancelPause: (() => void) | null = null
  let lastEventId: string | undefined
  let baseDelayMs = RETRY_BASE_MS
  let attempt = 0
  let needsResync = isResumed

  const pause = (delayMs: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs)
      cancelPause = () => {
        clearTimeout(timer)
        resolve()
      }
    }).finally(() => {
      cancelPause = null
    })

  const read = async (
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    onChunk: () => void,
  ) => {
    onStatus("open")
    if (needsResync) onResync()
    needsResync = false
    const openedAt = Date.now()
    // Розбір свій на кожне з'єднання: обірваний рядок не склеїться з першим рядком нового потоку.
    const parser = createSseParser({
      onMessage({ data, id }) {
        if (id !== undefined) lastEventId = id
        const event = parseEvent(data)
        if (event) onEvent(event)
      },
      onRetry(delayMs) {
        // Нуль від сервера не перетворює перепідключення на гарячий цикл.
        baseDelayMs = Math.max(delayMs, RETRY_BASE_MS)
      },
    })
    try {
      await readSseBody(body, parser, onChunk, signal)
    } finally {
      // Лічильник спроб скидає лише стійке з'єднання: сервер, що приймає й одразу закриває, не дасть
      // перечитування всього щосекунди.
      if (Date.now() - openedAt >= STABLE_CONNECTION_MS) attempt = 0
    }
  }

  const connect = (controller: AbortController) =>
    withWatchdog(controller, async (onChunk) => {
      const { signal } = controller
      const body = await openEventStream(open, {
        signal,
        ...(lastEventId === undefined ? {} : { lastEventId }),
      })
      if (signal.aborted) {
        void body.cancel()
        return
      }
      onChunk()
      await read(body, signal, onChunk)
    })

  const run = async () => {
    onStatus("connecting")
    while (!isStopped) {
      const controller = new AbortController()
      current = controller
      try {
        await connect(controller)
      } catch (error) {
        if (isStopped) return
        if (isFinalRealtimeFailure(error)) {
          onStatus("off")
          return
        }
      }
      if (isStopped) return
      onStatus("retrying")
      // Подій за час збою могло не дійти, навіть якщо з'єднання ще не було жодного разу.
      needsResync = true
      await pause(realtimeRetryDelay(attempt, baseDelayMs))
      attempt += 1
    }
  }

  return {
    stop() {
      isStopped = true
      current?.abort()
      cancelPause?.()
    },
    wake() {
      cancelPause?.()
    },
    done: run(),
  }
}

const isEventStream = (response: Response) =>
  response.headers.get("content-type")?.includes("text/event-stream") === true

/**
 * Мовчання довше за межу перериває з'єднання, як обрив. Будь-який вихід закриває його: виняток у
 * читанні чи чужа відповідь не лишають відкритого потоку, а шість таких зупинили б усі запити.
 */
async function withWatchdog(
  controller: AbortController,
  run: (onChunk: () => void) => Promise<void>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const restart = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      controller.abort()
    }, HEARTBEAT_TIMEOUT_MS)
  }
  try {
    restart()
    await run(restart)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/**
 * Запит потоку. Обгортка `fetch` адаптера могла загубити `signal`, тому перерваний запит не чекаємо,
 * а потік, що прийшов уже після обриву, закриваємо.
 */
async function openEventStream(
  open: RealtimeOpen,
  options: RealtimeOpenOptions,
): Promise<ReadableStream<Uint8Array>> {
  const { signal } = options
  const opening = open(options)
  const aborted = new Promise<never>((_, reject) => {
    const abort = () => {
      reject(new DOMException("Aborted", "AbortError"))
    }
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  })
  opening
    .then((late) => (signal.aborted ? late.body?.cancel() : undefined))
    .catch(() => undefined)
  const response = await Promise.race([opening, aborted])
  if (!response.body || !isEventStream(response))
    throw new ApiError(404, {
      code: "not_found",
      message: "Not an event stream",
    })
  return response.body
}

function parseEvent(data: string): RealtimeEvent | null {
  try {
    const parsed = realtimeEventSchema.safeParse(JSON.parse(data))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/* ------------------------------ Стан у застосунку ------------------------------ */

const eventListeners = new Set<(event: RealtimeEvent) => void>()
const statusListeners = new Set<() => void>()
let status: RealtimeStatus = "idle"

export const getRealtimeStatus = () => status

export function subscribeRealtimeStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

/** Події каналу, зокрема з інших вкладок; відновлення — подія `REALTIME_RESYNC`. */
export function subscribeRealtime(
  listener: (event: RealtimeEvent) => void,
): () => void {
  eventListeners.add(listener)
  return () => {
    eventListeners.delete(listener)
  }
}

function setStatus(next: RealtimeStatus) {
  if (next === status) return
  status = next
  statusListeners.forEach((listener) => {
    listener()
  })
}

function deliver(event: RealtimeEvent) {
  eventListeners.forEach((listener) => {
    try {
      listener(event)
    } catch (error) {
      // Збій одного слухача не зупиняє ні решту, ні канал.
      console.error("erp-ui: realtime listener failed", error)
    }
  })
}

const resyncEvent = (): RealtimeEvent => ({
  type: REALTIME_RESYNC,
  resource: "realtime",
  at: new Date().toISOString(),
})

/* ------------------------------- Одна вкладка -------------------------------- */

type TabMessage =
  | { kind: "event"; event: RealtimeEvent }
  | { kind: "status"; status: RealtimeStatus }
  | { kind: "hello" }

export interface ConnectRealtimeOptions {
  readonly open: RealtimeOpen
  /** Людина: токен адаптера живе у вкладці, тож у двох вкладках можуть бути різні люди. */
  readonly accountId: string
  /** Компанія: `X-Company-Id` у каналу свій, тож вкладки різних компаній каналів не ділять. */
  readonly companyId: string | null
}

/** Запустити канал цієї вкладки чи слухати вкладку, що вже тримає його; повертає зупинку. */
export function connectRealtime({
  open,
  accountId,
  companyId,
}: ConnectRealtimeOptions): () => void {
  const name = `erp-ui:realtime:${accountId}:${companyId ?? "none"}`
  const tabs =
    typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null
  const lifetime = new AbortController()
  let channel: RealtimeChannel | null = null
  let hasHeardOwner = false

  const post = (message: TabMessage) => {
    tabs?.postMessage(message)
  }
  /** Подія цієї вкладки й решти; після зупинки канал мовчить, закритий `tabs` кинув би виняток. */
  const share = (event: RealtimeEvent) => {
    if (lifetime.signal.aborted) return
    deliver(event)
    post({ kind: "event", event })
  }

  if (tabs)
    tabs.onmessage = ({ data }: MessageEvent<TabMessage>) => {
      if (data.kind === "hello") {
        if (channel) post({ kind: "status", status })
        return
      }
      hasHeardOwner = true
      // Канал уже тут: повідомлення попереднього власника запізнилось.
      if (channel) return
      if (data.kind === "event") deliver(data.event)
      else setStatus(data.status)
    }

  const hold = (): Promise<void> => {
    if (lifetime.signal.aborted) return Promise.resolve()
    const running = createRealtimeChannel(
      open,
      {
        onEvent: share,
        onStatus(next) {
          if (lifetime.signal.aborted) return
          setStatus(next)
          post({ kind: "status", status: next })
        },
        onResync() {
          share(resyncEvent())
        },
      },
      { isResumed: hasHeardOwner },
    )
    channel = running
    return running.done.finally(() => {
      channel = null
    })
  }

  const wake = () => {
    channel?.wake()
  }
  const wakeWhenVisible = () => {
    if (document.visibilityState === "visible") wake()
  }
  globalThis.addEventListener?.("online", wake)
  globalThis.document?.addEventListener("visibilitychange", wakeWhenVisible)

  setStatus("connecting")
  const locks = globalThis.navigator?.locks as LockManager | undefined
  if (locks && tabs) {
    post({ kind: "hello" })
    locks
      .request(name, { signal: lifetime.signal }, hold)
      // Зупинка до отримання замка: черга скасована, а не збій.
      .catch(() => undefined)
  } else void hold()

  return () => {
    lifetime.abort()
    channel?.stop()
    globalThis.removeEventListener?.("online", wake)
    globalThis.document?.removeEventListener(
      "visibilitychange",
      wakeWhenVisible,
    )
    tabs?.close()
    setStatus("idle")
  }
}
