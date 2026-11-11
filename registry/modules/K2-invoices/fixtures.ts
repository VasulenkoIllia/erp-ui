/**
 * Демо-дані модуля K2 українською й англійською (SPEC §17) — вони ж шаблон даних для першого запуску
 * (PF12). Назви товарів, клієнтів і реквізити — дані, а не рядки інтерфейсу: мова даних (`locale`) окремо
 * від мови інтерфейсу (SPEC §11). Дати — від сьогодні: виставлений рахунок із минулою «Сплатити до»
 * показує «Прострочено». Засів має всі статуси модуля, виправлену копію скасованого, сторнований рахунок
 * зі сторно й великий рахунок із розділами; старші рахунки лежать у закритому періоді демо (PF13), якщо
 * його закрито. Номери — за шаблоном серії й лічильником, який засів уже видав (`counters`). Три рахунки у
 * валюті (ADR-0071): чернетка в доларах, виставлений сьогодні в євро й чернетка в злотих на дату, на яку
 * курсу ще немає; суму в базовій валюті вони мають лише з `rates`.
 */
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import type { DocumentState } from "@/lib/document-lifecycle"
import { partyDetailsFrom, type PartyDetails } from "@/lib/document-parties"
import { documentSumsOf } from "@/lib/document-sums"
import {
  fixtureDocumentLines,
  type DocumentFixtureDictionaries,
} from "@/lib/mock-documents"
import { formatDocumentNumber } from "@/lib/numbering"

import {
  INVOICE_DUE_DAYS,
  INVOICES,
  type InvoiceCard,
  type InvoiceStatus,
} from "./contract"
import { invoiceExchange, type InvoiceMockRates } from "./mock-exchange"
import type { InvoiceMockParties } from "./mock-links"

export type FixtureLocale = "uk" | "en"

/** Клієнт рахунків: запис ресурсу клієнтів проекту й реквізити покупця з його картки. */
export interface InvoiceFixtureClient {
  readonly id: string
  readonly name: string
  readonly party?: Partial<PartyDetails>
}

/** Знімки довідників компанії для рядків (A6): одиниця штук і годин, ставка ПДВ. */
export type InvoiceFixtureDictionaries = DocumentFixtureDictionaries

export interface InvoiceFixtureOptions {
  readonly locale?: FixtureLocale
  /** Компанії з рахунками; за замовчуванням одна спільна (`null`). */
  readonly companies?: readonly (string | null)[]
  /** Клієнти компанії з ресурсу клієнтів проекту; за замовчуванням — свої модуля з реквізитами. */
  readonly clients?: (
    companyId: string | null,
  ) => readonly InvoiceFixtureClient[]
  /** Постачальник — реквізити компанії (`partyFromCompany` її профілю); за замовчуванням — свій модуля. */
  readonly supplier?: (companyId: string | null) => Partial<PartyDetails>
  /** Знімки одиниць і податку з довідників компанії; за замовчуванням — свої без `id` довідника. */
  readonly dictionaries?: (
    companyId: string | null,
  ) => InvoiceFixtureDictionaries
  /** Сьогодні: від нього дати рахунків. Тести ставлять сталу дату. */
  readonly today?: CalendarDate
  /**
   * Курси компанії (ADR-0071): базова валюта й курс на дату (`createCompanyMocks(...).rateOn` модуля A1).
   * Без них рахунок у валюті не має суми в базовій валюті.
   */
  readonly rates?: InvoiceMockRates
}

/** Скільки номерів серії видав засів: компанія, рік дати рахунку, останнє значення. */
export interface InvoiceFixtureCounter {
  readonly resource: string
  readonly companyId: string | null
  readonly year: number
  readonly value: number
}

export interface InvoiceFixtures {
  readonly invoices: InvoiceCard[]
  readonly counters: InvoiceFixtureCounter[]
}

