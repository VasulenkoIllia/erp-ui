/**
 * Контракт ресурсу «Рахунки клієнтам» (K2) для демо — зразок того, як модуль описує дані
 * (SPEC §17: contract.ts + fixtures.ts). У хвилі 2 переїде в registry/modules/K2-invoices.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const invoiceSchema = recordBaseSchema.extend({
  number: z.string().min(1),
  client: z.string().min(1),
  /** Сума в копійках (SPEC §17). */
  amount: z.number().int().min(0),
  currency: z.enum(["UAH", "USD", "EUR"]),
  status: z.enum(INVOICE_STATUSES),
  /** Календарні дати документа — без часу. */
  date: z.iso.date(),
  dueDate: z.iso.date(),
  companyId: z.string().nullable(),
})
export type Invoice = z.infer<typeof invoiceSchema>

const CLIENTS = [
  "ТОВ «Дніпро Трейд»",
  "ПП «Агросвіт»",
  "ФОП Коваленко О. В.",
  "ТОВ «Карпатська вода»",
  "АТ «Полтавський молочник»",
  "ТОВ «Смарт Логістик»",
  "ФОП Шевчук І. М.",
  "ТОВ «Буковина Агро»",
  "ПрАТ «Слобожанський прилад»",
  "ТОВ «Одеса Порт Сервіс»",
]

/** Детерміновані «випадкові» числа: фікстури однакові в кожному запуску й на скриншотах. */
function seeded(seed: number) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

export function makeInvoices(count: number): Invoice[] {
  const random = seeded(42)
  const start = Date.UTC(2026, 0, 5)
  return Array.from({ length: count }, (_, i) => {
    const day = Math.floor(random() * 280)
    const date = new Date(start + day * 86_400_000)
    const due = new Date(date.getTime() + 14 * 86_400_000)
    const pick = random()
    const status: InvoiceStatus =
      pick < 0.12
        ? "draft"
        : pick < 0.32
          ? "sent"
          : pick < 0.42
            ? "partially_paid"
            : pick < 0.88
              ? "paid"
              : "overdue"
    return {
      id: `inv-${String(i + 1).padStart(5, "0")}`,
      version: 1,
      number: `2026-${String(i + 1).padStart(4, "0")}`,
      client: CLIENTS[Math.floor(random() * CLIENTS.length)] ?? "ТОВ «Клієнт»",
      amount: Math.round(500 + random() * 400_000) * 100,
      currency: random() < 0.9 ? "UAH" : random() < 0.5 ? "USD" : "EUR",
      status,
      date: date.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      companyId: i % 4 === 3 ? "kovalenko" : "zoriana",
    }
  })
}
