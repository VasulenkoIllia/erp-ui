import { describe, expect, it, vi } from "vitest"

import {
  createSseParser,
  readSseBody,
  type SseMessage,
} from "@/registry/lib/sse"

function collect() {
  const messages: SseMessage[] = []
  const retries: number[] = []
  const parser = createSseParser({
    onMessage: (message) => messages.push(message),
    onRetry: (delayMs) => retries.push(delayMs),
  })
  return { messages, retries, parser }
}

/** Потік із готових шматків байтів. */
function streamOf(chunks: readonly Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe("createSseParser", () => {
  it("порожній рядок завершує повідомлення, рядки data склеюються", () => {
    const { messages, parser } = collect()
    parser.feed("data: перший\ndata: другий\n\n")
    expect(messages).toEqual([{ data: "перший\nдругий" }])
  })

  it("повідомлення без порожнього рядка ще не передається", () => {
    const { messages, parser } = collect()
    parser.feed("data: x\n")
    expect(messages).toEqual([])
    parser.feed("\n")
    expect(messages).toEqual([{ data: "x" }])
  })

  it.each([
    ["\\n", "\n"],
    ["\\r\\n", "\r\n"],
    ["\\r", "\r"],
  ])("кінець рядка %s", (_, end) => {
    const { messages, parser } = collect()
    parser.feed(`data: a${end}${end}data: b${end}${end}`)
    expect(messages).toEqual([{ data: "a" }, { data: "b" }])
  })

  it("обрив між \\r і \\n не дає зайвого порожнього рядка", () => {
    const { messages, parser } = collect()
    parser.feed("data: a\r")
    parser.feed("\ndata: b\r\n\r\n")
    expect(messages).toEqual([{ data: "a\nb" }])
  })

  it("рядок розірвано посередині", () => {
    const { messages, parser } = collect()
    parser.feed("da")
    parser.feed("ta: дов")
    parser.feed("гий\n\n")
    expect(messages).toEqual([{ data: "довгий" }])
  })

  it("коментар не є повідомленням", () => {
    const { messages, parser } = collect()
    parser.feed(": ping\n\n")
    expect(messages).toEqual([])
  })

  it("прибирає лише один пробіл після двокрапки, значення без неї порожнє", () => {
    const { messages, parser } = collect()
    parser.feed("data:  два пробіли\n\ndata\n\n")
    expect(messages).toEqual([{ data: " два пробіли" }, { data: "" }])
  })

  it("id тримається для наступних повідомлень, порожнього data не передає", () => {
    const { messages, parser } = collect()
    parser.feed("id: 7\n\ndata: a\n\ndata: b\nid: 8\n\n")
    expect(messages).toEqual([
      { data: "a", id: "7" },
      { data: "b", id: "8" },
    ])
  })

  it("id із нульовим символом ігнорується", () => {
    const { messages, parser } = collect()
    parser.feed("id: 1\ndata: a\n\nid: 2\0\ndata: b\n\n")
    expect(messages.map((message) => message.id)).toEqual(["1", "1"])
  })

  it("event і retry; нечисловий retry не враховується", () => {
    const { messages, retries, parser } = collect()
    parser.feed("event: ping\nretry: 5000\nretry: 1s\ndata: x\n\n")
    expect(messages).toEqual([{ data: "x", event: "ping" }])
    expect(retries).toEqual([5000])
  })

  it("BOM на початку потоку", () => {
    const { messages, parser } = collect()
    parser.feed("﻿data: x\n\n")
    expect(messages).toEqual([{ data: "x" }])
  })
})

describe("readSseBody", () => {
  it("літера UTF-8 розірвана між шматками", async () => {
    const { messages, parser } = collect()
    const bytes = new TextEncoder().encode("data: ї\n\n")
    const onChunk = vi.fn()
    await readSseBody(
      streamOf([bytes.slice(0, 7), bytes.slice(7)]),
      parser,
      onChunk,
      new AbortController().signal,
    )
    expect(messages).toEqual([{ data: "ї" }])
    expect(onChunk).toHaveBeenCalledTimes(2)
  })

  it("сигнал зупиняє читання, хоч потік мовчить", async () => {
    const { parser } = collect()
    const controller = new AbortController()
    const silent = new ReadableStream<Uint8Array>()
    const reading = readSseBody(silent, parser, vi.fn(), controller.signal)
    controller.abort()
    await expect(reading).resolves.toBeUndefined()
  })
})
