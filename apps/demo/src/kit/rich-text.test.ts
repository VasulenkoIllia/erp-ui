import { describe, expect, it } from "vitest"

import {
  EMPTY_RICH_TEXT,
  RICH_TEXT_MAX_DEPTH,
  RICH_TEXT_MAX_NODES,
  isRichTextEmpty,
  linkFromInput,
  richTextFromPlain,
  richTextMentions,
  richTextSchema,
  richTextToPlain,
  safeLinkHref,
  toRichText,
} from "@/registry/lib/rich-text"

import { HOSTILE_NOTE, NOTE } from "@/data/rich-text"

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
})
const doc = (...content: unknown[]) => ({ type: "doc", content })

describe("safeLinkHref", () => {
  it.each([
    ["https://docs.example/a?b=1#c", "https://docs.example/a?b=1#c"],
    ["http://docs.example/", "http://docs.example/"],
    ["  https://docs.example/  ", "https://docs.example/"],
    ["mailto:olena@firma.example", "mailto:olena@firma.example"],
    ["tel:+380441234567", "tel:+380441234567"],
  ])("дозволяє %s", (href, expected) => {
    expect(safeLinkHref(href)).toBe(expected)
  })

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://files.example/",
    "blob:https://docs.example/1",
    "//evil.example/",
    "/relative/path",
    "docs.example",
    "https://bank.example@evil.example/",
    "https://user:password@docs.example/",
    "",
  ])("не пропускає %j", (href) => {
    expect(safeLinkHref(href)).toBeNull()
  })

  it("не пропускає значення не рядком", () => {
    expect(safeLinkHref(undefined)).toBeNull()
    expect(safeLinkHref({ toString: () => "https://a.example" })).toBeNull()
  })
})

describe("linkFromInput", () => {
  it("адреса без схеми стає https", () => {
    expect(linkFromInput("docs.example/a")).toBe("https://docs.example/a")
  })

  it("наявну схему не підміняє: небезпечну відхиляє", () => {
    expect(linkFromInput("javascript:alert(1)")).toBeNull()
    expect(linkFromInput("mailto:a@b.example")).toBe("mailto:a@b.example")
    expect(linkFromInput("   ")).toBeNull()
  })
})

