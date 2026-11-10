import type { RaRecord } from "ra-core"
import { useNavigate } from "react-router"

import type { ConflictField } from "@/components/erp/conflict-dialog"
import { DocumentActionBar } from "@/components/erp/document-action-bar"
import { PeriodLockBanner } from "@/components/erp/period-lock-banner"
import { RecordStatusBar } from "@/components/erp/record-header"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import { CREATE_CREDIT_NOTE, type K2Document } from "../contract"
import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { useDocumentLockedReason } from "./invoice-access"
import { useDocumentTransitions } from "./invoice-statuses"

/** Поле «було → стало» в конфлікті дії: ключ, підпис і значення мовою інтерфейсу. */
export interface ComparedField<D> {
  readonly key: string
  readonly label: string
  readonly show: (document: D) => string
}

/**
 * «Було → стало» дії в конфлікті: статус, поле документа (`field`: «Сплатити до» рахунку, дата кредит-ноти)
 * і сума мовою інтерфейсу.
 */
export function useDocumentCompare<D extends K2Document>(
  kind: K2DocumentKind,
  statuses: ResolvedStatuses,
  field: ComparedField<D>,
) {
  const t = useInvoicesT()
  const format = useFormat()
  const compared: ComparedField<D>[] = [
    {
      key: "status",
      label: t(`${kind.key}.fields.status`),
      show: (document) =>
        statuses.byId.get(document.status)?.label ?? document.status,
    },
    field,
    {
      key: "total",
      label: t(`${kind.key}.fields.total`),
      show: (document) =>
        format.money({ amount: document.total, currency: document.currency }),
    },
  ]
  return (seen: D, current: D): ConflictField[] =>
    compared
      .filter(({ show }) => show(seen) !== show(current))
      .map(({ key, label, show }) => ({
        key,
        label,
        mine: show(seen),
        theirs: show(current),
      }))
}

/**
 * Етапи основного шляху, смуга закритого періоду (PF13: що робити далі — сторно) і панель дій графа під
 * шапкою картки документа; причини заборон станом — словами модуля. Після «Виправити» й «Сторнувати» —
 * картка нового документа, після «Кредит-нота» рахунку — картка кредит-ноти (ADR-0072).
 */
export function DocumentStatusBar<D extends K2Document>({
  kind,
  document,
  statuses,
  compare,
}: {
  kind: K2DocumentKind
  document: D
  statuses: ResolvedStatuses
  compare: (seen: D, current: D) => ConflictField[]
}) {
  const t = useInvoicesT()
  const navigate = useNavigate()
  const { paths } = useInvoicesModule()
  const transitions = useDocumentTransitions(kind)
  const lockedReason = useDocumentLockedReason(kind)
  return (
    <div className="grid gap-3">
      <RecordStatusBar
        label={t(`${kind.key}.steps`)}
        steps={kind.mainPath.map((status) => ({
          id: status,
          label: statuses.byId.get(status)?.label ?? status,
        }))}
        current={document.status}
      />
      <PeriodLockBanner
        date={document.date}
        hint={t(`${kind.key}.periodLockHint`)}
      />
      <DocumentActionBar
        resource={kind.resource}
        record={document}
        transitions={transitions}
        compare={compare}
        lockedReason={lockedReason}
        // Новий документ — нова картка: фокус на її заголовок ставить перехід.
        onCreated={(created: RaRecord, action: string) => {
          const id = String(created.id)
          void navigate(
            action === CREATE_CREDIT_NOTE
              ? paths.creditNote(id)
              : kind.pathsOf(paths).record(id),
          )
        }}
      />
    </div>
  )
}
