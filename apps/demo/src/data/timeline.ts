import type { MockTimelineSeeds } from "@/registry/lib/mock-timeline-store"

import { HOSTILE_NOTE, NOTE } from "@/data/rich-text"

/**
 * Стрічка рахунку демо (PF05, ADR-0053): нотатки документом і простим рядком, повідомлення в обидва
 * боки, файли, підписники й дії, зокрема прострочена. Дати — відносно запуску демо.
 */
const DAY_MS = 86_400_000
const ago = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString()
/** Календарна дата за `days` від сьогодні. */
const inDays = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)

const OLENA = { id: "u-olena", name: "Олена Коваль" }
const MARTA = { id: "u-marta", name: "Марта Шевчук" }
const IVAN = { id: "u-ivan", name: "Іван Петренко" }

export const TIMELINE_SEEDS: MockTimelineSeeds = {
  "invoices/inv-00001": {
    followers: [OLENA, MARTA],
    activities: [
      {
        id: "act-overdue",
        version: 1,
        type: "call",
        title: "Нагадати про оплату",
        dueDate: inDays(-2),
        assignee: OLENA,
      },
      {
        id: "act-soon",
        version: 1,
        type: "email",
        title: "Надіслати акт виконаних робіт",
        dueDate: inDays(3),
        assignee: MARTA,
      },
    ],
    entries: [
      {
        id: "tl-note-doc",
        at: ago(2),
        kind: "note",
        author: OLENA,
        version: 1,
        body: NOTE,
      },
      {
        id: "tl-message-sent",
        at: ago(5),
        kind: "message",
        direction: "outgoing",
        status: "sent",
        party: "ТОВ «Зоря»",
        author: OLENA,
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Доброго дня! Надсилаю рахунок ще раз, ",
                },
                {
                  type: "text",
                  text: "сплатити до п'ятниці",
                  marks: [{ type: "bold" }],
                },
                { type: "text", text: "." },
              ],
            },
          ],
        },
      },
      {
        id: "tl-message-in",
        at: ago(26),
        kind: "message",
        direction: "incoming",
        party: "ТОВ «Зоря»",
        author: { name: "Богдан Мельник" },
        body: "Надішліть, будь ласка, рахунок ще раз, попередній не дійшов.",
      },
      {
        id: "tl-message-failed",
        at: ago(30),
        kind: "message",
        direction: "outgoing",
        status: "failed",
        party: "ТОВ «Зоря»",
        author: MARTA,
        body: "Рахунок у вкладенні.",
      },
      {
        id: "tl-file",
        at: ago(31),
        kind: "file",
        author: MARTA,
        file: {
          id: "file-1",
          name: "Рахунок-00001.pdf",
          size: 182_400,
          type: "application/pdf",
          url: "https://files.example/file-1/rahunok.pdf",
        },
      },
      {
        id: "tl-note-plain",
        at: ago(50),
        kind: "note",
        author: MARTA,
        version: 1,
        body: "Клієнт просить надсилати рахунки на загальну пошту.\nТелефон бухгалтерії не відповідає.",
      },
      {
        id: "tl-activity",
        at: ago(70),
        kind: "activity",
        author: IVAN,
        activity: {
          type: "call",
          title: "Уточнити реквізити",
          status: "done",
        },
      },
      {
        id: "tl-note-hostile",
        at: ago(90),
        kind: "note",
        author: IVAN,
        version: 1,
        body: HOSTILE_NOTE,
      },
      {
        id: "tl-other",
        at: ago(120),
        kind: "status",
        author: { name: "Система" },
        text: "Рахунок виставлено клієнту.",
      },
    ],
  },
  "invoices/inv-00002": {
    followers: [MARTA],
    entries: [
      {
        id: "tl-readonly-note",
        at: ago(4),
        kind: "note",
        author: MARTA,
        version: 1,
        body: "Період закрито, рахунок лише для перегляду.",
      },
    ],
  },
}
