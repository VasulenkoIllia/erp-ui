import { useState } from "react"

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import {
  RichTextField,
  preloadRichTextEditor,
} from "@/registry/erp/rich-text-field"
import type { RichTextDoc } from "@/registry/lib/rich-text"

import { HOSTILE_NOTE, NOTE } from "@/data/rich-text"

const text = (value: string): RichTextDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
})

const findEditor = async (name = "Нотатка") => {
  const editor = await screen.findByRole("textbox", { name })
  await waitFor(() => {
    expect(editor).toHaveAttribute("contenteditable", "true")
  })
  return editor
}

// Перше завантаження Tiptap довше за очікування `findBy`.
beforeAll(preloadRichTextEditor, 30_000)

// jsdom не рахує розмірів, а ProseMirror прокручує до курсора після кожної команди з фокусом.
beforeAll(() => {
  const noRect = () =>
    ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) as DOMRect
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: noRect,
  })
  Object.assign(Element.prototype, { getClientRects: () => [] })
})

describe("RichTextField без редактора", () => {
  it("лише читання: у фокусі, читається, редагованої області немає", async () => {
    render(<RichTextField readOnly aria-label="Нотатка" value={NOTE} />)
    const field = screen.getByRole("textbox", { name: "Нотатка" })
    expect(field).toHaveAttribute("aria-readonly", "true")
    expect(field).toHaveAttribute("tabindex", "0")
    expect(field).not.toHaveAttribute("contenteditable")
    expect(field).toHaveTextContent("погодив")
    await userEvent.tab()
    expect(field).toHaveFocus()
  })

  it("вимкнено: поза порядком Tab", () => {
    render(<RichTextField disabled aria-label="Нотатка" value={NOTE} />)
    const field = screen.getByRole("textbox", { name: "Нотатка" })
    expect(field).toHaveAttribute("aria-disabled", "true")
    expect(field).not.toHaveAttribute("tabindex")
    expect(field).not.toHaveAttribute("aria-readonly")
  })
})