describe("toRichText", () => {
  it("законний документ лишається таким самим", () => {
    expect(toRichText(NOTE)).toEqual(NOTE)
  })

  it("не залежить від того, скільки разів пройшов", () => {
    const once = toRichText(HOSTILE_NOTE)
    expect(toRichText(once)).toEqual(once)
  })

  it("рядок стає абзацами, порожні рядки лишаються", () => {
    expect(toRichText("перший\n\nтретій")).toEqual({
      type: "doc",
      content: [
        paragraph("перший"),
        { type: "paragraph" },
        paragraph("третій"),
      ],
    })
  })

  it.each([[null], [undefined], [42], [[]], [{}], [{ type: "paragraph" }]])(
    "не документ дає порожній документ: %j",
    (value) => {
      expect(toRichText(value)).toEqual(EMPTY_RICH_TEXT)
    },
  )

  it("небезпечні посилання стають текстом, інші позначки лишаються", () => {
    const result = toRichText(
      doc({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "клік",
            marks: [
              { type: "bold" },
              { type: "link", attrs: { href: "javascript:alert(1)" } },
            ],
          },
        ],
      }),
    )
    expect(result.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "клік", marks: [{ type: "bold" }] }],
    })
  })

  it("прибирає зайві атрибути редактора й чужі позначки", () => {
    const result = toRichText(
      doc({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "а",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://a.example/",
                  target: "_self",
                  onclick: "alert(1)",
                },
              },
              { type: "textStyle", attrs: { color: "red" } },
              { type: "bold" },
              { type: "bold" },
            ],
          },
          {
            type: "mention",
            attrs: { id: "u1", label: "Олена", mentionSuggestionChar: "@" },
          },
        ],
      }),
    )
    expect(result.content[0]).toEqual({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "а",
          marks: [
            { type: "link", attrs: { href: "https://a.example/" } },
            { type: "bold" },
          ],
        },
        { type: "mention", attrs: { id: "u1", label: "Олена" } },
      ],
    })
  })

  it("невідомий вузол лишає текст, рядкові сусіди збираються в абзац", () => {
    const result = toRichText(
      doc(
        {
          type: "heading",
          attrs: { level: 1 },
          content: [
            { type: "text", text: "Заголовок " },
            { type: "text", text: "новий", marks: [{ type: "italic" }] },
          ],
        },
        {
          type: "table",
          content: [{ type: "tableRow", content: [paragraph("клітинка")] }],
        },
        { type: "text", text: "без абзацу" },
      ),
    )
    expect(richTextToPlain(result)).toBe(
      "Заголовок новий\nклітинка\nбез абзацу",
    )
    expect(result.content.every((block) => block.type === "paragraph")).toBe(
      true,
    )
  })

  it("пункт списку завжди починається з абзацу, порожні контейнери зникають", () => {
    const result = toRichText(
      doc(
        { type: "blockquote", content: [] },
        { type: "bulletList", content: [] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "bulletList",
                  content: [{ type: "listItem", content: [paragraph("а")] }],
                },
              ],
            },
          ],
        },
      ),
    )
    expect(result.content).toHaveLength(1)
    const [list] = result.content
    expect(list?.type === "bulletList" && list.content[0]?.content[0]).toEqual({
      type: "paragraph",
    })
  })

  it("номер списку: лише додатне ціле більше за 1", () => {
    const list = (start: unknown) =>
      toRichText(
        doc({
          type: "orderedList",
          attrs: { start },
          content: [{ type: "listItem", content: [paragraph("а")] }],
        }),
      ).content[0]
    expect(list(5)).toMatchObject({ attrs: { start: 5 } })
    expect(list(1)).not.toHaveProperty("attrs")
    expect(list("5")).not.toHaveProperty("attrs")
    expect(list(-3)).not.toHaveProperty("attrs")
    expect(list(1.5)).not.toHaveProperty("attrs")
  })

  it("згадка без id зникає, без підпису показує id", () => {
    const result = toRichText(
      doc({
        type: "paragraph",
        content: [
          { type: "mention", attrs: { label: "Без id" } },
          { type: "mention", attrs: { id: "u1" } },
        ],
      }),
    )
    expect(result.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "mention", attrs: { id: "u1", label: "u1" } }],
    })
  })

  it("дуже глибокий документ не вичерпує стек", () => {
    let nested: unknown = paragraph("на дні")
    for (let level = 0; level < 200_000; level += 1)
      nested = { type: "blockquote", content: [nested] }
    expect(() => toRichText(doc(nested))).not.toThrow()
    expect(richTextToPlain(doc(nested))).toBe("")
  })

  it("глибина в межах норми лишається", () => {
    let nested: unknown = paragraph("на дні")
    for (let level = 0; level < RICH_TEXT_MAX_DEPTH - 3; level += 1)
      nested = { type: "blockquote", content: [nested] }
    expect(richTextToPlain(doc(nested))).toBe("на дні")
  })

  it("кількість вузлів обмежена", () => {
    const huge = doc(
      ...Array.from({ length: RICH_TEXT_MAX_NODES * 2 }, () => paragraph("а")),
    )
    const lines = richTextToPlain(huge).split("\n").length
    expect(lines).toBeLessThanOrEqual(RICH_TEXT_MAX_NODES)
    expect(lines).toBeGreaterThan(RICH_TEXT_MAX_NODES / 3)
  })
})

describe("допоміжні функції", () => {
  it("простий текст: згадки, списки, цитати", () => {
    expect(richTextToPlain(NOTE)).toBe(
      "Клієнт погодив умови, чекаємо підписаний договір. @Марта Шевчук, перевір, будь ласка.\nнадіслати рахунок\nузгодити доставку\nОплата двома частинами.\nУмови договору",
    )
  })

  it("порожнеча: згадка не порожня, пробіли порожні", () => {
    expect(isRichTextEmpty(null)).toBe(true)
    expect(isRichTextEmpty("   ")).toBe(true)
    expect(isRichTextEmpty(doc({ type: "paragraph" }))).toBe(true)
    expect(isRichTextEmpty(doc(paragraph("   ")))).toBe(true)
    expect(isRichTextEmpty(NOTE)).toBe(false)
    expect(
      isRichTextEmpty(
        doc({
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "u1", label: "О" } }],
        }),
      ),
    ).toBe(false)
  })

  it("згадки без повторів, також у списку й цитаті", () => {
    const mention = (id: string) => ({
      type: "paragraph",
      content: [{ type: "mention", attrs: { id, label: id } }],
    })
    expect(
      richTextMentions(
        doc(
          mention("u1"),
          { type: "blockquote", content: [mention("u2")] },
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [mention("u3")] }],
          },
          mention("u1"),
        ),
      ).map((person) => person.id),
    ).toEqual(["u1", "u2", "u3"])
  })

  it("richTextFromPlain: порожній рядок дає порожній документ", () => {
    expect(richTextFromPlain("  \n ")).toEqual(EMPTY_RICH_TEXT)
  })

  it("схема чистить документ і відхиляє не документ", () => {
    expect(richTextSchema.parse(HOSTILE_NOTE)).toEqual(toRichText(HOSTILE_NOTE))
    expect(richTextSchema.safeParse("текст").success).toBe(false)
    expect(richTextSchema.safeParse({ type: "doc" }).success).toBe(false)
  })
})
