import type { RaRecord } from "ra-core"
import type * as React from "react"
import type { z } from "zod"

import { useDocumentDetail } from "@/registry/erp/document-lines-section"
import { EditLockNotice } from "@/registry/erp/edit-lock-notice"
import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { BackToList } from "@/registry/erp/record-link"
import {
  useCardRecord,
  type CardRecord,
} from "@/registry/hooks/use-card-record"
import { errorStateKind, isApiError } from "@/registry/lib/api"
import type { EditLockHolder } from "@/registry/lib/edit-lock"
import {
  ListReportHeader,
  type ListReportHeaderProps,
} from "@/registry/templates/list-report"

/**
 * Сторінка форми документа (SPEC §7 «Document Form», ADR-0047, ADR-0086): «Назад», заголовок, смуга
 * «Редагує …» і тіло — форма чи стан запиту. Документ буває на сотні рядків, тож форма — сторінкою, а не
 * діалогом картки. Спільне для документних модулів (B3, K2).
 *
 *   const source = useDocumentFormSource({ resource: INVOICES, id, schema: invoiceDetailSchema,
 *     owner: "K2-invoices", invalidTitle: t("invoice.linesInvalid") })
 *   const session = useEditSession({ … })      // hooks/use-edit-session
 *   <DocumentFormPage back={paths.record(id)} backLabel={t("invoiceForm.back")} title={title}
 *     headingRef={heading} holder={session.holder}>
 *     {source.fallback ?? <InvoiceForm invoice={source.ready} readOnly={session.readOnly} />}
 *   </DocumentFormPage>
 */
export function DocumentFormPage({
  back,
  backLabel,
  title,
  headingRef,
  holder,
  children,
}: {
  /** Адреса «Назад»: список для нового документа, картка для зміни. */
  back: string
  backLabel: string
  title: string
  headingRef: ListReportHeaderProps["headingRef"]
  /** Хто редагує документ (`useEditSession`); нового документа ще ніхто не редагує — без смуги. */
  holder?: EditLockHolder | null | undefined
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <BackToList to={back} label={backLabel} />
      <ListReportHeader title={title} headingRef={headingRef} />
      {holder === undefined ? null : <EditLockNotice holder={holder} />}
      {children}
    </div>
  )
}

export interface DocumentFormSource<D, Detail> {
  readonly card: CardRecord<D & Partial<Detail>>
  /** Шапка документа: одразу з кешу списку, рядки — з відповіді картки. */
  readonly document: (D & Partial<Detail>) | undefined
  /** Документ із рядками для форми; поки його немає — `fallback`. */
  readonly ready: (D & Detail) | undefined
  /** Стан запиту картки: 404, помилка, скелетон, рядки не за контрактом; `null` — форма готова. */
  readonly fallback: React.ReactNode
}

/**
 * Документ із рядками для форми (зміна чи копія): картка документа, рядки за схемою модуля й стан запиту.
 * Рядки не за контрактом — форма не відкривається, щоб не зберегти зіпсоване.
 */
export function useDocumentFormSource<
  D extends RaRecord,
  S extends z.ZodType<object>,
>({
  resource,
  id,
  schema,
  owner,
  invalidTitle,
}: {
  resource: string
  id: string
  /** Схема рядків і підсумків модуля. */
  schema: S
  /** Назва модуля для консолі: «K2-invoices: document lines response». */
  owner: string
  /** «Рядки рахунку не за контрактом» словами модуля. */
  invalidTitle: string
}): DocumentFormSource<D, z.output<S>> {
  const card = useCardRecord<D & Partial<z.output<S>>>(resource, id)
  const document = card.record
  const detail = useDocumentDetail(document, schema, owner)
  const pageError = card.pageError
  const fallback: React.ReactNode =
    pageError !== undefined ? (
      <PageState
        kind={
          isApiError(pageError) && pageError.status === 404
            ? "not-found"
            : errorStateKind(pageError)
        }
        onRetry={card.retry}
      />
    ) : !document || (!detail && card.isFetching) ? (
      <PageSkeleton rows={6} />
    ) : !detail ? (
      // Відповіді картки з рядками немає: помилка запиту.
      <PageState
        kind={card.failure ? errorStateKind(card.failure) : "error"}
        onRetry={card.retry}
      />
    ) : !detail.success ? (
      <PageState kind="error" title={invalidTitle} onRetry={card.retry} />
    ) : null
  const ready =
    document && detail?.success
      ? ({ ...document, ...detail.data } as D & z.output<S>)
      : undefined
  return { card, document, ready, fallback }
}
