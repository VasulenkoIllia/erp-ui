import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"
import {
  DocumentFormPage,
  useDocumentFormSource,
} from "@/components/templates/document-form-page"
import { useEditSession } from "@/hooks/use-edit-session"
import { usePageHeading } from "@/hooks/use-page-heading"

import { CreditNoteForm } from "../components/credit-note-form"
import { useDocumentAccess } from "../components/invoice-access"
import { useDocumentTitle } from "../components/invoice-display"
import {
  CREDIT_NOTES,
  creditNoteDetailSchema,
  type CreditNote,
} from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/**
 * Сторінка зміни чернетки кредит-ноти (`…/credit-notes/:id/edit`, ADR-0072): нової адреси немає — кредит-ноту
 * створює дія рахунку. Зміна бере блокування «Редагує …» (ADR-0051) на час сторінки; виставлена, без права,
 * у закритому періоді чи взята іншою людиною — та сама форма лише для читання з причиною.
 */
export function CreditNoteFormPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return isPending ? (
    <PageSkeleton rows={6} />
  ) : (
    <EditCreditNote key={id} id={id} />
  )
}

function EditCreditNote({ id }: { id: string }) {
  const t = useInvoicesT()
  const titleOf = useDocumentTitle(CREDIT_NOTE_KIND)
  const { extension, paths } = useInvoicesModule()
  // Схема кредит-ноти: з `basis` чернетки — залишками рахунку для перевірки кількості.
  const {
    card,
    document: note,
    ready,
    fallback,
  } = useDocumentFormSource<CreditNote, typeof creditNoteDetailSchema>({
    resource: CREDIT_NOTES,
    id,
    schema: creditNoteDetailSchema,
    owner: "K2-invoices",
    invalidTitle: t("creditNote.linesInvalid"),
  })
  const title = note
    ? t("creditNoteForm.editTitle", { title: titleOf(note) })
    : t("creditNote.title")
  const heading = usePageHeading(
    title,
    !card.isPending || card.pageError !== undefined,
  )
  const session = useEditSession({
    resource: CREDIT_NOTES,
    id,
    access: useDocumentAccess(CREDIT_NOTE_KIND, "update", note),
    hasRecord: Boolean(note),
    deniedReason: t("creditNote.editDenied"),
    enabled: extension.creditNotes?.editLock !== false,
  })
  return (
    <DocumentFormPage
      back={CREDIT_NOTE_KIND.pathsOf(paths).record(id)}
      backLabel={t("creditNoteForm.back")}
      title={title}
      headingRef={heading}
      holder={session.holder}
    >
      {fallback ??
        (!ready || session.isPending ? (
          <PageSkeleton rows={6} />
        ) : (
          <CreditNoteForm
            note={ready}
            readOnly={session.readOnly}
            readOnlyReason={session.reason}
          />
        ))}
    </DocumentFormPage>
  )
}