/** Шаблон серії рахунків (ADR-0058) мовою даних: «РХ-2026-0001». */
export const INVOICE_NUMBER_TEMPLATE: Record<FixtureLocale, string> = {
  uk: "РХ-{YYYY}-{####}",
  en: "INV-{YYYY}-{####}",
}

const CURRENCY = "UAH"
/** Ціни рахунків у валюті засіву — у стільки разів менші за гривневі. */
const FOREIGN_PRICE_DIVISOR = 40

/** Постачальник засіву без профілю компанії: правильні тестові ЄДРПОУ, ІПН і IBAN — QR-код читається. */
const DEFAULT_SUPPLIER: Record<FixtureLocale, Partial<PartyDetails>> = {
  uk: {
    kind: "legal",
    name: "ТОВ «Кавовий двір»",
    code: "41726300",
    vatIpn: "417263050262",
    iban: "UA113052990000026007315822941",
    bankName: "АТ «Демо Банк»",
    address: "01001, м. Київ, вул. Кавова, 7",
    signerPosition: "Директор",
    signerName: "Мельник Ірина Петрівна",
  },
  en: {
    kind: "legal",
    name: "Coffee Yard LLC",
    code: "41726300",
    vatIpn: "417263050262",
    iban: "UA113052990000026007315822941",
    bankName: "Demo Bank JSC",
    address: "7 Kavova St, Kyiv, 01001",
    signerPosition: "Director",
    signerName: "Iryna Melnyk",
  },
}

