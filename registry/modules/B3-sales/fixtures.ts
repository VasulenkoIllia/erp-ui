/**
 * Демо-дані модуля B3 українською й англійською (SPEC §17) — вони ж шаблон даних для першого запуску
 * (PF12). Назви товарів і клієнтів — дані, а не рядки інтерфейсу: мова даних (`locale`) окремо від мови
 * інтерфейсу (SPEC §11). Дати — від сьогодні: надіслана пропозиція з минулим строком показує «Термін
 * минув», підтверджене замовлення з минулою «Виконати до» — «Прострочено». Номери — за шаблоном серії
 * ресурсу й лічильником, який засів уже видав (`counters`).
 */
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import type { DocumentState } from "@/lib/document-lifecycle"
import type {
  DocumentBodyLine,
  DocumentLineTax,
  DocumentLineUnit,
} from "@/lib/document-lines"
import { formatDocumentNumber } from "@/lib/numbering"

import {
  ORDERS,
  QUOTES,
  type OrderCard,
  type OrderStatus,
  type QuoteCard,
  type QuoteStatus,
  type SalesDocument,
  type SalesDocumentDetail,
} from "./contract"
import { salesSumsOf } from "./sales-totals"

export type FixtureLocale = "uk" | "en"

/** Клієнт документів: запис ресурсу клієнтів проекту (`organizations` модуля B1). */
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
  /** Компанії з документами; за замовчуванням одна спільна (`null`). */
  readonly companies?: readonly (string | null)[]
  /** Клієнти компанії з ресурсу клієнтів проекту; за замовчуванням — свої назви модуля. */
  readonly clients?: (companyId: string | null) => readonly SalesFixtureClient[]
  /** Знімки одиниць і податку з довідників компанії; за замовчуванням — свої без `id` довідника. */
  readonly dictionaries?: (companyId: string | null) => SalesFixtureDictionaries
  /** Сьогодні: від нього дати документів. Тести ставлять сталу дату. */
  readonly today?: CalendarDate
}

/** Скільки номерів серії ресурсу видав засів: компанія, рік дати документа, останнє значення. */
export interface SalesFixtureCounter {
  readonly resource: string
  readonly companyId: string | null
  readonly year: number
  readonly value: number
}

export interface SalesFixtures {
  readonly quotes: QuoteCard[]
  readonly orders: OrderCard[]
  /** Лічильники серій `quotes` і `orders`. */
  readonly counters: SalesFixtureCounter[]
}

/** Шаблон серії пропозицій (ADR-0058) мовою даних: «КП-2026-0001». */
export const QUOTE_NUMBER_TEMPLATE: Record<FixtureLocale, string> = {
  uk: "КП-{YYYY}-{####}",
  en: "QT-{YYYY}-{####}",
}

/** Шаблон серії замовлень мовою даних: «ЗМ-2026-0001». */
export const ORDER_NUMBER_TEMPLATE: Record<FixtureLocale, string> = {
  uk: "ЗМ-{YYYY}-{####}",
  en: "SO-{YYYY}-{####}",
}

const CURRENCY = "UAH"
/** Строк пропозиції в засіві: два тижні від дати. */
const VALID_DAYS = 14
/** «Виконати до» замовлення в засіві: тиждень від дати. */
const DUE_DAYS = 7

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

