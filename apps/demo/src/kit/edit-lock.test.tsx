import { QueryClient } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext } from "ra-core"
import { useState } from "react"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditLockNotice } from "@/registry/erp/edit-lock-notice"
import { useEditLock } from "@/registry/hooks/use-edit-lock"
import { ApiError } from "@/registry/lib/api"
import type { ErpAuthProvider, Me } from "@/registry/lib/auth"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  EDIT_LOCK_IDLE_MS,
  EDIT_LOCK_REFRESH_MS,
  type EditLockState,
} from "@/registry/lib/edit-lock"

const ME = { id: "u-me", name: "Я" } as Me
const OTHER = { id: "u-other", name: "Марта Шевчук" }
const FREE: EditLockState = { holder: null, expiresAt: null }
const MINE: EditLockState = {
  holder: { id: ME.id, name: ME.name },
  expiresAt: "2026-11-01T10:02:00.000Z",
}
const THEIRS: EditLockState = {
  holder: OTHER,
  expiresAt: "2026-11-01T10:02:00.000Z",
}

function Card({ id = "1", enabled }: { id?: string; enabled?: boolean }) {
  const lock = useEditLock({ resource: "contacts", id, enabled })
  const [isEditing, setEditing] = useState(false)
  return (
    <>
      <EditLockNotice holder={lock.holder} />
      <p data-testid="reason">{lock.reason ?? "немає"}</p>
      <p data-testid="form">{isEditing ? "форма" : "картка"}</p>
      <button
        onClick={() => {
          void lock.acquire().then(setEditing)
        }}
      >
        Редагувати
      </button>
      <button
        onClick={() => {
          setEditing(false)
          lock.release()
        }}
      >
        Закрити
      </button>
    </>
  )
}

function setup(provider: Partial<ErpDataProvider>, enabled?: boolean) {
  const dataProvider = {
    getEditLock: vi.fn(() => Promise.resolve(FREE)),
    takeEditLock: vi.fn(() => Promise.resolve(MINE)),
    releaseEditLock: vi.fn(() => Promise.resolve()),
    ...provider,
  } as unknown as ErpDataProvider
  const authProvider = {
    getMe: vi.fn(() => Promise.resolve(ME)),
  } as unknown as ErpAuthProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <CoreAdminContext
      dataProvider={dataProvider}
      authProvider={authProvider}
      queryClient={queryClient}
    >
      <Card enabled={enabled} />
    </CoreAdminContext>,
  )
  return { dataProvider, view }
}

