import { DocumentDeleteAction } from "@/components/erp/document-delete-action"

import type { K2Document } from "../contract"
import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { useDocumentLockedReason } from "./invoice-access"

/**
 * «Видалити чернетку» рахунку чи кредит-ноти в шапці картки (ADR-0066): кнопка кіта зі словами модуля;
 * закритий період — причиною кіта. Наслідок у підтвердженні дає шапка (`description`): чернетка з
 * замовлення звільняє його (ADR-0070).
 */
export function InvoiceDeleteAction({
  kind,
  document,
  description,
  lockReason,
}: {
  /** Документ модуля: рахунок чи кредит-нота. */
  kind: K2DocumentKind
  document: K2Document
  /** Наслідок видалення в підтвердженні. */
  description: string
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason: string | undefined
}) {
  const t = useInvoicesT()
  const { paths } = useInvoicesModule()
  const lockedReason = useDocumentLockedReason(kind)
  const { key } = kind
  return (
    <DocumentDeleteAction
      resource={kind.resource}
      document={document}
      listPath={kind.pathsOf(paths).list}
      moduleText={lockedReason}
      lockReason={lockReason}
      texts={{
        button: t(`${key}.delete.button`),
        denied: t(`${key}.delete.denied`),
        done: t(`${key}.delete.done`),
        title: t(`${key}.delete.title`),
        description,
        confirm: t(`${key}.delete.confirm`),
      }}
    />
  )
}
