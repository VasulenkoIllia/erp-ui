/**
 * Контракт ресурсу «Рахунки клієнтам» (K2) для демо — зразок того, як модуль описує дані
 * (SPEC §17: contract.ts + fixtures.ts). У хвилі 2 переїде в registry/modules/K2-invoices.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"

/** Порядок — життєвий цикл: чернетку погоджують, потім надсилають клієнту (крок 0.6c2). */
export const INVOICE_STATUSES = [
  "draft",
  "approved",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_CURRENCIES = ["UAH", "USD", "EUR"] as const

export const invoiceSchema = recordBaseSchema.extend({
  number: z.string().min(1),
  client: z.string().min(1),
  /** Сума в копійках (SPEC §17). */
  amount: z.number().int().min(0),
  currency: z.enum(INVOICE_CURRENCIES),
  status: z.enum(INVOICE_STATUSES),
  /** Календарні дати документа — без часу. */
  date: z.iso.date(),
  dueDate: z.iso.date(),
  companyId: z.string().nullable(),
})
export type Invoice = z.infer<typeof invoiceSchema>

/** Одиниці виміру рядків: код у даних, назва — з рядків демо. */
export const INVOICE_UNITS = ["pcs", "hour", "month", "service"] as const

export const invoiceLineSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit: z.enum(INVOICE_UNITS),
  /** Ціна й сума рядка в копійках. */
  price: z.number().int().min(0),
  total: z.number().int().min(0),
})
export type InvoiceLine = z.infer<typeof invoiceLineSchema>

/**
 * Рахунок на картці (`GET /invoices/:id`): запис списку й рядки документа. Список рядків не віддає —
 * їх може бути сотні, а таблиці потрібна лише шапка (ADR-0019).
 */
const invoiceLinesSchema = z.object({
  lines: z.array(invoiceLineSchema).optional(),
})

export interface ParsedInvoice {
  /** Запис для шапки: з відповіді картки чи з кешу списку. */
  invoice?: Invoice
  /** Рядки документа; немає — їх ще не завантажено (запис із кешу списку). */
  lines?: InvoiceLine[]
  /** Відповідь не пройшла схему: з переліком полів, щоб було видно, що зламалось. */
  error?: Error
}

/**
 * Запис і рядки окремо: шапку видно й тоді, коли рядків ще немає чи вони зіпсовані, а невідомий
 * статус чи поле не валять сторінку. `schema` — схема запису з полями розширення проекту
 * (`extendSchema` з lib/extension-fields): без них zod відкинув би нові поля.
 */
export function parseInvoiceDetail(
  data: unknown,
  schema: z.ZodType<Invoice> = invoiceSchema,
): ParsedInvoice {
  if (data === undefined) return {}
  const record = schema.safeParse(data)
  if (!record.success) return { error: invalidResponse("record", record.error) }
  const detail = invoiceLinesSchema.safeParse(data)
  if (!detail.success)
    return {
      invoice: record.data,
      error: invalidResponse("lines", detail.error),
    }
  return { invoice: record.data, lines: detail.data.lines }
}

const invalidResponse = (part: string, error: z.ZodError) =>
  new Error(
    `Invalid invoice ${part} in the response:\n${z.prettifyError(error)}`,
  )

/** Клієнти фікстур: варіанти фільтра «Клієнт» на стрес-сторінці. */
export const INVOICE_CLIENTS = [
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

/** Ліміт погодження без директора: 350 000,00 ₴ у копійках (масове погодження, ADR-0018). */
export const INVOICE_APPROVAL_LIMIT = 35_000_000

/** Детерміновані «випадкові» числа: фікстури однакові в кожному запуску й на скриншотах. */
function seeded(seed: number) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

/**
 * Стрес-сторінка (SPEC §18.1): 10 000 рахунків у основної компанії, ще 2 500 — у другої
 * (кожен п'ятий), щоб перемикач компанії показував інший список. Погоджених у фікстурах немає:
 * вони з'являються після масового погодження чернеток.
 */
export const INVOICE_COUNT = 12_500

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
      client:
        INVOICE_CLIENTS[Math.floor(random() * INVOICE_CLIENTS.length)] ??
        "ТОВ «Клієнт»",
      amount: Math.round(500 + random() * 400_000) * 100,
      currency: random() < 0.9 ? "UAH" : random() < 0.5 ? "USD" : "EUR",
      status,
      date: date.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      companyId: i % 5 === 4 ? "kovalenko" : "zoriana",
    }
  })
}

/** Товари й послуги рядків рахунку (дані, як і клієнти, — українською). */
const LINE_ITEMS: readonly { name: string; unit: InvoiceLine["unit"] }[] = [
  { name: "Транспортні послуги", unit: "service" },
  { name: "Європалети дерев'яні", unit: "pcs" },
  { name: "Консультації з логістики", unit: "hour" },
  { name: "Оренда складу", unit: "month" },
  { name: "Пакувальна стрічка", unit: "pcs" },
  { name: "Страхування вантажу", unit: "service" },
  { name: "Навантаження й розвантаження", unit: "hour" },
  { name: "Плівка стретч", unit: "pcs" },
]
const MAX_LINES = 4
/** Кількості, на які ділиться сума рядка без залишку: ціна — ціле число копійок. */
const QUANTITIES = [12, 10, 8, 6, 5, 4, 3, 2]

/**
 * Рядки рахунку з його поточної суми: та сама сума — ті самі рядки, а після зміни суми в комірці
 * рядки сходяться з новою (сума рядків завжди дорівнює `amount`).
 */
export function makeInvoiceLines(
  invoice: Pick<Invoice, "id" | "amount">,
): InvoiceLine[] {
  const random = seeded(Number(invoice.id.replace(/\D/g, "")) || 1)
  const count = 1 + Math.floor(random() * MAX_LINES)
  const weights = Array.from({ length: count }, () => 1 + random() * 4)
  const sum = weights.reduce((a, b) => a + b, 0)
  // Крок 3 і 8 позицій — взаємно прості: товари в рядках не повторюються.
  const start = Math.floor(random() * LINE_ITEMS.length)
  let left = invoice.amount
  return weights.map((weight, i) => {
    const total =
      i === count - 1 ? left : Math.floor((invoice.amount * weight) / sum)
    left -= total
    const item = LINE_ITEMS[(start + i * 3) % LINE_ITEMS.length] ?? {
      name: "Послуги",
      unit: "service",
    }
    const quantity =
      QUANTITIES.find((q) => total % q === 0 && random() < 0.5) ?? 1
    return {
      id: `${invoice.id}-${String(i + 1)}`,
      name: item.name,
      unit: item.unit,
      quantity,
      price: total / quantity,
      total,
    }
  })
}
