import {
  PrintDocumentLines,
  PrintDocumentTitle,
  PrintDocumentTotals,
  PrintWatermark,
} from "@/components/erp/print-document"
import {
  PrintCompanyHeader,
  PrintSignatures,
} from "@/components/erp/print-requisites"
import type { CompanyProfile } from "@/lib/company"
import { formatDate } from "@/lib/format"
import type { Language } from "@/lib/i18n"
import { usePrintSheet } from "@/lib/print"

import {
  REVERSAL_STATUS,
  type CreditNote,
  type InvoiceDetail,
} from "../contract"
import { SheetParties } from "./invoice-sheet"

/** Тексти аркуша мовою документа (дані модуля, а не рядки інтерфейсу, ADR-0062). */
const SHEET = {
  title: { uk: "Кредит-нота", en: "Credit note" },
  reversal: { uk: "Сторно кредит-ноти", en: "Credit note reversal" },
  basis: {
    uk: (number: string, date: string) => `До рахунку № ${number} від ${date}`,
    en: (number: string, date: string) =>
      `Against invoice No. ${number} of ${date}`,
  },
} as const satisfies Record<string, Readonly<Record<Language, unknown>>>

/** Назва аркуша мовою документа: «Кредит-нота», у сторно — «Сторно кредит-ноти». */
export const creditNoteSheetTitle = (note: CreditNote, language: Language) =>
  (note.status === REVERSAL_STATUS ? SHEET.reversal : SHEET.title)[language]

/**
 * Аркуш кредит-ноти з блоків кіта (PF08, ADR-0062, ADR-0068, ADR-0072): шапка компанії, «Кредит-нота» з
 * номером і датою, «До рахунку № … від …», постачальник і покупець із реквізитами знімків, повернені рядки,
 * підсумки сервера з сумою прописом, підписи. QR-коду оплати немає: кредит-нота не платіж. Чернетка й
 * скасована — з позначкою навскіс, у чернетки «(без номера)».
 */
export function CreditNoteSheet({
  note,
  detail,
  company,
}: {
  note: CreditNote
  detail: InvoiceDetail
  company: CompanyProfile
}) {
  const { language, locale } = usePrintSheet()
  return (
    <>
      <PrintWatermark docStatus={note.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintCompanyHeader company={company} />
        <div className="grid gap-1 text-center">
          <PrintDocumentTitle
            title={creditNoteSheetTitle(note, language)}
            number={note.number}
            date={note.date}
            docStatus={note.docStatus}
          />
          <p>
            {SHEET.basis[language](
              note.invoiceNumber,
              formatDate(note.invoiceDate, "long", locale),
            )}
          </p>
        </div>
        <SheetParties document={note} />
        <PrintDocumentLines lines={detail.lines} currency={note.currency} />
        <PrintDocumentTotals
          lines={detail.lines}
          currency={note.currency}
          totals={detail.totals}
        />
        <PrintSignatures company={company} />
      </div>
    </>
  )
}
