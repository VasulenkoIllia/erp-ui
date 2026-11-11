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

import type { Invoice, K2Document } from "../contract"
import type { InvoiceActionId, InvoiceFieldId } from "../extension"
import { invoiceDebt, isSettling } from "../invoice-debt"
import { INVOICE_KIND, invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { AccessLink } from "./access-link"
import { useDocumentAccess } from "./invoice-access"
import { DocumentDeleteAction } from "./invoice-delete"
import {
  InvoiceBaseTotal,
  InvoiceDueDate,
  InvoiceTotal,
  useInvoiceTitle,
} from "./invoice-display"
import { awaitsPayment, RegisterPayment } from "./register-payment"

const PrintIcon = ACTION_ICONS.print

/** Клієнт документа: посилання на його картку, якщо вона є в проекті, інакше — назва текстом. */
export function DocumentClient({
  document,
}: {
  document: Pick<K2Document, "clientId" | "clientName">
}) {
  const { clients } = useInvoicesModule()
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
 * Шапка картки рахунку: номер (чернетка — без номера), статус, ключові поля (клієнт, дата, «Сплатити до»,
 * сума, у рахунку у валюті — сума в базовій валюті з курсом, ADR-0071; з виставленими кредит-нотами — їхня
 * сума, ADR-0072; з оплатами — оплачене й «До сплати» чи «Переплата», ADR-0073) з полями розширення,
 * «Змінити» (сторінка форми, лише чернетка), «Копіювати» (нова форма з тими самими клієнтом і рядками, право
 * `sales-invoices:create`), «Зареєструвати оплату» (рахунок із боргом, коли проект підключив оплати),
 * «Видалити чернетку», «Друк» і дії розширення; без запису — немає.
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
  const { extension, paths, payments } = useInvoicesModule()
  const invoiceExtension = extension.invoices
  const extensionFields = useExtensionFields(invoiceExtension?.fields)
  if (!invoice) return undefined
  const documentPaths = invoiceDocumentPaths(paths)
  const fields: (RecordField & { id: InvoiceFieldId })[] = [
    {
      id: "client",
      label: t("invoice.fields.client"),
      value: <DocumentClient document={invoice} />,
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
  // Статус рахунку кредит-нота не змінює: поруч — сума виставлених кредит-нот (ADR-0072).
  if (invoice.creditedTotal)
    fields.push({
      id: "credited",
      label: t("invoice.fields.credited"),
      value: format.money({
        amount: invoice.creditedTotal,
        currency: invoice.currency,
      }),
    })
  fields.push(...settlementFields(invoice, t, format))
  const actions: (ObjectPageAction & { id: InvoiceActionId })[] = [
    {
      id: "edit",
      node: (
        <AccessLink
          kind={INVOICE_KIND}
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
          kind={INVOICE_KIND}
          action="create"
          to={documentPaths.copy(invoice.id)}
          icon="duplicate"
          label={t("invoice.copy")}
          deniedReason={t("invoices.createDenied")}
        />
      ),
    },
    ...(payments && awaitsPayment(invoice)
      ? [
          {
            id: "registerPayment" as const,
            node: <RegisterPayment invoice={invoice} payments={payments} />,
          },
        ]
      : []),
    {
      id: "delete",
      node: (
        <DocumentDeleteAction
          kind={INVOICE_KIND}
          document={invoice}
          description={
            invoice.amendedFrom
              ? t("invoice.delete.descriptionAmended")
              : invoice.orderId
                ? t("invoice.delete.descriptionOrder")
                : t("invoice.delete.description")
          }
          lockReason={lock.reason}
        />
      ),
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
 * Оплачене й борг рахунку з оплатами (ADR-0073): «Оплачено» — сума оплат, «До сплати» — борг після кредит-нот
 * і оплат, «Переплата» — коли кредит-ноту виставили вже після оплати. Без оплат і кредит-нот — нічого: борг
 * дорівнює сумі.
 */
function settlementFields(
  invoice: Invoice,
  t: ReturnType<typeof useInvoicesT>,
  format: ReturnType<typeof useFormat>,
): (RecordField & { id: InvoiceFieldId })[] {
  const money = (amount: number) =>
    format.money({ amount, currency: invoice.currency })
  const fields: (RecordField & { id: InvoiceFieldId })[] = []
  if (invoice.paidTotal)
    fields.push({
      id: "paid",
      label: t("invoice.fields.paid"),
      value: money(invoice.paidTotal),
    })
  const debt = invoiceDebt(invoice)
  if (isSettling(invoice) && debt !== 0 && debt !== invoice.total)
    fields.push({
      id: "debt",
      label: t(debt > 0 ? "invoice.fields.debt" : "invoice.fields.overpaid"),
      value: money(Math.abs(debt)),
    })
  return fields
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
  const { canAccess, isPending, recordReason } = useDocumentAccess(
    INVOICE_KIND,
    "update",
    invoice,
  )
  const create = useDocumentAccess(INVOICE_KIND, "create", undefined)
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
