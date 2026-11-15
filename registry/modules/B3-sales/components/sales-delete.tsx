import { DocumentDeleteAction } from "@/components/erp/document-delete-action"

import type { SalesDocument } from "../contract"
import { useSalesModule } from "../module-context"
import type { SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"
import { useSalesLockedReason } from "./sales-access"
import { useSalesTrashLabel } from "./sales-trash-label"

/**
 * «Видалити чернетку» документа продажу в шапці картки (ADR-0066): кнопка кіта зі словами модуля;
 * виправлена копія попереднього документа — своїм наслідком у підтвердженні; з кошиком на сервері — без
 * підтвердження, зі «Скасувати» (ADR-0095).
 */
export function SalesDeleteAction({
  kind,
  document,
  lockReason,
}: {
  kind: SalesKindBase
  document: SalesDocument
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason: string | undefined
}) {
  const t = useSalesT()
  const { paths } = useSalesModule()
  const lockedReason = useSalesLockedReason(kind)
  const rowLabel = useSalesTrashLabel(kind)
  const { record } = kind.keys
  return (
    <DocumentDeleteAction
      resource={kind.resource}
      document={document}
      name={rowLabel(document)}
      listPath={kind.pathsOf(paths).list}
      moduleText={lockedReason}
      lockReason={lockReason}
      texts={{
        button: t(`${record}.delete.button`),
        denied: t(`${record}.delete.denied`),
        done: t(`${record}.delete.done`),
        trashed: t(`${record}.delete.trashed`),
        title: t(`${record}.delete.title`),
        description: document.amendedFrom
          ? t(`${record}.delete.descriptionAmended`)
          : t(`${record}.delete.description`),
        confirm: t(`${record}.delete.confirm`),
      }}
    />
  )
}
