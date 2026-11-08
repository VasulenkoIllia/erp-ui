/**
 * Демо-дані модуля B3 українською й англійською (SPEC §17) — вони ж шаблон даних для першого запуску
 * (PF12). Назви товарів і клієнтів — дані, а не рядки інтерфейсу: мова даних (`locale`) окремо від мови
 * інтерфейсу (SPEC §11). Дати — від сьогодні: надіслана пропозиція з минулим строком показує «Термін
 * минув». Номери — за шаблоном серії `quotes` і лічильником, який засів уже видав (`counters`).
 */
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import type { DocumentState } from "@/lib/document-lifecycle"
import type {
  DocumentBodyLine,
  DocumentLineTax,
  DocumentLineUnit,
} from "@/lib/document-lines"
import { formatDocumentNumber } from "@/lib/numbering"

import type { QuoteCard, QuoteStatus } from "./contract"
import { quoteSumsOf } from "./quote-totals"

export type FixtureLocale = "uk" | "en"

/** Клієнт пропозицій: запис ресурсу клієнтів проекту (`organizations` модуля B1). */
export interface SalesFixtureClient {
  readonly id: string
  readonly name: string
}

/** Знімки довідників компанії для рядків (A6): одиниця штук і годин, ставка ПДВ. */
export interface SalesFixtureDictionaries {
  readonly pieces: DocumentLineUnit
  readonly hours: DocumentLineUnit
  readonly vat: DocumentLineTax
}

export interface SalesFixtureOptions {
  readonly locale?: FixtureLocale
  /** Компанії з пропозиціями; за замовчуванням одна спільна (`null`). */
  readonly companies?: readonly (string | null)[]
  /** Клієнти компанії з ресурсу клієнтів проекту; за замовчуванням — свої назви модуля. */
  readonly clients?: (companyId: string | null) => readonly SalesFixtureClient[]
  /** Знімки одиниць і податку з довідників компанії; за замовчуванням — свої без `id` довідника. */
  readonly dictionaries?: (companyId: string | null) => SalesFixtureDictionaries
  /** Сьогодні: від нього дати пропозицій. Тести ставлять сталу дату. */
  readonly today?: CalendarDate
}

/** Скільки номерів серії `quotes` видав засів: компанія, рік дати документа, останнє значення. */
export interface SalesFixtureCounter {
  readonly companyId: string | null
  readonly year: number
  readonly value: number
}

export interface SalesFixtures {
  readonly quotes: QuoteCard[]
  readonly counters: SalesFixtureCounter[]
}

/** Шаблон серії пропозицій (ADR-0058) мовою даних: «КП-2026-0001». */
export const QUOTE_NUMBER_TEMPLATE: Record<FixtureLocale, string> = {
  uk: "КП-{YYYY}-{####}",
  en: "QT-{YYYY}-{####}",
}

const CURRENCY = "UAH"
/** Строк пропозиції в засіві: два тижні від дати. */
const VALID_DAYS = 14

const CLIENT_NAMES: Record<FixtureLocale, readonly string[]> = {
  uk: [
    "ТОВ «Зелена долина»",
    "ФОП Ткаченко О. В.",
    "ТОВ «Сонячний берег»",
    "ПП «Будмайстер»",
    "ТОВ «Річкова гавань»",
  ],
  en: [
    "Green Valley LLC",
    "O. Tkachenko, sole trader",
    "Sunny Shore LLC",
    "Buildmaster PE",
    "River Harbour LLC",
  ],
}

/** Товари й послуги засіву: назва мовою даних, ціна в гривнях, послуга — у годинах. */
const ITEMS = [
  {
    uk: "Кавоварка ріжкова",
    en: "Espresso machine",
    price: "18500",
    hours: false,
  },
  { uk: "Кавомолка жорнова", en: "Burr grinder", price: "6400", hours: false },
  {
    uk: "Кава в зернах, 1 кг",
    en: "Coffee beans, 1 kg",
    price: "720.50",
    hours: false,
  },
  { uk: "Фільтр для води", en: "Water filter", price: "1250", hours: false },
  {
    uk: "Монтаж обладнання",
    en: "Equipment installation",
    price: "850",
    hours: true,
  },
  {
    uk: "Навчання бариста",
    en: "Barista training",
    price: "1200",
    hours: true,
  },
] as const

const SECTION_TITLES: Record<FixtureLocale, readonly string[]> = {
  uk: ["Обладнання", "Витратні матеріали", "Послуги"],
  en: ["Equipment", "Supplies", "Services"],
}
const NOTE_TEXT: Record<FixtureLocale, string> = {
  uk: "Доставка по місту безкоштовна.",
  en: "Free delivery within the city.",
}

const DEFAULT_DICTIONARIES: Record<FixtureLocale, SalesFixtureDictionaries> = {
  uk: {
    pieces: { id: null, name: "шт." },
    hours: { id: null, name: "год" },
    vat: { id: "vat-20", name: "ПДВ 20%", rate: 20, included: false },
  },
  en: {
    pieces: { id: null, name: "pcs" },
    hours: { id: null, name: "h" },
    vat: { id: "vat-20", name: "VAT 20%", rate: 20, included: false },
  },
}

interface Seed {
  readonly status: QuoteStatus
  readonly docStatus: DocumentState
  /** Днів тому від сьогодні. */
  readonly age: number
  /** Рядків товарів; від 12 у редакторі з'являються пошук і «До підсумків». */
  readonly items: number
  readonly sections?: boolean
  readonly discountPercent?: number
  /** Скасована з виправленою копією — наступний засів (`amendedBy`). */
  readonly amended?: boolean
}

