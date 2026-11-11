import { lineSumOf } from "@/registry/erp/document-line-fields"
import {
  lineTotalsOf,
  sectionSums,
} from "@/registry/erp/document-lines-preview"
import {
  previewTotals,
  totalsRowsOf,
} from "@/registry/erp/document-lines-totals"
import {
  amountInWords,
  hasCurrencyWords,
  type CurrencyWords,
} from "@/registry/lib/amount-in-words"
import type { DocumentState } from "@/registry/lib/document-lifecycle"
import {
  itemLinesOf,
  type DocumentBodyLine,
  type DocumentLine,
  type SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import {
  NO_DISCOUNT,
  type TotalsDiscount,
} from "@/registry/lib/document-totals"
import {
  currencyDigits,
  formatDate,
  formatDecimal,
  formatMoney,
  formatPercent,
  formatPrice,
} from "@/registry/lib/format"
import { usePrintSheet } from "@/registry/lib/print"
import { cn } from "@/registry/lib/utils"

/**
 * Документ на аркуші (PF08, ADR-0062): назва з номером і датою, позначка чернетки й скасованого,
 * рядки з розділами й нотатками, підсумки за ставками й сума прописом — мовою аркуша
 * (`erp/print-preview`). Суми рядків і підсумки — сервера (`savedDocumentBodyLineSchema`,
 * `documentTotalsSchema`), без них — та сама `lib/document-totals`; сума розділу — `sectionSums`
 * редактора (ADR-0060), тож папір і картка сходяться.
 */

const WATERMARKED = ["draft", "cancelled"] as const satisfies DocumentState[]
type Watermarked = (typeof WATERMARKED)[number]
const isWatermarked = (
  state: DocumentState | null | undefined,
): state is Watermarked => WATERMARKED.some((value) => value === state)

/**
 * Назва документа: «Рахунок на оплату № 2026-0001 від 4 листопада 2026». Номер дає проведення
 * (ADR-0058): у чернетки — «(без номера)», а на аркуші — позначка «Чернетка» (рішення власника 04.11.2026).
 */
export function PrintDocumentTitle({
  title,
  number,
  date,
  dueDate,
  docStatus,
}: {
  /** Вид документа мовою аркуша: «Рахунок на оплату». */
  title: string
  /** Номер проведеного документа; немає — «(без номера)». */
  number?: string | null
  /** Календарна дата документа, `YYYY-MM-DD`. */
  date: string
  /** «Сплатити до» чи інший строк, `YYYY-MM-DD`. */
  dueDate?: string | null
  docStatus?: DocumentState | null
}) {
  const { t, locale } = usePrintSheet()
  const day = (value: string) => formatDate(value, "long", locale)
  return (
    <div data-slot="print-document-title" className="grid gap-1 text-center">
      <h2 className="text-[14pt] font-semibold">
        {title}{" "}
        {number
          ? t("print.sheet.number", { number })
          : t("print.sheet.noNumber")}{" "}
        {t("print.sheet.date", { date: day(date) })}
      </h2>
      {dueDate ? (
        <p>{t("print.sheet.dueDate", { date: day(dueDate) })}</p>
      ) : null}
      {isWatermarked(docStatus) ? (
        <p className="sr-only">{t(`print.sheet.state.${docStatus}`)}</p>
      ) : null}
    </div>
  )
}

/**
 * Позначка навскіс на чернетці й скасованому документі; проведений друкується без неї. На екрані — на
 * першій сторінці аркуша, на папері — на кожній (`position: fixed` друкується на кожній сторінці).
 * Стан документа озвучує `PrintDocumentTitle`, тож позначка прихована від скрінрідера.
 */
export function PrintWatermark({
  docStatus,
}: {
  docStatus?: DocumentState | null
}) {
  const { t } = usePrintSheet()
  if (!isWatermarked(docStatus)) return null
  return (
    <div
      aria-hidden
      data-slot="print-watermark"
      data-label={t(`print.sheet.watermark.${docStatus}`)}
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex h-[297mm] items-center justify-center overflow-hidden text-[64pt] font-bold tracking-widest text-muted-foreground uppercase opacity-25 select-none before:-rotate-30 before:content-[attr(data-label)] print:fixed print:inset-0 print:h-auto"
    />
  )
}

export interface PrintDocumentLinesProps {
  lines: readonly DocumentBodyLine[]
  currency: string
}

const hasLineDiscount = (line: DocumentLine) =>
  line.discountPercent > 0 || line.discountAmount > 0

const taxKey = (line: DocumentLine) =>
  line.tax
    ? `${line.tax.id}|${String(line.tax.rate)}|${String(line.tax.included)}`
    : ""

/**
 * Таблиця рядків: №, назва, кількість, одиниця, ціна, знижка (є в рядках), податок (ставок більше
 * однієї), сума. Розділ — рядок на всю ширину з сумою своїх рядків, нотатка — текст на всю ширину.
 * Шапка повторюється на кожній сторінці, рядок між сторінками не розривається (`tokens/base.css`).
 */
export function PrintDocumentLines({
  lines,
  currency,
}: PrintDocumentLinesProps) {
  const { t, locale } = usePrintSheet()
  const digits = currencyDigits(currency)
  const items = itemLinesOf(lines)
  const hasDiscount = items.some(hasLineDiscount)
  const hasTax = new Set(items.map(taxKey)).size > 1
  const sums = sectionSums(lines, digits, true)
  const money = (amount: number) => formatMoney({ amount, currency }, locale)
  const columns = 6 + Number(hasDiscount) + Number(hasTax)
  // Номер — лише рядкам товарів, наскрізно через розділи.
  const positions = new Map(items.map((line, index) => [line.id, index + 1]))
  return (
    <table
      data-slot="print-document-lines"
      className="w-full border-collapse text-[9pt] [&_td]:border [&_td]:border-border [&_td]:px-[1.5mm] [&_td]:py-[1mm] [&_th]:border [&_th]:border-border [&_th]:px-[1.5mm] [&_th]:py-[1mm]"
    >
      <caption className="sr-only">{t("documentLines.label")}</caption>
      <thead>
        <tr className="bg-muted text-start">
          <th scope="col" className="w-[8mm] text-end">
            {t("print.sheet.position")}
          </th>
          <th scope="col" className="text-start">
            {t("print.sheet.name")}
          </th>
          <th scope="col" className="text-end">
            {t("print.sheet.quantity")}
          </th>
          <th scope="col" className="text-start">
            {t("print.sheet.unit")}
          </th>
          <th scope="col" className="text-end">
            {t("print.sheet.price")}
          </th>
          {hasDiscount ? (
            <th scope="col" className="text-end">
              {t("print.sheet.discount")}
            </th>
          ) : null}
          {hasTax ? (
            <th scope="col" className="text-start">
              {t("print.sheet.tax")}
            </th>
          ) : null}
          <th scope="col" className="text-end">
            {t("print.sheet.sum")}
          </th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {lines.length === 0 ? (
          <tr>
            <td colSpan={columns} className="text-center text-muted-foreground">
              {t("print.sheet.empty")}
            </td>
          </tr>
        ) : null}
        {lines.map((line) => {
          if (line.kind === "section") {
            const sum = sums.get(line.id)
            return (
              <tr key={line.id} data-kind="section" className="font-semibold">
                <th scope="row" colSpan={columns - 1} className="text-start">
                  {line.title}
                </th>
                <td className="text-end">
                  {sum === undefined ? null : money(sum)}
                </td>
              </tr>
            )
          }
          if (line.kind === "note")
            return (
              <tr key={line.id} data-kind="note">
                <td colSpan={columns} className="whitespace-pre-line italic">
                  {line.text}
                </td>
              </tr>
            )
          // Суми сервера, якщо рядок збережений (ADR-0056, п. 5), інакше — порахована з рядка.
          const totals = lineTotalsOf(line, digits, true)
          return (
            <tr key={line.id} data-kind="item">
              <td className="text-end">{positions.get(line.id)}</td>
              <td className="break-words">{line.name}</td>
              <td className="text-end">
                {formatDecimal(line.quantity, locale)}
              </td>
              <td>{line.unit?.name}</td>
              <td className="text-end">
                {formatPrice(line.price, currency, locale)}
              </td>
              {hasDiscount ? (
                <td className="text-end">
                  {line.discountPercent > 0
                    ? formatPercent(line.discountPercent / 100, locale, {
                        maximumFractionDigits: 2,
                      })
                    : line.discountAmount > 0
                      ? money(line.discountAmount)
                      : null}
                </td>
              ) : null}
              {hasTax ? (
                <td>{line.tax?.name ?? t("documentLines.noTax")}</td>
              ) : null}
              <td className="text-end">
                {totals ? money(lineSumOf(totals)) : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export interface PrintDocumentTotalsProps {
  lines: readonly DocumentBodyLine[]
  currency: string
  /** Підсумки сервера збереженого документа; без них — підсумки рядків, як у редакторі (`previewTotals`). */
  totals?: SavedDocumentTotals
  /** Знижка на документ, якщо підсумки рахуються тут. */
  discount?: TotalsDiscount
  /** Слова інших валют для суми прописом (`lib/amount-in-words`); без слів сума прописом не друкується. */
  currencies?: Readonly<Record<string, CurrencyWords>>
  /**
   * Рядки під «Разом» мовою документа: «Кредит-ноти», «Оплачено», «До сплати» рахунку (ADR-0074). Сума
   * прописом лишається від «Разом».
   */
  after?: readonly PrintTotalsRow[]
}

/** Рядок підсумків аркуша: підпис мовою документа й сума в мінорних одиницях валюти документа. */
export interface PrintTotalsRow {
  readonly key: string
  readonly label: string
  readonly amount: number
  /** Виділити, як «Разом». */
  readonly isTotal?: boolean
}

/**
 * Підсумки під рядками, як у редакторі: сума до знижок і знижки, якщо вони є, без податку й кожна
 * ставка, разом, рядки `after`; далі «Всього на суму» прописом.
 */
export function PrintDocumentTotals({
  lines,
  currency,
  totals,
  discount = NO_DISCOUNT,
  currencies,
  after = [],
}: PrintDocumentTotalsProps) {
  const { t, locale, language } = usePrintSheet()
  const items = itemLinesOf(lines)
  const resolved =
    totals ?? previewTotals(items, currencyDigits(currency), discount).totals
  if (!resolved) return null
  const money = (amount: number) => formatMoney({ amount, currency }, locale)
  const rows = totalsRowsOf(resolved, items, t)
  const hasWords = hasCurrencyWords(currency, language, currencies)
  return (
    <div
      data-slot="print-document-totals"
      data-print="avoid-break"
      className="grid gap-[3mm]"
    >
      <dl className="ms-auto grid w-[85mm] grid-cols-[1fr_auto] gap-x-[4mm] gap-y-0.5 tabular-nums">
        {rows.map((row) => (
          <TotalsRow key={row.key} label={row.label} value={money(row.value)} />
        ))}
        <TotalsRow
          label={t("documentLines.totals.total")}
          value={money(resolved.total)}
          isTotal
        />
        {after.map((row) => (
          <TotalsRow
            key={row.key}
            label={row.label}
            value={money(row.amount)}
            isTotal={row.isTotal}
          />
        ))}
      </dl>
      {hasWords ? (
        <p className="font-medium">
          {t("print.sheet.inWords", {
            amount: amountInWords(
              { amount: resolved.total, currency },
              language,
              { currencies },
            ),
          })}
        </p>
      ) : null}
    </div>
  )
}

function TotalsRow({
  label,
  value,
  isTotal = false,
}: {
  label: string
  value: string
  isTotal?: boolean
}) {
  return (
    <div className={cn("contents", isTotal && "font-semibold")}>
      <dt className="text-end">{label}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  )
}
