import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RichTextView } from "@/registry/erp/rich-text-view"

import { HOSTILE_NOTE, NOTE, PLAIN_NOTE } from "@/data/rich-text"

describe("RichTextView", () => {
  it("будує елементи з документа", () => {
    render(<RichTextView value={NOTE} />)
    expect(screen.getByText("погодив").tagName).toBe("STRONG")
    expect(screen.getByText("підписаний").tagName).toBe("EM")
    expect(screen.getByText("@Марта Шевчук")).toHaveAttribute(
      "data-slot",
      "rich-text-mention",
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByRole("blockquote")).toHaveTextContent(
      "Оплата двома частинами.",
    )
  })

  it("посилання відкривається окремо й без доступу до вікна", () => {
    render(<RichTextView value={NOTE} />)
    const link = screen.getByRole("link", { name: "Умови договору" })
    expect(link).toHaveAttribute("href", "https://docs.example/contract")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow")
  })

  it("у підробленому документі немає небезпечних посилань і вставленого HTML", () => {
    const { container } = render(<RichTextView value={HOSTILE_NOTE} />)
    expect(container.querySelector("a, img, script, b, h1")).toBeNull()
    expect(
      screen.getByText("<img src=x onerror=alert(1)><b>Це текст</b>"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Посилання javascript:/)).toBeInTheDocument()
    expect(screen.getByText("Вузол із новішої версії кіта")).toBeInTheDocument()
  })

  it("атрибути вузла не потрапляють у DOM", () => {
    const { container } = render(
      <RichTextView
        value={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { style: "color:red", onclick: "alert(1)" },
              content: [{ type: "text", text: "а" }],
            },
          ],
        }}
      />,
    )
    const paragraph = container.querySelector("p")
    expect(paragraph?.getAttributeNames()).toEqual([])
  })

  it("простий текст: кожен рядок окремо", () => {
    const { container } = render(<RichTextView value={PLAIN_NOTE} />)
    expect(container.querySelectorAll("p")).toHaveLength(2)
  })

  it("порожнє значення показує прочерк або своє", () => {
    const { rerender } = render(<RichTextView value={null} />)
    expect(screen.getByText("—")).toBeInTheDocument()
    rerender(<RichTextView value={null} empty="Немає нотаток" />)
    expect(screen.getByText("Немає нотаток")).toBeInTheDocument()
  })

  it("renderMention замінює згадку", () => {
    render(
      <RichTextView
        value={NOTE}
        renderMention={(mention) => <a href="#person">{mention.id}</a>}
      />,
    )
    expect(screen.getByRole("link", { name: "u-marta" })).toHaveAttribute(
      "href",
      "#person",
    )
  })

  it("номер першого пункту списку зберігається", () => {
    const { container } = render(
      <RichTextView
        value={{
          type: "doc",
          content: [
            {
              type: "orderedList",
              attrs: { start: 5 },
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "п'ятий" }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    )
    expect(container.querySelector("ol")).toHaveAttribute("start", "5")
  })
})
