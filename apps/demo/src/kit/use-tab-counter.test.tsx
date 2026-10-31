import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useTabCounter } from "@/registry/hooks/use-tab-counter"

/** Лічильник у назві вкладки (ADR-0046): назву міняють сторінки, лічильник лишається. */
beforeEach(() => {
  document.title = "Рахунки"
})

afterEach(() => {
  document.title = ""
})

describe("useTabCounter", () => {
  it("додає лічильник і прибирає його, коли нових немає", () => {
    const { rerender } = renderHook(
      ({ count }) => {
        useTabCounter(count)
      },
      { initialProps: { count: 3 } },
    )
    expect(document.title).toBe("(3) Рахунки")
    rerender({ count: 12 })
    expect(document.title).toBe("(12) Рахунки")
    rerender({ count: 0 })
    expect(document.title).toBe("Рахунки")
  })

  it("понад 99 показує 99+, як дзвіник", () => {
    renderHook(() => {
      useTabCounter(120)
    })
    expect(document.title).toBe("(99+) Рахунки")
  })

  it("сторінка змінила назву: лічильник повертається", async () => {
    renderHook(() => {
      useTabCounter(3)
    })
    document.title = "Контакти"
    await waitFor(() => {
      expect(document.title).toBe("(3) Контакти")
    })
  })

  it("без лічильника не чіпає назву", () => {
    renderHook(() => {
      useTabCounter(0)
    })
    expect(document.title).toBe("Рахунки")
  })

  it("вимкнений лічильник не стирає чужий початок назви", async () => {
    document.title = "(5) Чернетка"
    renderHook(() => {
      useTabCounter(0)
    })
    document.title = "(7) Чернетка"
    await Promise.resolve()
    expect(document.title).toBe("(7) Чернетка")
  })

  it("дужки в назві проекту лишаються", () => {
    document.title = "(2024) Звіт"
    const { unmount } = renderHook(() => {
      useTabCounter(3)
    })
    expect(document.title).toBe("(3) (2024) Звіт")
    unmount()
    expect(document.title).toBe("(2024) Звіт")
  })

  it("зняття хука прибирає лічильник", () => {
    const { unmount } = renderHook(() => {
      useTabCounter(3)
    })
    unmount()
    expect(document.title).toBe("Рахунки")
  })
})