/** Засів компанії: усі статуси модуля, минулий строк, виправлена копія, великий документ. */
const SEEDS: readonly Seed[] = [
  { status: "draft", docStatus: "draft", age: 0, items: 3 },
  { status: "draft", docStatus: "draft", age: 1, items: 14, sections: true },
  { status: "sent", docStatus: "submitted", age: 2, items: 4 },
  { status: "sent", docStatus: "submitted", age: 20, items: 2 },
  {
    status: "accepted",
    docStatus: "submitted",
    age: 9,
    items: 5,
    discountPercent: 5,
  },
  { status: "declined", docStatus: "submitted", age: 16, items: 2 },
  {
    status: "cancelled",
    docStatus: "cancelled",
    age: 25,
    items: 3,
    amended: true,
  },
  { status: "draft", docStatus: "draft", age: 4, items: 3 },
  { status: "sent", docStatus: "submitted", age: 6, items: 6, sections: true },
  { status: "accepted", docStatus: "submitted", age: 31, items: 2 },
]

const at = <T>(list: readonly T[], index: number): T => {
  const value = list[index % list.length]
  if (value === undefined) throw new Error("B3-sales: empty fixture list")
  return value
}

/** Рядки засіву: товари по черзі, з розділами — заголовок перед кожною групою й нотатка наприкінці. */
function linesOf(
  seed: Seed,
  index: number,
  locale: FixtureLocale,
  dictionaries: SalesFixtureDictionaries,
  prefix: string,
): DocumentBodyLine[] {
  const lines: DocumentBodyLine[] = []
  const groupSize = Math.ceil(seed.items / SECTION_TITLES[locale].length)
  for (let item = 0; item < seed.items; item += 1) {
    if (seed.sections && item % groupSize === 0)
      lines.push({
        kind: "section",
        id: `${prefix}-s${String(item)}`,
        title: at(SECTION_TITLES[locale], item / groupSize),
      })
    const product = at(ITEMS, index + item)
    lines.push({
      kind: "item",
      id: `${prefix}-l${String(item)}`,
      name: product[locale],
      itemId: null,
      quantity: String((item % 3) + 1),
      unit: product.hours ? dictionaries.hours : dictionaries.pieces,
      price: product.price,
      discountPercent: item % 4 === 3 ? 10 : 0,
      discountAmount: 0,
      tax: dictionaries.vat,
    })
  }
  if (seed.sections)
    lines.push({ kind: "note", id: `${prefix}-n`, text: NOTE_TEXT[locale] })
  return lines
}

export function createSalesFixtures({
  locale = "uk",
  companies = [null],
  clients,
  dictionaries,
  today = todayIn(),
}: SalesFixtureOptions = {}): SalesFixtures {
  const quotes: QuoteCard[] = []
  const counters = new Map<string, SalesFixtureCounter>()
  /** Наступний номер серії компанії за роком дати: засів іде від старших до новіших. */
  const issue = (companyId: string | null, date: CalendarDate) => {
    const year = Number(date.slice(0, 4))
    const key = `${companyId ?? "-"}:${String(year)}`
    const value = (counters.get(key)?.value ?? 0) + 1
    counters.set(key, { companyId, year, value })
    return formatDocumentNumber(QUOTE_NUMBER_TEMPLATE[locale], { date, value })
  }
  for (const companyId of companies) {
    const names =
      clients?.(companyId) ??
      CLIENT_NAMES[locale].map((name, index) => ({
        id: `client-${String(index + 1)}`,
        name,
      }))
    const snapshots = dictionaries?.(companyId) ?? DEFAULT_DICTIONARIES[locale]
    const owner = companyId ?? "shared"
    // Від старших: номери зростають разом із датою, як їх видавав би сервер.
    const order = SEEDS.map((seed, index) => ({ seed, index })).sort(
      (a, b) => b.seed.age - a.seed.age,
    )
    const created = new Map<number, QuoteCard>()
    for (const { seed, index } of order) {
      const id = `qt-${owner}-${String(index + 1).padStart(2, "0")}`
      const date = addDays(today, -seed.age)
      // Виправлена копія — для того самого клієнта, що й скасована.
      const client = at(names, SEEDS[index - 1]?.amended ? index - 1 : index)
      const body = {
        currency: CURRENCY,
        lines: linesOf(seed, index, locale, snapshots, id),
        discountPercent: seed.discountPercent ?? 0,
        discountAmount: 0,
      }
      const sums = quoteSumsOf(body)
      if (!sums) throw new Error(`B3-sales: fixture ${id} does not add up`)
      created.set(index, {
        id,
        version: 1,
        companyId,
        number: seed.docStatus === "draft" ? null : issue(companyId, date),
        date,
        validUntil: addDays(date, VALID_DAYS),
        clientId: client.id,
        clientName: client.name,
        ...body,
        ...sums,
        status: seed.status,
        docStatus: seed.docStatus,
      })
    }
    SEEDS.forEach((seed, index) => {
      const quote = created.get(index)
      const copy = created.get(index + 1)
      if (!seed.amended || !quote || !copy) return
      quote.amendedBy = copy.id
      copy.amendedFrom = quote.id
    })
    quotes.push(
      ...SEEDS.map((_, index) => created.get(index)).filter(
        (quote): quote is QuoteCard => quote !== undefined,
      ),
    )
  }
  return { quotes, counters: [...counters.values()] }
}