describe("useEditLock", () => {
  it("запис вільний: форма відкривається, закриття відпускає блокування", async () => {
    const user = userEvent.setup()
    const { dataProvider } = setup({})
    await user.click(screen.getByRole("button", { name: "Редагувати" }))
    await waitFor(() => {
      expect(screen.getByTestId("form")).toHaveTextContent("форма")
    })
    expect(dataProvider.takeEditLock).toHaveBeenCalledWith("contacts", "1")
    await user.click(screen.getByRole("button", { name: "Закрити" }))
    expect(dataProvider.releaseEditLock).toHaveBeenCalledWith("contacts", "1")
  })

  it("свого блокування не показує як чуже", async () => {
    setup({ getEditLock: vi.fn(() => Promise.resolve(MINE)) })
    await waitFor(() => {
      expect(screen.getByTestId("reason")).toHaveTextContent("немає")
    })
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })

  it("запис редагує інша людина: смуга й причина для кнопки", async () => {
    setup({ getEditLock: vi.fn(() => Promise.resolve(THEIRS)) })
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /Запис зараз редагує Марта Шевчук/,
      )
    })
    await waitFor(() => {
      expect(screen.getByTestId("reason")).toHaveTextContent(
        "Запис зараз редагує Марта Шевчук",
      )
    })
  })

  it("запис щойно взяла інша людина: форма не відкривається", async () => {
    const user = userEvent.setup()
    setup({ takeEditLock: vi.fn(() => Promise.resolve(THEIRS)) })
    await user.click(screen.getByRole("button", { name: "Редагувати" }))
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /Запис зараз редагує Марта Шевчук/,
      )
    })
    expect(screen.getByTestId("form")).toHaveTextContent("картка")
  })

  it("збій блокування не заважає редагувати", async () => {
    const user = userEvent.setup()
    setup({
      takeEditLock: vi.fn(() =>
        Promise.reject(new ApiError(0, { code: "offline", message: "" })),
      ),
    })
    await user.click(screen.getByRole("button", { name: "Редагувати" }))
    await waitFor(() => {
      expect(screen.getByTestId("form")).toHaveTextContent("форма")
    })
  })

  it("бекенд без блокувань: 404 мовчить, запитів на взяття немає", async () => {
    const user = userEvent.setup()
    const getEditLock = vi.fn(() =>
      Promise.reject(new ApiError(404, { code: "not_found", message: "" })),
    )
    const { dataProvider } = setup({ getEditLock })
    await waitFor(() => {
      expect(getEditLock).toHaveBeenCalled()
    })
    await user.click(screen.getByRole("button", { name: "Редагувати" }))
    await waitFor(() => {
      expect(screen.getByTestId("form")).toHaveTextContent("форма")
    })
    expect(dataProvider.takeEditLock).not.toHaveBeenCalled()
  })

  it("вимкнено проектом: жодного запиту", async () => {
    const user = userEvent.setup()
    const { dataProvider } = setup({}, false)
    await user.click(screen.getByRole("button", { name: "Редагувати" }))
    await waitFor(() => {
      expect(screen.getByTestId("form")).toHaveTextContent("форма")
    })
    expect(dataProvider.getEditLock).not.toHaveBeenCalled()
    expect(dataProvider.takeEditLock).not.toHaveBeenCalled()
  })

  it("закриття сторінки з відкритою формою відпускає блокування", async () => {
    const user = userEvent.setup()
    const { dataProvider, view } = setup({})
    await user.click(screen.getByRole("button", { name: "Редагувати" }))
    await waitFor(() => {
      expect(screen.getByTestId("form")).toHaveTextContent("форма")
    })
    view.unmount()
    expect(dataProvider.releaseEditLock).toHaveBeenCalledTimes(1)
  })

  describe("подовження", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    /** Форма відкрита, час іде штучно: таймер подовження створюється вже на ньому. */
    async function openForm(provider: Partial<ErpDataProvider>) {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const result = setup(provider)
      await user.click(screen.getByRole("button", { name: "Редагувати" }))
      await waitFor(() => {
        expect(screen.getByTestId("form")).toHaveTextContent("форма")
      })
      return result
    }

    it("поки людина працює, блокування подовжується", async () => {
      const { dataProvider } = await openForm({})
      await act(() => vi.advanceTimersByTimeAsync(EDIT_LOCK_REFRESH_MS))
      expect(dataProvider.takeEditLock).toHaveBeenCalledTimes(2)
    })

    it("людина пішла: подовжень немає, сервер відпустить сам", async () => {
      const { dataProvider } = await openForm({})
      await act(() => vi.advanceTimersByTimeAsync(EDIT_LOCK_IDLE_MS * 2))
      const calls = vi.mocked(dataProvider.takeEditLock).mock.calls.length
      await act(() => vi.advanceTimersByTimeAsync(EDIT_LOCK_REFRESH_MS * 3))
      expect(dataProvider.takeEditLock).toHaveBeenCalledTimes(calls)
    })

    it("запис тим часом взяла інша людина: тост, подовжень більше немає", async () => {
      const takeEditLock = vi
        .fn<ErpDataProvider["takeEditLock"]>()
        .mockResolvedValueOnce(MINE)
        .mockResolvedValue(THEIRS)
      const warning = vi.spyOn(toast, "warning")
      const { dataProvider } = await openForm({ takeEditLock })
      await act(() => vi.advanceTimersByTimeAsync(EDIT_LOCK_REFRESH_MS))
      await act(() => vi.advanceTimersByTimeAsync(EDIT_LOCK_REFRESH_MS * 3))
      expect(takeEditLock).toHaveBeenCalledTimes(2)
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining("тепер редагує Марта Шевчук"),
      )
      expect(dataProvider.releaseEditLock).not.toHaveBeenCalled()
    })
  })
})
