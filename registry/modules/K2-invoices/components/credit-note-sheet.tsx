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
import {
  PrintExtensionFields,
  PrintSheetBlocks,
  useSheetBlocks,
} from "@/components/erp/print-sheet-blocks"
import type { CompanyProfile } from "@/lib/company"
import { formatDate } from "@/lib/format"
import { usePrintSheet } from "@/lib/print"

import {
  CREDIT_NOTES,
  REVERSAL_STATUS,
  type CreditNote,
  type InvoiceDetail,
} from "../contract"
import { useInvoicesModule } from "../module-context"
import type { InvoicesSheetT } from "../use-invoices-t"
import { SheetParties } from "./invoice-sheet"

/** Назва аркуша мовою документа: «Кредит-нота», у сторно — «Сторно кредит-ноти». */
export const creditNoteSheetTitle = (note: CreditNote, t: InvoicesSheetT) =>
  t(
    note.status === REVERSAL_STATUS
      ? "creditNote.sheet.reversal"
      : "creditNote.sheet.title",
  )

/**
 * Аркуш кредит-ноти з блоків кіта (PF08, ADR-0062, ADR-0068, ADR-0072, ADR-0086): шапка компанії,
 * «Кредит-нота» з номером і датою, «До рахунку № … від …», постачальник і покупець із реквізитами знімків,
 * поля розширення з `print.fields`, повернені рядки, підсумки сервера з сумою прописом, підписи. QR-коду
 * оплати немає: кредит-нота не платіж. Тексти — рядки модуля мовою документа (`creditNote.sheet.*`);
 * розширення додає свій блок, ховає чи переставляє блок модуля (`print.blocks`). Чернетка й скасована — з
 * позначкою навскіс, у чернетки «(без номера)».
 */
export function CreditNoteSheet({
  note,
  detail,
  company,
  sheetT: t,
}: {
  note: CreditNote
  detail: InvoiceDetail
  company: CompanyProfile
  /** Рядки модуля мовою аркуша від сторінки друку (`DocumentPrint`). */
  sheetT: InvoicesSheetT
}) {
  const { locale } = usePrintSheet()
  const noteExtension = useInvoicesModule().extension.creditNotes
  const blocks = useSheetBlocks(
    [
      { id: "company", node: <PrintCompanyHeader company={company} /> },
      {
        id: "title",
        node: (
          <div className="grid gap-1 text-center">
            <PrintDocumentTitle
              title={creditNoteSheetTitle(note, t)}
              number={note.number}
              date={note.date}
              docStatus={note.docStatus}
            />
            <p>
              {t("creditNote.sheet.basis", {
                number: note.invoiceNumber,
                date: formatDate(note.invoiceDate, "long", locale),
              })}
            </p>
          </div>
        ),
      },
      { id: "parties", node: <SheetParties document={note} /> },
      {
        id: "fields",
        node: (
          <PrintExtensionFields
            record={note}
            fields={noteExtension?.fields}
            shown={noteExtension?.print?.fields}
          />
        ),
      },
      {
        id: "lines",
        node: (
          <PrintDocumentLines lines={detail.lines} currency={note.currency} />
        ),
      },
      {
        id: "totals",
        node: (
          <PrintDocumentTotals
            lines={detail.lines}
            currency={note.currency}
            totals={detail.totals}
          />
        ),
      },
      { id: "signatures", node: <PrintSignatures company={company} /> },
    ],
    {
      record: note,
      resource: CREDIT_NOTES,
      changes: noteExtension?.print?.blocks,
    },
  )
  return (
    <>
      <PrintWatermark docStatus={note.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintSheetBlocks blocks={blocks} />
      </div>
    </>
  )
}
