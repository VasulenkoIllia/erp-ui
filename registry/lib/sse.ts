/**
 * Розбір потоку Server-Sent Events (WHATWG HTML, «Server-sent events»; PF19, ADR-0051). Канал читає
 * потік через `fetch`, а не `EventSource`, тож розбирати його доводиться самим: рядки, поля, порожній
 * рядок як кінець повідомлення, коментар як серцебиття.
 *
 * Фрагмент мережі може обірватись будь-де: посеред рядка, між `\r` і `\n`, посеред літери UTF-8.
 * Тому розбір тримає незавершений рядок, а декодер — незавершену літеру.
 */

export interface SseMessage {
  /** Текст поля `data`; кілька рядків `data` склеєні через `\n`. */
  readonly data: string
  /** Поле `event`; сервер кіта його не шле (тип події в `data`), але читати потік це не заважає. */
  readonly event?: string
  /** Останній `id` потоку, зокрема з попередніх повідомлень: `Last-Event-ID` при перепідключенні. */
  readonly id?: string
}

export interface SseHandlers {
  onMessage: (message: SseMessage) => void
  /** Поле `retry`: сервер просить таку паузу перед перепідключенням, мс. */
  onRetry?: (delayMs: number) => void
}

export interface SseParser {
  /** Наступний шматок тексту потоку. */
  feed: (chunk: string) => void
}

const BOM = "﻿"

export function createSseParser({
  onMessage,
  onRetry,
}: SseHandlers): SseParser {
  let buffer = ""
  let isFirstChunk = true
  /** Шматок закінчився на `\r`: якщо наступний почнеться з `\n`, це той самий кінець рядка. */
  let skipLineFeed = false
  let data: string[] = []
  let event: string | undefined
  let lastId: string | undefined

  const dispatch = () => {
    const lines = data
    const name = event
    data = []
    event = undefined
    // Повідомлення без `data` не передається (стандарт): так сервер може лише оновити `id`.
    if (lines.length === 0) return
    onMessage({
      data: lines.join("\n"),
      ...(name === undefined ? {} : { event: name }),
      ...(lastId === undefined ? {} : { id: lastId }),
    })
  }

  const readLine = (line: string) => {
    if (line === "") {
      dispatch()
      return
    }
    // Рядок із двокрапкою на початку — коментар, сервер шле його як серцебиття.
    if (line.startsWith(":")) return
    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    const raw = colon === -1 ? "" : line.slice(colon + 1)
    const value = raw.startsWith(" ") ? raw.slice(1) : raw
    if (field === "data") data.push(value)
    else if (field === "event") event = value
    // `id` із нульовим символом стандарт наказує ігнорувати: заголовок запиту його не перенесе.
    else if (field === "id" && !value.includes("\0")) lastId = value
    else if (field === "retry" && /^\d+$/.test(value)) onRetry?.(Number(value))
  }

  return {
    feed(chunk) {
      let text = chunk
      if (isFirstChunk && text !== "") {
        isFirstChunk = false
        if (text.startsWith(BOM)) text = text.slice(BOM.length)
      }
      if (skipLineFeed && text !== "") {
        if (text.startsWith("\n")) text = text.slice(1)
        skipLineFeed = false
      }
      buffer += text
      let start = 0
      for (;;) {
        const lineFeed = buffer.indexOf("\n", start)
        const carriageReturn = buffer.indexOf("\r", start)
        const end =
          carriageReturn === -1
            ? lineFeed
            : lineFeed === -1
              ? carriageReturn
              : Math.min(lineFeed, carriageReturn)
        if (end === -1) break
        readLine(buffer.slice(start, end))
        start = end + 1
        if (buffer[end] !== "\r") continue
        if (start === buffer.length) skipLineFeed = true
        else if (buffer[start] === "\n") start += 1
      }
      buffer = buffer.slice(start)
    },
  }
}

/**
 * Читає тіло відповіді до кінця потоку. `onChunk` — будь-які байти, зокрема серцебиття: за ним канал
 * бачить, що з'єднання живе. Повертається, коли сервер закрив потік або `signal` перервав читання:
 * обгортка `fetch` могла загубити `signal`, тому зупиняє читач, а не лише запит.
 */
export async function readSseBody(
  body: ReadableStream<Uint8Array>,
  parser: SseParser,
  onChunk: () => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const cancel = () => {
    // Потік уже закрито чи перервано: читання нижче скінчиться саме.
    reader.cancel().catch(() => undefined)
  }
  if (signal.aborted) cancel()
  else signal.addEventListener("abort", cancel, { once: true })
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      onChunk()
      parser.feed(decoder.decode(value, { stream: true }))
    }
  } finally {
    signal.removeEventListener("abort", cancel)
    reader.releaseLock()
  }
}
