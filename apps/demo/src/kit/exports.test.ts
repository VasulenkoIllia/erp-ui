import { describe, expect, it, vi } from "vitest"

import {
  collectRecords,
  EXPORT_PAGE_SIZE,
  ExportLimitError,
  exportRows,
} from "@/registry/lib/exports"

const signal = new AbortController().signal

const sourceOf = (total: number, lost = 0) => ({
  fetchPage: vi.fn((page: number, perPage: number) => {
    const start = (page - 1) * perPage
    const end = Math.min(start + perPage, total - lost)
    const data = Array.from({ length: Math.max(end - start, 0) }, (_, i) => ({
      id: start + i,
    }))
    return Promise.resolve({ data, total })
  }),
})

describe("collectRecords", () => {
  it("проходить усі сторінки по черзі й рахує прогрес", async () => {
    const source = sourceOf(EXPORT_PAGE_SIZE + 3)
    const onProgress = vi.fn()
    const records = await collectRecords(source, { signal, onProgress })
    expect(records).toHaveLength(EXPORT_PAGE_SIZE + 3)
    expect(source.fetchPage).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenLastCalledWith(
      EXPORT_PAGE_SIZE + 3,
      EXPORT_PAGE_SIZE + 3,
    )
  })

  it("над межею не збирає нічого далі: файл не обрізається", async () => {
    const source = sourceOf(11)
    await expect(
      collectRecords(source, { signal, maxRows: 10 }),
    ).rejects.toBeInstanceOf(ExportLimitError)
    expect(source.fetchPage).toHaveBeenCalledTimes(1)
  })

  it("записи зникли під час збору: зупиняється, а не йде без кінця", async () => {
    const source = sourceOf(EXPORT_PAGE_SIZE * 2, EXPORT_PAGE_SIZE)
    const records = await collectRecords(source, { signal })
    expect(records).toHaveLength(EXPORT_PAGE_SIZE)
  })
})

describe("exportRows", () => {
  it("будує заголовок і рядки за колонками", () => {
    expect(
      exportRows(
        [{ name: "Кава", price: 10 }],
        [
          { id: "name", label: "Назва", value: (row) => row.name },
          { id: "price", label: "Ціна", value: (row) => row.price },
        ],
      ),
    ).toEqual([
      ["Назва", "Ціна"],
      ["Кава", 10],
    ])
  })
})
