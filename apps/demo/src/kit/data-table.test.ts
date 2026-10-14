import { describe, expect, it } from "vitest"

import {
  clampWindows,
  layoutColumns,
  moveInGrid,
  stickyColumns,
  windowOf,
  windowsForRange,
  withActiveRow,
  type LayoutColumn,
} from "@/registry/lib/data-table-core"

describe("вікна даних", () => {
  it("рядок → вікно з 1", () => {
    expect(windowOf(0)).toBe(1)
    expect(windowOf(99)).toBe(1)
    expect(windowOf(100)).toBe(2)
    expect(windowOf(9_999)).toBe(100)
  })

  it("видимі рядки з запасом", () => {
    expect(windowsForRange(0, 20)).toEqual([1])
    // До кінця вікна лишилось менше запасу — наступне вже вантажиться.
    expect(windowsForRange(60, 80)).toEqual([1, 2])
    expect(windowsForRange(140, 160)).toEqual([2])
    expect(windowsForRange(120, 140)).toEqual([1, 2])
  })

  it("не просить вікон за кінцем списку", () => {
    expect(windowsForRange(9_980, 9_999, { rowCount: 10_000 })).toEqual([100])
    expect(windowsForRange(0, 20, { rowCount: 5 })).toEqual([1])
    expect(windowsForRange(0, 20, { rowCount: 0 })).toEqual([1])
  })

  it("інший розмір вікна", () => {
    expect(windowsForRange(0, 60, { windowSize: 25, prefetch: 0 })).toEqual([
      1, 2, 3,
    ])
  })

  it("вікна старого діапазону обрізаються новою кількістю рядків", () => {
    expect(clampWindows(50, 51, 10_000)).toEqual([50, 51])
    // Новий фільтр лишив 50 рядків: замість вікон 50–51 — останнє, тобто перше.
    expect(clampWindows(50, 51, 50)).toEqual([1])
    expect(clampWindows(1, 3, undefined)).toEqual([1, 2, 3])
  })

  it("рядок у фокусі поза екраном — у рендері на своєму місці за порядком", () => {
    expect(withActiveRow([10, 11, 12], 5)).toEqual([5, 10, 11, 12])
    expect(withActiveRow([10, 11, 12], 40)).toEqual([10, 11, 12, 40])
    expect(withActiveRow([10, 11, 12], 11)).toEqual([10, 11, 12])
    expect(withActiveRow([10, 11, 12], -1)).toEqual([10, 11, 12])
  })
})

describe("розкладка колонок", () => {
  const columns: LayoutColumn[] = [
    { id: "number", minWidth: 7, priority: 1, overflow: "keep" },
    { id: "client", minWidth: 12, priority: 2, overflow: "keep" },
    { id: "date", minWidth: 7, priority: 4, overflow: "wrap" },
    { id: "amount", minWidth: 8, priority: 3, overflow: "keep" },
    { id: "due", minWidth: 7, priority: 5, overflow: "hide" },
  ]

  it("усе влазить — усе в рядку", () => {
    expect(layoutColumns(columns, 60)).toEqual({
      inline: ["number", "client", "date", "amount", "due"],
      wrapped: [],
      hidden: [],
      minWidth: 41,
    })
  })

  it("першою поступається найменш важлива колонка", () => {
    expect(layoutColumns(columns, 35)).toMatchObject({
      inline: ["number", "client", "date", "amount"],
      hidden: ["due"],
      wrapped: [],
    })
    expect(layoutColumns(columns, 30)).toMatchObject({
      inline: ["number", "client", "amount"],
      wrapped: ["date"],
      hidden: ["due"],
      minWidth: 27,
    })
  })

  it("колонки «лишити» не поступаються — далі горизонтальна прокрутка", () => {
    expect(layoutColumns(columns, 10)).toMatchObject({
      inline: ["number", "client", "amount"],
      minWidth: 27,
    })
  })

  it("за рівного пріоритету поступається правіша", () => {
    const equal: LayoutColumn[] = [
      { id: "a", minWidth: 10, priority: 2, overflow: "hide" },
      { id: "b", minWidth: 10, priority: 2, overflow: "hide" },
    ]
    expect(layoutColumns(equal, 15).hidden).toEqual(["b"])
  })
})

describe("навігація гріда (W3C APG)", () => {
  const bounds = { rowCount: 10_000, colCount: 6, pageRows: 12 }
  const at = (row: number, col: number) => ({ row, col })

  it("стрілки не виходять за межі", () => {
    expect(moveInGrid(at(-1, 0), "ArrowUp", false, bounds)).toEqual(at(-1, 0))
    expect(moveInGrid(at(-1, 0), "ArrowDown", false, bounds)).toEqual(at(0, 0))
    expect(moveInGrid(at(3, 0), "ArrowLeft", false, bounds)).toEqual(at(3, 0))
    expect(moveInGrid(at(3, 5), "ArrowRight", false, bounds)).toEqual(at(3, 5))
    expect(moveInGrid(at(9_999, 2), "ArrowDown", false, bounds)).toEqual(
      at(9_999, 2),
    )
  })

  it("Home/End — рядок, з Ctrl — увесь грід", () => {
    expect(moveInGrid(at(4, 3), "Home", false, bounds)).toEqual(at(4, 0))
    expect(moveInGrid(at(4, 3), "End", false, bounds)).toEqual(at(4, 5))
    expect(moveInGrid(at(4, 3), "Home", true, bounds)).toEqual(at(-1, 0))
    expect(moveInGrid(at(4, 3), "End", true, bounds)).toEqual(at(9_999, 5))
  })

  it("PageUp/PageDown — на видиму сторінку", () => {
    expect(moveInGrid(at(-1, 1), "PageDown", false, bounds)).toEqual(at(12, 1))
    expect(moveInGrid(at(20, 1), "PageDown", false, bounds)).toEqual(at(32, 1))
    expect(moveInGrid(at(9_995, 1), "PageDown", false, bounds)).toEqual(
      at(9_999, 1),
    )
    expect(moveInGrid(at(20, 1), "PageUp", false, bounds)).toEqual(at(8, 1))
    expect(moveInGrid(at(5, 1), "PageUp", false, bounds)).toEqual(at(0, 1))
    expect(moveInGrid(at(0, 1), "PageUp", false, bounds)).toEqual(at(-1, 1))
  })

  it("інші клавіші — не навігація", () => {
    expect(moveInGrid(at(0, 0), "Enter", false, bounds)).toBeNull()
  })
})

describe("липкі колонки", () => {
  const columns = new Map([
    ["select", { sticky: true, minWidth: 2.75 }],
    ["number", { sticky: true, minWidth: 8 }],
    ["client", { minWidth: 12 }],
    ["status", { sticky: true }],
  ])
  const columnOf = (id: string) => columns.get(id)

  it("перші підряд липкі: зсуви від початку рядка й ширина", () => {
    expect(
      stickyColumns(["select", "number", "client", "status"], columnOf),
    ).toEqual({ offsets: [0, 2.75], width: 10.75 })
  })

  it("перша не липка — липких немає; без мінімуму — типова ширина", () => {
    expect(stickyColumns(["client", "select"], columnOf)).toEqual({
      offsets: [],
      width: 0,
    })
    expect(stickyColumns(["status"], columnOf).offsets).toEqual([0])
  })
})
