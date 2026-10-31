import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SaveBar, type SaveBarProps } from "@/registry/erp/save-bar"

/** Липка панель збереження (PF11, ADR-0047). */
function Bar(props: Partial<SaveBarProps> & { onSubmit?: () => void }) {
  const { onSubmit, ...bar } = props
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.()
      }}
    >
      <SaveBar
        isDirty={false}
        isSaving={false}
        onDiscard={() => undefined}
        {...bar}
      />
    </form>
  )
}

const save = () => screen.getByRole("button", { name: "Зберегти" })
const discard = () => screen.getByRole("button", { name: "Скасувати зміни" })

afterEach(cleanup)

describe("erp/save-bar", () => {
  it("без змін: «Змін немає», «Зберегти» не вимкнено, скасовувати нічого", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Bar onSubmit={onSubmit} />)
    expect(screen.getByRole("status")).toHaveTextContent("Змін немає")
    expect(discard()).toHaveAttribute("aria-disabled", "true")
    await user.click(save())
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it("зі змінами: стан у живому регіоні, той самий вузол", () => {
    const { rerender } = render(<Bar />)
    const status = screen.getByRole("status")
    rerender(<Bar isDirty />)
    expect(screen.getByRole("status")).toBe(status)
    expect(status).toHaveTextContent("Є незбережені зміни")
    expect(discard()).toHaveAttribute("aria-disabled", "false")
  })

  it("запит іде: кнопки зайняті, фокус лишається на них", () => {
    render(<Bar isDirty isSaving />)
    expect(screen.getByRole("status")).toHaveTextContent("Зберігаємо…")
    expect(save()).toHaveAttribute("aria-disabled", "true")
    expect(save()).not.toBeDisabled()
    expect(discard()).toHaveAttribute("aria-disabled", "true")
  })

  it("«Скасувати зміни» питає, відмова нічого не скидає", async () => {
    const user = userEvent.setup()
    const onDiscard = vi.fn()
    render(<Bar isDirty onDiscard={onDiscard} />)
    await user.click(discard())
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("Усе, що ви змінили")
    await user.click(
      screen.getByRole("button", { name: "Повернутися до форми" }),
    )
    expect(onDiscard).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
    })
    await user.click(discard())
    const confirm = await screen.findByRole("alertdialog")
    await user.click(
      within(confirm).getByRole("button", { name: "Скасувати зміни" }),
    )
    await waitFor(() => {
      expect(onDiscard).toHaveBeenCalledOnce()
    })
  })

  it("свій підпис кнопки", () => {
    render(<Bar submitLabel="Застосувати" />)
    expect(screen.getByRole("button", { name: "Застосувати" })).toHaveAttribute(
      "type",
      "submit",
    )
  })
})
