import { useAuthenticated } from "ra-core"
import { useEffect, useEffectEvent, useState } from "react"
import { useParams } from "react-router"

import { EditLockNotice } from "@/components/erp/edit-lock-notice"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { BackToList } from "@/components/erp/record-link"
import { ListReportHeader } from "@/components/templates/list-report"
import { useCardRecord } from "@/hooks/use-card-record"
import { useEditLock } from "@/hooks/use-edit-lock"
import { usePageHeading } from "@/hooks/use-page-heading"
import { errorStateKind, isApiError } from "@/lib/api"

import { CreditNoteForm } from "../components/credit-note-form"
import { useDocumentAccess } from "../components/invoice-access"
import { useDocumentTitle } from "../components/invoice-display"
import { useDocumentDetail } from "../components/invoice-lines"
import {
  CREDIT_NOTES,
  creditNoteDetailSchema,
  type CreditNote,
  type CreditNoteCard,
  type CreditNoteDetail,
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
  const card = useCardRecord<CreditNote & Partial<CreditNoteDetail>>(
    CREDIT_NOTES,
    id,
  )
  const note = card.record
  // Схема кредит-ноти: з `basis` чернетки — залишками рахунку для перевірки кількості.
  const detail = useDocumentDetail(note, creditNoteDetailSchema)
  const title = note
    ? t("creditNoteForm.editTitle", { title: titleOf(note) })
    : t("creditNote.title")
  const heading = usePageHeading(
    title,
    !card.isPending || card.pageError !== undefined,
  )
  const access = useDocumentAccess(CREDIT_NOTE_KIND, "update", note)
  const lock = useEditLock({
    resource: CREDIT_NOTES,
    id,
    enabled: extension.creditNotes?.editLock !== false,
  })
  const mayEdit = Boolean(note) && !access.isPending && access.canAccess
  // Поки перше взяття не відповіло, форма лише для читання: введене до відмови пропало б.
  const [isLockSettled, setLockSettled] = useState(false)
  const acquire = useEffectEvent(() => lock.acquire())
  const isFree = lock.holder === null
  useEffect(() => {
    if (!mayEdit || !isFree) return
    // Збій блокування не заважає редагувати (`useEditLock`): дані береже версія запису.
    const settle = () => {
      setLockSettled(true)
    }
    void acquire().then(settle, settle)
  }, [mayEdit, isFree])
  const reason = access.isPending
    ? undefined
    : access.canAccess
      ? lock.reason
      : (access.recordReason ?? t("creditNote.editDenied"))
  const ready: CreditNoteCard | undefined =
    note && detail?.success ? { ...note, ...detail.data } : undefined
  const body =
    card.pageError !== undefined ? (
      <PageState
        kind={
          isApiError(card.pageError) && card.pageError.status === 404
            ? "not-found"
            : errorStateKind(card.pageError)
        }
        onRetry={card.retry}
      />
    ) : detail && !detail.success ? (
      // Рядки не за контрактом: форма не відкривається, щоб не зберегти зіпсоване.
      <PageState
        kind="error"
        title={t("creditNote.linesInvalid")}
        onRetry={card.retry}
      />
    ) : !ready && note && !card.isFetching ? (
      <PageState
        kind={card.failure ? errorStateKind(card.failure) : "error"}
        onRetry={card.retry}
      />
    ) : !ready || access.isPending ? (
      <PageSkeleton rows={6} />
    ) : (
      <CreditNoteForm
        note={ready}
        readOnly={
          reason !== undefined ||
          lock.isAcquiring ||
          (mayEdit && !isLockSettled)
        }
        readOnlyReason={reason}
      />
    )
  return (
    <div className="space-y-6">
      <BackToList
        to={CREDIT_NOTE_KIND.pathsOf(paths).record(id)}
        label={t("creditNoteForm.back")}
      />
      <ListReportHeader title={title} headingRef={heading} />
      <EditLockNotice holder={lock.holder} />
      {body}
    </div>
  )
}
