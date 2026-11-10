import {
  PrintDocumentLines,
  PrintDocumentTitle,
  PrintDocumentTotals,
  PrintWatermark,
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

import { REVERSAL_STATUS, type Invoice, type InvoiceDetail } from "../contract"
import { invoicePaymentQr } from "./invoice-payment"

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
} as const satisfies Record<string, Readonly<Record<Language, unknown>>>

/** Назва аркуша мовою документа: «Рахунок на оплату», у сторно — «Сторно рахунку». */
export const invoiceSheetTitle = (invoice: Invoice, language: Language) =>
  (invoice.status === REVERSAL_STATUS ? SHEET.reversal : SHEET.title)[language]

/**
 * Аркуш рахунку з блоків кіта (PF08, ADR-0062, ADR-0068, ADR-0070): шапка компанії, «Рахунок на оплату» з
 * номером і датою, «Сплатити до …», постачальник і покупець з реквізитами знімків рахунку, рядки, підсумки
 * сервера з сумою прописом, QR-код оплати НБУ виставленого рахунку в гривнях, підписи. Чернетка й скасований
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
  const { t, language, locale } = usePrintSheet()
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
        <PrintParties
          parties={[
            {
              label: t("print.sheet.supplier"),
              name: invoice.supplier.name,
              details: partyRequisiteLines(invoice.supplier, t),
            },
            {
              label: t("print.sheet.buyer"),
              name: invoice.buyer.name || invoice.clientName,
              details: partyRequisiteLines(invoice.buyer, t),
            },
          ]}
        />
        <PrintDocumentLines lines={detail.lines} currency={invoice.currency} />
        <PrintDocumentTotals
          lines={detail.lines}
          currency={invoice.currency}
          totals={detail.totals}
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
