import { Link, useNavigate } from "react-router"

import type { RecordField } from "@/components/erp/record-header"
import { AccessLink } from "@/components/erp/access-link"
import { StatusBadge } from "@/components/erp/status-badge"
import type {
  ObjectPageAction,
  ObjectPageHeader,
} from "@/components/templates/object-page"
import { buttonVariants } from "@/components/ui/button"
import type { EditLock } from "@/hooks/use-edit-lock"
import type { PaletteAction } from "@/hooks/use-palette-actions"
import { useExtensionFields } from "@/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import { ACTION_ICONS } from "@/lib/icons"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { SalesDocument } from "../contract"
import type { SalesDocumentIds } from "../extension"
import { useSalesModule } from "../module-context"
import type { SalesDocumentKind, SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"
import { useSalesAccess, useSalesLockedReason } from "./sales-access"
import { SalesDeleteAction } from "./sales-delete"
import { SalesDueDate, useSalesTitle } from "./sales-display"

const PrintIcon = ACTION_ICONS.print

/** Клієнт документа: посилання на його картку, якщо вона є в проекті, інакше — назва текстом. */
function SalesClient({ document }: { document: SalesDocument }) {
  const { clients } = useSalesModule()
  return clients.href ? (
    <Link
      to={clients.href(document.clientId)}
      className="underline-offset-4 hover:underline focus-visible:underline"
    >
      {document.clientName}
    </Link>
  ) : (
    document.clientName
  )
}

/**
 * Шапка картки документа продажу: номер (чернетка — без номера), статус, ключові поля (клієнт, дата,
 * друга дата, сума) з полями розширення, «Змінити» (сторінка форми, лише чернетка), «Копіювати» (нова
 * форма з тими самими клієнтом і рядками, право `<ресурс>:create`), «Видалити чернетку», «Друк» і дії
 * розширення; без запису — немає.
 */
export function useSalesHeader<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
  document: D | undefined,
  statuses: ResolvedStatuses,
  slotActions:
    KeyedChanges<ObjectPageAction, SalesDocumentIds<Due>["action"]> | undefined,
  lock: EditLock,
): ObjectPageHeader | undefined {
  const t = useSalesT()
  const format = useFormat()
  const titleOf = useSalesTitle(kind)
  const { extension, paths, preload } = useSalesModule()
  const lockedReason = useSalesLockedReason(kind)
  const documentExtension = kind.extensionOf(extension)
  const extensionFields = useExtensionFields(documentExtension?.fields)
  if (!document) return undefined
  const { record } = kind.keys
  const documentPaths = kind.pathsOf(paths)
  const fields: (RecordField & { id: SalesDocumentIds<Due>["field"] })[] = [
    {
      id: "client",
      label: t(`${record}.fields.client`),
      value: <SalesClient document={document} />,
    },
    {
      id: "date",
      label: t(`${record}.fields.date`),
      value: format.date(document.date, "date"),
    },
    {
      id: kind.due.field,
      label: t(kind.due.label),
      value: <SalesDueDate kind={kind} document={document} />,
    },
    {
      id: "total",
      label: t(`${record}.fields.total`),
      value: (
        <span className="tabular-nums">
          {format.money({
            amount: document.total,
            currency: document.currency,
          })}
        </span>
      ),
    },
  ]
  const actions: (ObjectPageAction & {
    id: SalesDocumentIds<Due>["action"]
  })[] = [
    {
      id: "edit",
      node: (
        <AccessLink
          resource={kind.resource}
          action="update"
          to={documentPaths.edit(document.id)}
          preload={preload}
          moduleText={lockedReason}
          icon="edit"
          label={t(`${record}.edit`)}
          deniedReason={t(`${record}.editDenied`)}
          record={document}
          lockReason={lock.reason}
        />
      ),
    },
    {
      id: "copy",
      node: (
        <AccessLink
          resource={kind.resource}
          action="create"
          to={documentPaths.copy(document.id)}
          preload={preload}
          icon="duplicate"
          label={t(`${record}.copy`)}
          deniedReason={t(`${kind.keys.list}.createDenied`)}
        />
      ),
    },
    {
      id: "delete",
      node: (
        <SalesDeleteAction
          kind={kind}
          document={document}
          lockReason={lock.reason}
        />
      ),
    },
    {
      id: "print",
      node: (
        <Link
          to={documentPaths.print(document.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          <PrintIcon aria-hidden />
          {t(`${record}.print`)}
        </Link>
      ),
    },
  ]
  return {
    title: titleOf(document),
    status: (
      <StatusBadge
        status={statuses.byId.get(document.status) ?? document.status}
      />
    ),
    fields: applyKeyedChanges(
      fields,
      mapKeyedChanges(documentExtension?.recordFields, (field) =>
        extensionFields.displayEntry(field, document),
      ),
    ),
    actions: applyKeyedChanges(actions, slotActions),
  }
}

/**
 * «Змінити», «Копіювати» й «Друк» у палітрі команд (ADR-0044): права й причина ті самі, що в кнопок
 * шапки. Поки права невідомі, «Змінити» й «Копіювати» немає, як і кнопок.
 */
export function useSalesPaletteActions(
  kind: SalesKindBase,
  document: SalesDocument | undefined,
  lock: EditLock,
): PaletteAction[] {
  const t = useSalesT()
  const navigate = useNavigate()
  const { paths } = useSalesModule()
  const { canAccess, isPending, recordReason } = useSalesAccess(
    kind,
    "update",
    document,
  )
  const create = useSalesAccess(kind, "create", undefined)
  if (!document) return []
  const { record } = kind.keys
  const documentPaths = kind.pathsOf(paths)
  const print: PaletteAction = {
    id: "print",
    label: t(`${record}.print`),
    icon: PrintIcon,
    onSelect: () => void navigate(documentPaths.print(document.id)),
  }
  if (isPending || create.isPending) return [print]
  const copy: PaletteAction = {
    id: "copy",
    label: t(`${record}.copy`),
    icon: ACTION_ICONS.duplicate,
    deniedReason: create.canAccess
      ? undefined
      : t(`${kind.keys.list}.createDenied`),
    onSelect: () => void navigate(documentPaths.copy(document.id)),
  }
  const edit: PaletteAction = {
    id: "edit",
    label: t(`${record}.edit`),
    icon: ACTION_ICONS.edit,
    deniedReason: canAccess
      ? lock.reason
      : (recordReason ?? t(`${record}.editDenied`)),
    onSelect: () => void navigate(documentPaths.edit(document.id)),
  }
  return [edit, copy, print]
}
