import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  useSectionActions,
  usePaletteActionGroups,
  usePaletteActions,
  type PaletteActionGroup,
} from "@/registry/hooks/use-palette-actions"

const group = (title: string): PaletteActionGroup => ({
  title,
  actions: [{ id: "edit", label: "Змінити", onSelect: vi.fn() }],
})

describe("usePaletteActions", () => {
  it("показує групу, поки картка на екрані", () => {
    const reader = renderHook(() => usePaletteActionGroups())
    const card = renderHook(() => {
      usePaletteActions(group("Марія"))
    })
    expect(reader.result.current.map((item) => item.title)).toEqual(["Марія"])
    card.unmount()
    expect(reader.result.current).toEqual([])
  })

  it("запису ще немає: групи немає, а прийшов — з'являється", () => {
    const reader = renderHook(() => usePaletteActionGroups())
    const card = renderHook(
      ({ value }: { value: PaletteActionGroup | null }) => {
        usePaletteActions(value)
      },
      { initialProps: { value: null as PaletteActionGroup | null } },
    )
    expect(reader.result.current).toEqual([])
    card.rerender({ value: group("Марія") })
    expect(reader.result.current).toHaveLength(1)
    card.rerender({ value: null })
    expect(reader.result.current).toEqual([])
    card.unmount()
  })

  it("новий рендер картки оновлює групу на місці, а не додає другу", () => {
    const reader = renderHook(() => usePaletteActionGroups())
    const card = renderHook(
      ({ title }: { title: string }) => {
        usePaletteActions(group(title))
      },
      { initialProps: { title: "Марія" } },
    )
    card.rerender({ title: "Марія Коваль" })
    expect(reader.result.current.map((item) => item.title)).toEqual([
      "Марія Коваль",
    ])
    card.unmount()
  })

  it("рендер без видимих змін не перепубліковує групу: підсвічений рядок не стрибає", () => {
    const reader = renderHook(() => usePaletteActionGroups())
    const card = renderHook(
      ({ tick }: { tick: number }) => {
        usePaletteActions({
          title: "Марія",
          actions: [{ id: "edit", label: "Змінити", onSelect: () => tick }],
        })
      },
      { initialProps: { tick: 0 } },
    )
    const before = reader.result.current
    card.rerender({ tick: 1 })
    expect(reader.result.current).toBe(before)
    card.unmount()
  })

  it("дія після такого рендеру виконує свіже замикання картки", () => {
    const reader = renderHook(() => usePaletteActionGroups())
    const first = vi.fn()
    const second = vi.fn()
    const card = renderHook(
      ({ onSelect }: { onSelect: () => void }) => {
        usePaletteActions({
          title: "Марія",
          actions: [{ id: "edit", label: "Змінити", onSelect }],
        })
      },
      { initialProps: { onSelect: first } },
    )
    card.rerender({ onSelect: second })
    reader.result.current[0]?.actions[0]?.onSelect()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    card.unmount()
  })

  it("зміна права оновлює рядок: причина відмови потрапляє в палітру", () => {
    const reader = renderHook(() => usePaletteActionGroups())
    const card = renderHook(
      ({ deniedReason }: { deniedReason?: string }) => {
        usePaletteActions({
          title: "Марія",
          actions: [
            { id: "edit", label: "Змінити", deniedReason, onSelect: vi.fn() },
          ],
        })
      },
      { initialProps: {} },
    )
    card.rerender({ deniedReason: "Немає права" })
    expect(reader.result.current[0]?.actions[0]?.deniedReason).toBe(
      "Немає права",
    )
    card.unmount()
  })

  it("слот проекту додає свою групу поруч із карткою", () => {
    const reader = renderHook(() => usePaletteActionGroups())
    const card = renderHook(() => {
      usePaletteActions(group("Картка"))
    })
    const slot = renderHook(() => {
      usePaletteActions(group("Слот"))
    })
    expect(reader.result.current.map((item) => item.title)).toEqual([
      "Картка",
      "Слот",
    ])
    card.unmount()
    slot.unmount()
  })
})

describe("useSectionActions", () => {
  it("кожна вкладка — дія з назвою розділу", () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() =>
      useSectionActions([{ id: "roles", title: "Ролі" }], onOpen),
    )
    expect(result.current[0]?.label).toBe("Відкрити: Ролі")
    act(() => {
      result.current[0]?.onSelect()
    })
    expect(onOpen).toHaveBeenCalledWith("roles")
  })
})
