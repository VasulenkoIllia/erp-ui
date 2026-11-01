import type { RichTextDoc } from "@/registry/lib/rich-text"

/** Збережена нотатка: усе, що вміє поле тексту. */
export const NOTE: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Клієнт " },
        { type: "text", text: "погодив", marks: [{ type: "bold" }] },
        { type: "text", text: " умови, чекаємо " },
        { type: "text", text: "підписаний", marks: [{ type: "italic" }] },
        { type: "text", text: " договір. " },
        { type: "mention", attrs: { id: "u-marta", label: "Марта Шевчук" } },
        { type: "text", text: ", перевір, будь ласка." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "надіслати рахунок" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "узгодити доставку" }],
            },
          ],
        },
      ],
    },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Оплата двома частинами." }],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Умови договору",
          marks: [
            {
              type: "link",
              attrs: { href: "https://docs.example/contract" },
            },
          ],
        },
      ],
    },
  ],
}

/**
 * Документ, який міг підробити хтось із доступом до API: небезпечні адреси, HTML у тексті,
 * вузол, якого кіт не знає. Значення свідомо `unknown`: типи такого документа не пропустять.
 */
export const HOSTILE_NOTE: unknown = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Посилання javascript:",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
        { type: "text", text: ", " },
        {
          type: "text",
          text: "посилання data:",
          marks: [
            {
              type: "link",
              attrs: { href: "data:text/html,<script>alert(1)</script>" },
            },
          ],
        },
        { type: "text", text: ", " },
        {
          type: "text",
          text: "адреса з чужим іменем",
          marks: [
            {
              type: "link",
              attrs: { href: "https://bank.example@evil.example/" },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "<img src=x onerror=alert(1)><b>Це текст</b>" },
      ],
    },
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Вузол із новішої версії кіта" }],
    },
  ],
}

/** Бекенд без оформлення віддає простий рядок. */
export const PLAIN_NOTE =
  "Простий текст зі старого бекенду.\nДругий рядок лишається окремо."