const DEFAULT_CLIENTS: Record<FixtureLocale, readonly InvoiceFixtureClient[]> =
  {
    uk: [
      {
        id: "client-1",
        name: "ТОВ «Зелена долина»",
        party: { code: "38514726" },
      },
      {
        id: "client-2",
        name: "ФОП Ткаченко Олег Васильович",
        party: { kind: "fop", code: "3014578920" },
      },
      {
        id: "client-3",
        name: "ТОВ «Сонячний берег»",
        party: { code: "21903640" },
      },
      { id: "client-4", name: "ПП «Будмайстер»", party: { code: "44027194" } },
    ],
    en: [
      { id: "client-1", name: "Green Valley LLC", party: { code: "38514726" } },
      {
        id: "client-2",
        name: "Oleh Tkachenko, sole trader",
        party: { kind: "fop", code: "3014578920" },
      },
      { id: "client-3", name: "Sunny Shore LLC", party: { code: "21903640" } },
      { id: "client-4", name: "Buildmaster PE", party: { code: "44027194" } },
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
  {
    uk: "Кава в зернах, 1 кг",
    en: "Coffee beans, 1 kg",
    price: "720.50",
    hours: false,
  },
  {
    uk: "Сервісне обслуговування",
    en: "Maintenance service",
    price: "950",
    hours: true,
  },
  { uk: "Фільтр для води", en: "Water filter", price: "1250", hours: false },
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

const DEFAULT_DICTIONARIES: Record<FixtureLocale, InvoiceFixtureDictionaries> =
  {
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
  readonly status: InvoiceStatus
  readonly docStatus: DocumentState
  /** Днів тому від сьогодні. */
  readonly age: number
  /** Рядків товарів; від 12 у редакторі з'являються пошук і «До підсумків». */
  readonly items: number
  readonly sections?: boolean
  readonly discountPercent?: number
  /** Скасований із виправленою копією — наступний засів (`amendedBy`). */
  readonly amended?: boolean
  /** Сторнований: наступний засів — його сторно (`reversedBy`). */
  readonly reversed?: boolean
  /** Валюта рахунку, якщо не гривня (ADR-0071). */
  readonly currency?: string
  /** Клієнт за його місцем у списку клієнтів, якщо не за місцем засіву: другий рахунок того самого клієнта. */
  readonly client?: number
}

/**
 * Засів рахунків компанії: чернетки (одна велика з розділами), виставлені (свіжий, прострочений, зі
 * знижкою, давній у закритому періоді), скасований із виправленою копією, сторнований зі сторно; у кінці —
 * рахунки у валюті й другий рахунок клієнта простроченого (одна оплата на два рахунки, ADR-0073), щоб номери
 * старших лишились тими самими.
 */
const SEEDS: readonly Seed[] = [
  { status: "draft", docStatus: "draft", age: 0, items: 3 },
  { status: "draft", docStatus: "draft", age: 2, items: 14, sections: true },
  { status: "issued", docStatus: "submitted", age: 1, items: 4 },
  { status: "issued", docStatus: "submitted", age: 12, items: 2 },
  {
    status: "issued",
    docStatus: "submitted",
    age: 3,
    items: 5,
    discountPercent: 5,
  },
  {
    status: "cancelled",
    docStatus: "cancelled",
    age: 9,
    items: 3,
    amended: true,
  },
  { status: "draft", docStatus: "draft", age: 8, items: 3 },
  {
    status: "reversed",
    docStatus: "submitted",
    age: 40,
    items: 2,
    reversed: true,
  },
  { status: "reversal", docStatus: "submitted", age: 4, items: 2 },
  { status: "issued", docStatus: "submitted", age: 45, items: 3 },
  { status: "draft", docStatus: "draft", age: 1, items: 2, currency: "USD" },
  {
    status: "issued",
    docStatus: "submitted",
    age: 0,
    items: 3,
    currency: "EUR",
  },
  // Курси злотих у таблиці демо — за останні 10 днів: на цю дату курсу немає.
  { status: "draft", docStatus: "draft", age: 12, items: 2, currency: "PLN" },
  { status: "issued", docStatus: "submitted", age: 0, items: 2, client: 3 },
]

const at = <T>(list: readonly T[], index: number): T => {
  const value = list[index % list.length]
  if (value === undefined) throw new Error("K2-invoices: empty fixture list")
  return value
}

/** Компанія засіву: клієнти, постачальник, знімки довідників і видача номерів. */
interface SeedContext {
  readonly companyId: string | null
  readonly owner: string
  readonly locale: FixtureLocale
  readonly today: CalendarDate
  readonly clients: readonly InvoiceFixtureClient[]
  readonly supplier: PartyDetails
  readonly snapshots: InvoiceFixtureDictionaries
  readonly issue: (date: CalendarDate) => string | null
  readonly rates: InvoiceMockRates | undefined
}

/** Засіяний рахунок `index` компанії: копія й сторно беруть клієнта, рядки й знижку першого. */
function seedInvoice(
  seed: Seed,
  index: number,
  context: SeedContext,
): InvoiceCard {
  const id = `inv-${context.owner}-${String(index + 1).padStart(2, "0")}`
  const date = addDays(context.today, -seed.age)
  const previous = SEEDS[index - 1]
  // Виправлена копія й сторно — для того самого клієнта й з тими самими рядками, що перший.
  const sourceIndex =
    previous?.amended || previous?.reversed ? index - 1 : index
  const source = at(SEEDS, sourceIndex)
  const client = at(context.clients, source.client ?? sourceIndex)
  const currency = source.currency ?? CURRENCY
  const priceOf = (price: string) =>
    currency === CURRENCY
      ? price
      : (Number(price) / FOREIGN_PRICE_DIVISOR).toFixed(2)
  const body = {
    currency,
    lines: fixtureDocumentLines({
      prefix: id,
      count: source.items,
      offset: sourceIndex,
      items: ITEMS.map((item) => ({
        ...item,
        name: item[context.locale],
        price: priceOf(item.price),
      })),
      dictionaries: context.snapshots,
      sections: source.sections ? SECTION_TITLES[context.locale] : undefined,
    }),
    discountPercent: source.discountPercent ?? 0,
    discountAmount: 0,
  }
  const sums = documentSumsOf(body)
  if (!sums) throw new Error(`K2-invoices: fixture ${id} does not add up`)
  // Сторно — з мінусом у шапці: рядки й підсумки ті самі, що в першого.
  const total = seed.status === "reversal" ? -sums.total : sums.total
  return {
    id,
    version: 1,
    companyId: context.companyId,
    number: seed.docStatus === "draft" ? null : context.issue(date),
    date,
    dueDate: addDays(date, INVOICE_DUE_DAYS),
    clientId: client.id,
    clientName: client.name,
    supplier: context.supplier,
    buyer: partyDetailsFrom({ name: client.name, ...client.party }),
    orderId: null,
    ...body,
    ...sums,
    total,
    exchange: invoiceExchange(
      { companyId: context.companyId, currency, date, total },
      context.rates,
    ),
    status: seed.status,
    docStatus: seed.docStatus,
  }
}

/**
 * Рахунки компанії: від старших (номери зростають разом із датою, як їх видавав би сервер), у порядку
 * засіву; пари виправленої копії й сторно — зв'язками в обидва боки.
 */
function seedInvoices(context: SeedContext): InvoiceCard[] {
  const created = new Map<number, InvoiceCard>()
  SEEDS.map((seed, index) => ({ seed, index }))
    .sort((a, b) => b.seed.age - a.seed.age)
    .forEach(({ seed, index }) => {
      created.set(index, seedInvoice(seed, index, context))
    })
  SEEDS.forEach((seed, index) => {
    const original = created.get(index)
    const next = created.get(index + 1)
    if (!original || !next) return
    if (seed.amended) {
      original.amendedBy = next.id
      next.amendedFrom = original.id
    }
    if (seed.reversed) {
      original.reversedBy = next.id
      next.reversalOf = original.id
    }
  })
  return SEEDS.map((_, index) => created.get(index)).filter(
    (invoice) => invoice !== undefined,
  )
}

/**
 * Сторони нового рахунку в моках (рахунок із замовлення): постачальник — як у засіві компанії, покупець —
 * реквізити клієнта з `clients` за його `id`.
 */
export function invoiceFixtureParties({
  locale = "uk",
  clients,
  supplier,
}: InvoiceFixtureOptions = {}): InvoiceMockParties {
  return {
    supplier: (companyId) => supplier?.(companyId) ?? DEFAULT_SUPPLIER[locale],
    buyer: (companyId, client) =>
      (clients?.(companyId) ?? DEFAULT_CLIENTS[locale]).find(
        (candidate) => candidate.id === client.id,
      )?.party ?? {},
  }
}

export function createInvoiceFixtures({
  locale = "uk",
  companies = [null],
  clients,
  supplier,
  dictionaries,
  today = todayIn(),
  rates,
}: InvoiceFixtureOptions = {}): InvoiceFixtures {
  const invoices: InvoiceCard[] = []
  const counters = new Map<string, InvoiceFixtureCounter>()
  /** Наступний номер серії в компанії за роком дати: засів іде від старших до новіших. */
  const issueFor = (companyId: string | null) => (date: CalendarDate) => {
    const year = Number(date.slice(0, 4))
    const key = `${companyId ?? "-"}:${String(year)}`
    const value = (counters.get(key)?.value ?? 0) + 1
    counters.set(key, { resource: INVOICES, companyId, year, value })
    return formatDocumentNumber(INVOICE_NUMBER_TEMPLATE[locale], {
      date,
      value,
    })
  }
  for (const companyId of companies) {
    invoices.push(
      ...seedInvoices({
        companyId,
        owner: companyId ?? "shared",
        locale,
        today,
        clients: clients?.(companyId) ?? DEFAULT_CLIENTS[locale],
        supplier: partyDetailsFrom(
          supplier?.(companyId) ?? DEFAULT_SUPPLIER[locale],
        ),
        snapshots: dictionaries?.(companyId) ?? DEFAULT_DICTIONARIES[locale],
        issue: issueFor(companyId),
        rates,
      }),
    )
  }
  return { invoices, counters: [...counters.values()] }
}