interface Seed<S extends string> {
  readonly status: S
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

/** Засів пропозицій компанії: усі статуси модуля, минулий строк, виправлена копія, великий документ. */
const QUOTE_SEEDS: readonly Seed<QuoteStatus>[] = [
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

/** Засів замовлень компанії: усі статуси модуля, прострочене, виправлена копія, великий документ. */
const ORDER_SEEDS: readonly Seed<OrderStatus>[] = [
  { status: "draft", docStatus: "draft", age: 0, items: 3 },
  { status: "confirmed", docStatus: "submitted", age: 3, items: 4 },
  { status: "confirmed", docStatus: "submitted", age: 12, items: 2 },
  {
    status: "completed",
    docStatus: "submitted",
    age: 18,
    items: 5,
    discountPercent: 5,
  },
  {
    status: "cancelled",
    docStatus: "cancelled",
    age: 22,
    items: 3,
    amended: true,
  },
  { status: "draft", docStatus: "draft", age: 5, items: 3 },
  {
    status: "confirmed",
    docStatus: "submitted",
    age: 1,
    items: 13,
    sections: true,
  },
  { status: "completed", docStatus: "submitted", age: 30, items: 2 },
]

const at = <T>(list: readonly T[], index: number): T => {
  const value = list[index % list.length]
  if (value === undefined) throw new Error("B3-sales: empty fixture list")
  return value
}

/** Рядки засіву: товари по черзі, з розділами — заголовок перед кожною групою й нотатка наприкінці. */
function linesOf(
  seed: Seed<string>,
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

/** Як засіяти документи одного ресурсу: засів, префікс `id`, шаблон номера й друга дата. */
interface DocumentSeedSpec<S extends string, Due extends string> {
  readonly resource: string
  readonly seeds: readonly Seed<S>[]
  readonly prefix: string
  readonly template: Record<FixtureLocale, string>
  /** Друга дата документа від його дати: `validUntil` пропозиції, `dueDate` замовлення. */
  readonly due: (date: CalendarDate) => Record<Due, CalendarDate>
}

/** Засіяний документ з другою датою `Due`. */
type SeededDocument<Due extends string> = SalesDocument &
  SalesDocumentDetail &
  Record<Due, CalendarDate>

/** Компанія засіву: її клієнти, знімки довідників і видача номерів серій. */
interface SeedContext {
  readonly companyId: string | null
  readonly owner: string
  readonly locale: FixtureLocale
  readonly today: CalendarDate
  readonly names: readonly SalesFixtureClient[]
  readonly snapshots: SalesFixtureDictionaries
  /** Номер серії ресурсу; `null` — шаблон не дав номера. */
  readonly issue: (
    resource: string,
    template: string,
    date: CalendarDate,
  ) => string | null
}

/**
 * Документи одного ресурсу в компанії: від старших (номери зростають разом із датою, як їх видавав би
 * сервер), у порядку засіву; скасований з `amended` і наступний — пара виправленої копії.
 */
function seedDocuments<S extends string, Due extends string>(
  spec: DocumentSeedSpec<S, Due>,
  context: SeedContext,
): SeededDocument<Due>[] {
  const order = spec.seeds
    .map((seed, index) => ({ seed, index }))
    .sort((a, b) => b.seed.age - a.seed.age)
  const created = new Map<number, SeededDocument<Due>>()
  for (const { seed, index } of order) {
    const id = `${spec.prefix}-${context.owner}-${String(index + 1).padStart(2, "0")}`
    const date = addDays(context.today, -seed.age)
    // Виправлена копія — для того самого клієнта, що й скасований документ.
    const client = at(
      context.names,
      spec.seeds[index - 1]?.amended ? index - 1 : index,
    )
    const body = {
      currency: CURRENCY,
      lines: linesOf(seed, index, context.locale, context.snapshots, id),
      discountPercent: seed.discountPercent ?? 0,
      discountAmount: 0,
    }
    const sums = salesSumsOf(body)
    if (!sums) throw new Error(`B3-sales: fixture ${id} does not add up`)
    created.set(index, {
      id,
      version: 1,
      companyId: context.companyId,
      number:
        seed.docStatus === "draft"
          ? null
          : context.issue(spec.resource, spec.template[context.locale], date),
      date,
      ...spec.due(date),
      clientId: client.id,
      clientName: client.name,
      ...body,
      ...sums,
      status: seed.status,
      docStatus: seed.docStatus,
    })
  }
  spec.seeds.forEach((seed, index) => {
    const original = created.get(index)
    const copy = created.get(index + 1)
    if (!seed.amended || !original || !copy) return
    original.amendedBy = copy.id
    copy.amendedFrom = original.id
  })
  return spec.seeds
    .map((_, index) => created.get(index))
    .filter((document) => document !== undefined)
}

const QUOTE_SPEC: DocumentSeedSpec<QuoteStatus, "validUntil"> = {
  resource: QUOTES,
  seeds: QUOTE_SEEDS,
  prefix: "qt",
  template: QUOTE_NUMBER_TEMPLATE,
  due: (date) => ({ validUntil: addDays(date, VALID_DAYS) }),
}

const ORDER_SPEC: DocumentSeedSpec<OrderStatus, "dueDate"> = {
  resource: ORDERS,
  seeds: ORDER_SEEDS,
  prefix: "so",
  template: ORDER_NUMBER_TEMPLATE,
  due: (date) => ({ dueDate: addDays(date, DUE_DAYS) }),
}

export function createSalesFixtures({
  locale = "uk",
  companies = [null],
  clients,
  dictionaries,
  today = todayIn(),
}: SalesFixtureOptions = {}): SalesFixtures {
  const quotes: QuoteCard[] = []
  const orders: OrderCard[] = []
  const counters = new Map<string, SalesFixtureCounter>()
  /** Наступний номер серії ресурсу в компанії за роком дати: засів іде від старших до новіших. */
  const issueFor =
    (companyId: string | null) =>
    (resource: string, template: string, date: CalendarDate) => {
      const year = Number(date.slice(0, 4))
      const key = `${resource}:${companyId ?? "-"}:${String(year)}`
      const value = (counters.get(key)?.value ?? 0) + 1
      counters.set(key, { resource, companyId, year, value })
      return formatDocumentNumber(template, { date, value })
    }
  for (const companyId of companies) {
    const context: SeedContext = {
      companyId,
      owner: companyId ?? "shared",
      locale,
      today,
      names:
        clients?.(companyId) ??
        CLIENT_NAMES[locale].map((name, index) => ({
          id: `client-${String(index + 1)}`,
          name,
        })),
      snapshots: dictionaries?.(companyId) ?? DEFAULT_DICTIONARIES[locale],
      issue: issueFor(companyId),
    }
    quotes.push(...seedDocuments(QUOTE_SPEC, context))
    orders.push(...seedDocuments(ORDER_SPEC, context))
  }
  return { quotes, orders, counters: [...counters.values()] }
}
