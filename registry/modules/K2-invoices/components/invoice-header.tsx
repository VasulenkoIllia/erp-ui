import { Link, useNavigate } from "react-router"

import type { RecordField } from "@/components/erp/record-header"
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

import type { Invoice } from "../contract"
import type { InvoiceActionId, InvoiceFieldId } from "../extension"
import { invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { AccessLink } from "./access-link"
import { useInvoiceAccess } from "./invoice-access"
import { InvoiceDeleteAction } from "./invoice-delete"
import {
  InvoiceBaseTotal,
  InvoiceDueDate,
  InvoiceTotal,
  useInvoiceTitle,
} from "./invoice-display"

const PrintIcon = ACTION_ICONS.print

/** Клієнт рахунку: посилання на його картку, якщо вона є в проекті, інакше — назва текстом. */
function InvoiceClient({ invoice }: { invoice: Invoice }) {
  const { clients } = useInvoicesModule()
  return clients.href ? (
    <Link
      to={clients.href(invoice.clientId)}
      className="underline-offset-4 hover:underline focus-visible:underline"
    >
      {invoice.clientName}
    </Link>
  ) : (
    invoice.clientName
  )
}

/**
 * Шапка картки рахунку: номер (чернетка — без номера), статус, ключові поля (клієнт, дата, «Сплатити до»,
 * сума, у рахунку у валюті — сума в базовій валюті з курсом, ADR-0071) з полями розширення, «Змінити»
 * (сторінка форми, лише чернетка), «Копіювати» (нова форма з тими самими клієнтом і рядками, право
 * `sales-invoices:create`), «Видалити чернетку», «Друк» і дії розширення; без запису — немає.
 */
export function useInvoiceHeader(
  invoice: Invoice | undefined,
  statuses: ResolvedStatuses,
  slotActions: KeyedChanges<ObjectPageAction, InvoiceActionId> | undefined,
  lock: EditLock,
): ObjectPageHeader | undefined {
  const t = useInvoicesT()
  const format = useFormat()
  const titleOf = useInvoiceTitle()
  const { extension, paths } = useInvoicesModule()
  const invoiceExtension = extension.invoices
  const extensionFields = useExtensionFields(invoiceExtension?.fields)
  if (!invoice) return undefined
  const documentPaths = invoiceDocumentPaths(paths)
  const fields: (RecordField & { id: InvoiceFieldId })[] = [
    {
      id: "client",
      label: t("invoice.fields.client"),
      value: <InvoiceClient invoice={invoice} />,
    },
    {
      id: "date",
      label: t("invoice.fields.date"),
      value: format.date(invoice.date, "date"),
    },
    {
      id: "dueDate",
      label: t("invoice.fields.dueDate"),
      value: <InvoiceDueDate invoice={invoice} />,
    },
    {
      id: "total",
      label: t("invoice.fields.total"),
      value: <InvoiceTotal invoice={invoice} />,
    },
  ]
  if (invoice.exchange)
    fields.push({
      id: "baseTotal",
      label: t("invoice.fields.baseTotal"),
      value: <InvoiceBaseTotal invoice={invoice} exchange={invoice.exchange} />,
    })
  const actions: (ObjectPageAction & { id: InvoiceActionId })[] = [
    {
      id: "edit",
      node: (
        <AccessLink
          action="update"
          to={documentPaths.edit(invoice.id)}
          icon="edit"
          label={t("invoice.edit")}
          deniedReason={t("invoice.editDenied")}
          record={invoice}
          lockReason={lock.reason}
        />
      ),
    },
    {
      id: "copy",
      node: (
        <AccessLink
          action="create"
          to={documentPaths.copy(invoice.id)}
          icon="duplicate"
          label={t("invoice.copy")}
          deniedReason={t("invoices.createDenied")}
        />
      ),
    },
    {
      id: "delete",
      node: <InvoiceDeleteAction invoice={invoice} lockReason={lock.reason} />,
    },
    {
      id: "print",
      node: (
        <Link
          to={documentPaths.print(invoice.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          <PrintIcon aria-hidden />
          {t("invoice.print")}
        </Link>
      ),
    },
  ]
  return {
    title: titleOf(invoice),
    status: (
      <StatusBadge
        status={statuses.byId.get(invoice.status) ?? invoice.status}
      />
    ),
    fields: applyKeyedChanges(
      fields,
      mapKeyedChanges(invoiceExtension?.recordFields, (field) =>
        extensionFields.displayEntry(field, invoice),
      ),
    ),
    actions: applyKeyedChanges(actions, slotActions),
  }
}

/**
 * «Змінити», «Копіювати» й «Друк» у палітрі команд (ADR-0044): права й причина ті самі, що в кнопок
 * шапки. Поки права невідомі, «Змінити» й «Копіювати» немає, як і кнопок.
 */
export function useInvoicePaletteActions(
  invoice: Invoice | undefined,
  lock: EditLock,
): PaletteAction[] {
  const t = useInvoicesT()
  const navigate = useNavigate()
  const { paths } = useInvoicesModule()
  const { canAccess, isPending, recordReason } = useInvoiceAccess(
    "update",
    invoice,
  )
  const create = useInvoiceAccess("create", undefined)
  if (!invoice) return []
  const documentPaths = invoiceDocumentPaths(paths)
  const print: PaletteAction = {
    id: "print",
    label: t("invoice.print"),
    icon: PrintIcon,
    onSelect: () => void navigate(documentPaths.print(invoice.id)),
  }
  if (isPending || create.isPending) return [print]
  const copy: PaletteAction = {
    id: "copy",
    label: t("invoice.copy"),
    icon: ACTION_ICONS.duplicate,
    deniedReason: create.canAccess ? undefined : t("invoices.createDenied"),
    onSelect: () => void navigate(documentPaths.copy(invoice.id)),
  }
  const edit: PaletteAction = {
    id: "edit",
    label: t("invoice.edit"),
    icon: ACTION_ICONS.edit,
    deniedReason: canAccess
      ? lock.reason
      : (recordReason ?? t("invoice.editDenied")),
    onSelect: () => void navigate(documentPaths.edit(invoice.id)),
  }
  return [edit, copy, print]
}
