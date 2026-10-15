import { describe, expect, it, vi } from "vitest"

import { batchedMockState, mockBatch } from "@/registry/lib/mock-server"

/** Стан моку з лічильниками читань і записів «сховища». */
function counted(initial: string[] = []) {
  let stored = initial
  const load = vi.fn(() => [...stored])
  const save = vi.fn((state: string[]) => {
    stored = state
  })
  return {
    state: batchedMockState(load, save),
    load,
    save,
    stored: () => stored,
  }
}

describe("пачка змін (lib/mock-server)", () => {
  it("поза пачкою — читання й запис у сховище щоразу", () => {
    const { state, load, save, stored } = counted(["a"])
    state.write([...state.read(), "b"])
    state.write([...state.read(), "c"])
    expect(load).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledTimes(2)
    expect(stored()).toEqual(["a", "b", "c"])
  })

  it("у пачці — одне читання й один запис наприкінці, зміни видно одразу", () => {
    const { state, load, save, stored } = counted(["a"])
    const result = mockBatch(() => {
      state.write([...state.read(), "b"])
      state.write([...state.read(), "c"])
      expect(state.read()).toEqual(["a", "b", "c"])
      expect(save).not.toHaveBeenCalled()
      return "done"
    })
    expect(result).toBe("done")
    expect(load).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(stored()).toEqual(["a", "b", "c"])
  })

  it("лише прочитаний стан не пишеться; вкладена пачка — частина зовнішньої", () => {
    const read = counted(["a"])
    const written = counted()
    mockBatch(() => {
      read.state.read()
      mockBatch(() => {
        written.state.write(["x"])
      })
      expect(written.save).not.toHaveBeenCalled()
    })
    expect(read.save).not.toHaveBeenCalled()
    expect(written.save).toHaveBeenCalledTimes(1)
    expect(written.stored()).toEqual(["x"])
  })

  it("помилка в пачці: зроблене пишеться, наступний запис — одразу", () => {
    const { state, save, stored } = counted()
    expect(() =>
      mockBatch(() => {
        state.write(["a"])
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(stored()).toEqual(["a"])
    state.write(["a", "b"])
    expect(save).toHaveBeenCalledTimes(2)
    expect(stored()).toEqual(["a", "b"])
  })

  it("асинхронна функція — не пачка: тип її не приймає", () => {
    // @ts-expect-error — після першого await пачку вже закрито
    void mockBatch(async () => {
      await Promise.resolve()
      return 1
    })
    // @ts-expect-error — проміс так само
    void mockBatch(() => Promise.resolve(1))
  })
})
