import {
  PrintDocumentLines,
  PrintDocumentTitle,
  PrintDocumentTotals,
  PrintWatermark,
  type PrintTotalsRow,
} from "@/components/erp/print-document"
import {
  partyRequisiteLines,
  PrintCompanyHeader,
  PrintParties,
  PrintSignatures,
} from "@/components/erp/print-requisites"
import { QrCode } from "@/components/erp/qr-code"
import type { CompanyProfile } from "@/lib/company"
import { formatDate } from "@/lib/format"
import type { Language } from "@/lib/i18n"
import { usePrintSheet } from "@/lib/print"

import {
  REVERSAL_STATUS,
  type Invoice,
  type InvoiceDetail,
  type K2Document,
} from "../contract"
import { invoicePaymentQr, invoiceSettlementRows } from "./invoice-payment"

/** Тексти аркуша мовою документа (дані модуля, а не рядки інтерфейсу, ADR-0062). */
const SHEET = {
  title: { uk: "Рахунок на оплату", en: "Invoice" },
  reversal: { uk: "Сторно рахунку", en: "Invoice reversal" },
  due: {
    uk: (date: string) => `Сплатити до ${date}`,
    en: (date: string) => `Payment due by ${date}`,
  },
  qr: {
    uk: "Скануйте QR-код у застосунку свого банку: отримувач, сума й призначення заповняться самі.",
    en: "Scan the QR code in your banking app: the payee, amount and purpose are filled in automatically.",
  },
  qrLabel: {
    uk: (number: string) => `QR-код оплати рахунку ${number}`,
    en: (number: string) => `Payment QR code of invoice ${number}`,
  },
  settlement: {
    uk: {
      credited: "Кредит-ноти",
      paid: "Оплачено",
      refunded: "Повернено",
      debt: "До сплати",
      overpaid: "Переплата",
    },
    en: {
      credited: "Credit notes",
      paid: "Paid",
      refunded: "Refunded",
      debt: "Amount due",
      overpaid: "Overpaid",
    },
  },
} as const satisfies Record<string, Readonly<Record<Language, unknown>>>

/**
 * Рядки «Кредит-ноти», «Оплачено», «Повернено», «До сплати» під «Разом» мовою документа; борг виділено, як
 * «Разом».
 */
const settlementRows = (
  invoice: Invoice,
  totals: InvoiceDetail["totals"],
  language: Language,
): PrintTotalsRow[] =>
  invoiceSettlementRows(invoice, totals).map((row) => ({
    key: row.key,
    label: SHEET.settlement[language][row.key],
    amount: row.amount,
    isTotal: row.key === "debt",
  }))

/** Назва аркуша мовою документа: «Рахунок на оплату», у сторно — «Сторно рахунку». */
export const invoiceSheetTitle = (invoice: Invoice, language: Language) =>
  (invoice.status === REVERSAL_STATUS ? SHEET.reversal : SHEET.title)[language]

/** Постачальник і покупець аркуша документа з реквізитами знімків (ADR-0068). */
export function SheetParties({ document }: { document: K2Document }) {
  const { t } = usePrintSheet()
  return (
    <PrintParties
      parties={[
        {
          label: t("print.sheet.supplier"),
          name: document.supplier.name,
          details: partyRequisiteLines(document.supplier, t),
        },
        {
          label: t("print.sheet.buyer"),
          name: document.buyer.name || document.clientName,
          details: partyRequisiteLines(document.buyer, t),
        },
      ]}
    />
  )
}

/**
 * Аркуш рахунку з блоків кіта (PF08, ADR-0062, ADR-0068, ADR-0070): шапка компанії, «Рахунок на оплату» з
 * номером і датою, «Сплатити до …», постачальник і покупець з реквізитами знімків рахунку, рядки, підсумки
 * сервера з сумою прописом, кредит-ноти, оплати й «До сплати» (ADR-0074), QR-код оплати НБУ боргу
 * виставленого рахунку в гривнях, підписи. Чернетка й скасований
 * — з позначкою навскіс, у чернетки «(без номера)».
 */
export function InvoiceSheet({
  invoice,
  detail,
  company,
}: {
  invoice: Invoice
  detail: InvoiceDetail
  company: CompanyProfile
}) {
  const { language, locale } = usePrintSheet()
  const qr = invoicePaymentQr(invoice, detail.totals)
  return (
    <>
      <PrintWatermark docStatus={invoice.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintCompanyHeader company={company} />
        <div className="grid gap-1 text-center">
          <PrintDocumentTitle
            title={invoiceSheetTitle(invoice, language)}
            number={invoice.number}
            date={invoice.date}
            docStatus={invoice.docStatus}
          />
          {invoice.status === REVERSAL_STATUS ? null : (
            <p>
              {SHEET.due[language](formatDate(invoice.dueDate, "long", locale))}
            </p>
          )}
        </div>
        <SheetParties document={invoice} />
        <PrintDocumentLines lines={detail.lines} currency={invoice.currency} />
        <PrintDocumentTotals
          lines={detail.lines}
          currency={invoice.currency}
          totals={detail.totals}
          after={settlementRows(invoice, detail.totals, language)}
        />
        {qr?.ok ? (
          <div
            data-slot="invoice-payment-qr"
            data-print="avoid-break"
            className="flex items-center gap-[4mm]"
          >
            <QrCode
              value={qr.url}
              label={SHEET.qrLabel[language](invoice.number ?? "")}
              className="size-[32mm] shrink-0 rounded-none"
            />
            <p className="max-w-[90mm] text-[8.5pt]">{SHEET.qr[language]}</p>
          </div>
        ) : null}
        <PrintSignatures company={company} />
      </div>
    </>
  )
}
