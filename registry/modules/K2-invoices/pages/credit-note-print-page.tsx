import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"

import {
  CreditNoteSheet,
  creditNoteSheetTitle,
} from "../components/credit-note-sheet"
import { DocumentPrint } from "../components/document-print"
import type { CreditNote } from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"

/**
 * Друк кредит-ноти (PF08, ADR-0062, ADR-0072): аркуш A4 мовою документа на спільній сторінці друку модуля,
 * без QR-коду оплати.
 */
export function CreditNotePrintPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return isPending ? (
    <PageSkeleton rows={6} />
  ) : (
    <DocumentPrint<CreditNote>
      key={id}
      kind={CREDIT_NOTE_KIND}
      id={id}
      sheetTitle={creditNoteSheetTitle}
      sheet={(note, detail, company) => (
        <CreditNoteSheet note={note} detail={detail} company={company} />
      )}
    />
  )
}
