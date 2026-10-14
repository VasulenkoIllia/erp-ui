import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { toast } from "sonner"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { EditableCell } from "@/registry/erp/editable-cell"
import { ApiError } from "@/registry/lib/api"
import { Input } from "@/registry/ui/input"
import { Toaster } from "@/registry/ui/sonner"

beforeAll(() => {
  // jsdom без захоплення вказівника, а sonner бере його на натискання в сповіщенні.
  if (!("setPointerCapture" in HTMLElement.prototype))
    Object.assign(HTMLElement.prototype, {
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      hasPointerCapture: () => false,
    })
})

interface Deferred {
  resolve: () => void
  reject: (error: unknown) => void
}

/** Комірка зі значенням «сервера»: успішне збереження міняє значення ззовні, як кеш списку. */
function Harness({
  onSave,
  onError,
  readOnly,
}: {
  onSave: (value: string) => Promise<unknown>
  onError?: (error: unknown, value: string) => boolean
  readOnly?: boolean
}) {
  const [value, setValue] = useState("ТОВ «Альфа»")
  return (
    <>
      <EditableCell
        value={value}
        label="Клієнт"
        recordLabel="2026-0001"
        readOnly={readOnly}
        display={(client) => client}
        editor={({ value: draft, onChange, inputProps }) => (
          <Input
            {...inputProps}
            value={draft}
            onChange={(event) => {
              onChange(event.target.value)
            }}
          />
        )}
        validate={(client) => (client.trim() ? null : "Заповніть це поле")}
        onSave={async (client) => {
          await onSave(client)
          setValue(client)
        }}
        onError={onError}
      />
      <Toaster />
    </>
  )
}

function deferredSave() {
  const calls: { value: string; deferred: Deferred }[] = []
  const onSave = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, deferred: { resolve, reject } })
      }),
  )
  return { calls, onSave }
}

const SERVER_ERROR = new ApiError(500, { code: "internal", message: "boom" })

async function editTo(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("button", { name: /ТОВ «Альфа»/ }))
  const input = screen.getByRole("textbox", { name: "Клієнт" })
  await user.clear(input)
  if (text) await user.type(input, text)
  await user.keyboard("{Enter}")
}

describe("erp/editable-cell", () => {
  it("оптимістично: нове значення одразу, після збереження фокус на комірці", async () => {
    const user = userEvent.setup()
    const { calls, onSave } = deferredSave()
    render(<Harness onSave={onSave} />)
    await editTo(user, "ТОВ «Бета»")

    const saving = screen.getByRole("button", {
      name: /ТОВ «Бета».*Зберігаємо/,
    })
    expect(saving).toHaveFocus()
    expect(onSave).toHaveBeenCalledWith("ТОВ «Бета»")

    calls[0]?.deferred.resolve()
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /ТОВ «Бета», змінити/ }),
      ).toHaveFocus()
    })
  })

  it("відмова сервера: значення повертається, сповіщення пояснює й пропонує повтор", async () => {
    const user = userEvent.setup()
    const { calls, onSave } = deferredSave()
    render(<Harness onSave={onSave} />)
    await editTo(user, "ТОВ «Бета»")
    calls[0]?.deferred.reject(SERVER_ERROR)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /ТОВ «Альфа», змінити/ }),
      ).toBeInTheDocument()
    })
    expect(
      await screen.findByText(/Не вдалося зберегти «Клієнт, 2026-0001»/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Повторити" }))
    expect(onSave).toHaveBeenLastCalledWith("ТОВ «Бета»")
    calls[1]?.deferred.resolve()
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /ТОВ «Бета», змінити/ }),
      ).toBeInTheDocument()
    })
  })

  it("onError обробляє помилку сам: сповіщення кіта немає", async () => {
    const user = userEvent.setup()
    const { calls, onSave } = deferredSave()
    const onError = vi.fn(() => true)
    // Сповіщення sonner живуть у його спільному стані між тестами — перевіряємо виклик.
    const toastError = vi.spyOn(toast, "error")
    render(<Harness onSave={onSave} onError={onError} />)
    await editTo(user, "ТОВ «Бета»")
    calls[0]?.deferred.reject(SERVER_ERROR)

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(SERVER_ERROR, "ТОВ «Бета»")
    })
    expect(
      screen.getByRole("button", { name: /ТОВ «Альфа», змінити/ }),
    ).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
    toastError.mockRestore()
  })

  it("Escape скасовує, порожнє значення не зберігається, F2 відкриває редактор", async () => {
    const user = userEvent.setup()
    const { onSave } = deferredSave()
    render(<Harness onSave={onSave} />)

    await editTo(user, "")
    const input = screen.getByRole("textbox", { name: "Клієнт" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("Заповніть це поле")

    await user.type(input, "ТОВ")
    expect(input).not.toHaveAttribute("aria-invalid")
    await user.keyboard("{Escape}")
    const cell = screen.getByRole("button", { name: /ТОВ «Альфа», змінити/ })
    expect(cell).toHaveFocus()
    expect(onSave).not.toHaveBeenCalled()

    await user.keyboard("{F2}")
    expect(screen.getByRole("textbox", { name: "Клієнт" })).toHaveValue(
      "ТОВ «Альфа»",
    )
  })

  it("без права — лише значення", () => {
    render(<Harness onSave={vi.fn()} readOnly />)
    expect(screen.getByText("ТОВ «Альфа»")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /ТОВ/ }),
    ).not.toBeInTheDocument()
  })
})
