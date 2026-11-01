/**
 * Демо-дані. Назви компаній і людей — це дані, а не рядки інтерфейсу:
 * мову даних тримаємо окремо від мови інтерфейсу (SPEC §11), тож вони не перекладаються.
 * Суми — цілі копійки + код валюти (SPEC §17).
 */
import type { Money } from "@/registry/lib/format"
import type { ModuleId } from "@/registry/lib/icons"

export type StatusKind = "success" | "warning" | "destructive" | "info"

export interface InvoiceRow {
  number: string
  client: string
  amount: Money
  status: StatusKind
}

export const INVOICES: InvoiceRow[] = [
  {
    number: "2026-0142",
    client: "ТОВ «Зоряна логістика»",
    amount: { amount: 4_860_000, currency: "UAH" },
    status: "success",
  },
  {
    number: "2026-0141",
    client: "ФОП Коваленко О. В.",
    amount: { amount: 1_235_050, currency: "UAH" },
    status: "warning",
  },
  {
    number: "2026-0139",
    client: "ПП «Агросвіт»",
    amount: { amount: 31_000_000, currency: "UAH" },
    status: "destructive",
  },
  {
    number: "2026-0138",
    client: "ТОВ «Дніпро Трейд»",
    amount: { amount: 798_000, currency: "UAH" },
    status: "info",
  },
]

export const SAMPLE = {
  company: "ТОВ «Зоряна логістика»",
  person: "Олена Коваль",
  edrpouShort: "1234567",
  edrpou: "32855961",
  iban: "UA21 3223 1300 0002 6007 2335 6600 1",
  note: "Оплата частинами",
  vatRate: 0.2,
  contract: { amount: 12_000_000, currency: "UAH" } satisfies Money,
  /** Момент автозбереження для підказки поля. */
  savedAt: "2026-10-13T07:42:00Z",
  invoiceNumber: "2026-0142",
}

/** Валюти списку вибору (назви — з Intl.DisplayNames мовою інтерфейсу). */
export const CURRENCIES = ["UAH", "EUR", "USD", "PLN"] as const

/** Приклади LC12: справжні контрольні суми. */
export const LC12_SAMPLES = {
  /** Приклад із python-stdnum. */
  edrpou: "32855961",
  /** Приклад із python-stdnum. */
  rnokpp: "1759013776",
  /** ІПН ПриватБанку з неправильною контрольною цифрою — показує стан помилки. */
  vatIpn: "143605704022",
  iban: "UA213223130000026007233566001",
  phone: "+380671234567",
}

/** Момент «зараз» для прикладів відносного часу й дат — щоб скриншоти не змінювались. */
export const DEMO_NOW = new Date("2026-10-13T09:00:00Z")
export const DEMO_TIME_ZONE = "Europe/Kyiv"

/** Компанії для перемикача (PF02). */
export const COMPANIES = [
  {
    id: "zoriana",
    name: "ТОВ «Зоряна логістика»",
    description: "ЄДРПОУ 32855961",
  },
  {
    id: "kovalenko",
    name: "ФОП Коваленко О. В.",
    description: "РНОКПП 1759013776",
  },
]

export const DEMO_USER = {
  name: "Олена Коваль",
  email: "olena@zoriana.example",
}

/** Розділи прикладу ERP у навігації демо: модулі з SPEC §14 і лічильник «на погодженні». */
export const ERP_EXAMPLE: { id: ModuleId; badge?: number }[] = [
  { id: "O1" },
  { id: "K2", badge: 3 },
  { id: "B1" },
  { id: "A1" },
  { id: "A2" },
  { id: "A5" },
  { id: "A6" },
  { id: "A4" },
  { id: "N5" },
  { id: "F2" },
  { id: "F4" },
  { id: "LC04" },
]