describe("RichTextField з редактором", () => {
  it("показує значення й кнопки, поле названо", async () => {
    render(<RichTextField aria-label="Нотатка" mentions={false} value={NOTE} />)
    const editor = await findEditor()
    expect(editor).toHaveTextContent("погодив")
    expect(editor).toHaveAttribute("aria-multiline", "true")
    expect(
      screen.getByRole("toolbar", { name: "Оформлення тексту" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Жирний" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("без згадок немає кнопки й автозаповнення, зі своїм пошуком є", async () => {
    const { unmount } = render(
      <RichTextField aria-label="Нотатка" mentions={false} value={null} />,
    )
    const plain = await findEditor()
    expect(plain).not.toHaveAttribute("aria-autocomplete")
    expect(
      screen.queryByRole("button", { name: "Згадати колегу" }),
    ).not.toBeInTheDocument()
    unmount()
    render(
      <RichTextField
        aria-label="Нотатка"
        mentions={() => Promise.resolve([])}
        value={null}
      />,
    )
    const editor = await findEditor()
    expect(editor).toHaveAttribute("aria-autocomplete", "list")
    expect(
      screen.getByRole("button", { name: "Згадати колегу" }),
    ).toBeInTheDocument()
  })

  it("атрибути поля оновлюються без пересоздання редактора", async () => {
    const { rerender } = render(
      <RichTextField aria-label="Нотатка" mentions={false} value={null} />,
    )
    const editor = await findEditor()
    expect(editor).not.toHaveAttribute("aria-invalid")
    rerender(
      <RichTextField
        aria-label="Нотатка"
        aria-invalid
        aria-describedby="hint"
        mentions={false}
        value={null}
      />,
    )
    await waitFor(() => {
      expect(editor).toHaveAttribute("aria-invalid", "true")
    })
    expect(editor).toHaveAttribute("aria-describedby", "hint")
    expect(screen.getByRole("textbox", { name: "Нотатка" })).toBe(editor)
  })

  it("нове значення ззовні замінює текст і не викликає onChange", async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <RichTextField
        aria-label="Нотатка"
        mentions={false}
        value={text("перше")}
        onChange={onChange}
      />,
    )
    const editor = await findEditor()
    rerender(
      <RichTextField
        aria-label="Нотатка"
        mentions={false}
        value={text("друге")}
        onChange={onChange}
      />,
    )
    await waitFor(() => {
      expect(editor).toHaveTextContent("друге")
    })
    rerender(
      <RichTextField
        aria-label="Нотатка"
        mentions={false}
        value={null}
        onChange={onChange}
      />,
    )
    await waitFor(() => {
      expect(editor).toHaveTextContent("")
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("Ctrl+Z не повертає текст, що прийшов ззовні", async () => {
    const onChange = vi.fn()
    const props = {
      "aria-label": "Нотатка",
      mentions: false,
      onChange,
    } as const
    const user = userEvent.setup()
    const { rerender } = render(
      <RichTextField {...props} value={text("перше")} />,
    )
    const editor = await findEditor()
    rerender(<RichTextField {...props} value={text("друге")} />)
    await waitFor(() => {
      expect(editor).toHaveTextContent("друге")
    })
    editor.focus()
    await user.keyboard("{Control>}z{/Control}")
    expect(editor).toHaveTextContent("друге")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("копія того самого значення не скидає редактор", async () => {
    function Copying() {
      const [value, setValue] = useState<RichTextDoc>(text("а"))
      return (
        <>
          <RichTextField aria-label="Нотатка" mentions={false} value={value} />
          <button
            type="button"
            onClick={() => {
              setValue(structuredClone<RichTextDoc>(value))
            }}
          >
            копія
          </button>
        </>
      )
    }
    render(<Copying />)
    const editor = await findEditor()
    const paragraph = editor.querySelector("p")
    await userEvent.click(screen.getByRole("button", { name: "копія" }))
    expect(editor.querySelector("p")).toBe(paragraph)
  })

  it("підроблений документ у редакторі не дає небезпечних елементів", async () => {
    render(
      <RichTextField
        aria-label="Нотатка"
        mentions={false}
        value={HOSTILE_NOTE}
      />,
    )
    const editor = await findEditor()
    expect(editor.querySelector("a, img, script, h1")).toBeNull()
    expect(editor).toHaveTextContent("Вузол із новішої версії кіта")
  })

  it("кнопка оформлення змінює документ і віддає формат кіта", async () => {
    const onChange = vi.fn()
    render(
      <RichTextField
        aria-label="Нотатка"
        mentions={false}
        value={text("а")}
        onChange={onChange}
      />,
    )
    await findEditor()
    await userEvent.click(
      screen.getByRole("button", { name: "Маркований список" }),
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    expect(onChange).toHaveBeenLastCalledWith({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "а" }],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(
      screen.getByRole("button", { name: "Маркований список" }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("ref ставить фокус у текст", async () => {
    const ref = { current: null as { focus: () => void } | null }
    render(
      <RichTextField
        aria-label="Нотатка"
        mentions={false}
        value={null}
        ref={ref}
      />,
    )
    const editor = await findEditor()
    ref.current?.focus()
    await waitFor(() => {
      expect(editor).toHaveFocus()
    })
  })

  it("клік по підпису ставить фокус у текст", async () => {
    render(
      <>
        <p id="label">Нотатка</p>
        <RichTextField aria-labelledby="label" mentions={false} value={null} />
      </>,
    )
    const editor = await findEditor()
    await userEvent.click(screen.getByText("Нотатка"))
    await waitFor(() => {
      expect(editor).toHaveFocus()
    })
  })

  it("вихід фокуса в межах поля не рахується виходом з поля", async () => {
    const onBlur = vi.fn()
    render(
      <>
        <RichTextField
          aria-label="Нотатка"
          mentions={false}
          value={null}
          onBlur={onBlur}
        />
        <button type="button">далі</button>
      </>,
    )
    await findEditor()
    const bold = screen.getByRole("button", { name: "Жирний" })
    bold.focus()
    screen.getByRole("button", { name: "Курсив" })
    expect(onBlur).not.toHaveBeenCalled()
    screen.getByRole("button", { name: "далі" }).focus()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})
