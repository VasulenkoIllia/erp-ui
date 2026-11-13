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

import type { CreditNote } from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import type { CreditNoteActionId, CreditNoteFieldId } from "../extension"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { useDocumentAccess, useDocumentLockedReason } from "./invoice-access"
import { DocumentClient } from "./invoice-header"
import { InvoiceDeleteAction } from "./invoice-delete"
import {
  InvoiceBaseTotal,
  InvoiceTotal,
  useDocumentTitle,
} from "./invoice-display"

const PrintIcon = ACTION_ICONS.print
const LINK_CLASS =
  "underline-offset-4 hover:underline focus-visible:underline tabular-nums"

/** Рахунок-підстава: номер і дата, посилання на його картку. */
function CreditNoteInvoice({ note }: { note: CreditNote }) {
  const format = useFormat()
  const { paths } = useInvoicesModule()
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      <Link to={paths.invoice(note.invoiceId)} className={LINK_CLASS}>
        {note.invoiceNumber}
      </Link>
      <span className="text-muted-foreground tabular-nums">
        {format.date(note.invoiceDate, "date")}
      </span>
    </span>
  )
}

/**
 * Шапка картки кредит-ноти (ADR-0072): номер (чернетка — без номера), статус, ключові поля (клієнт,
 * рахунок-підстава з посиланням, дата, сума, у валюті — сума в базовій валюті за курсом рахунку) з полями
 * розширення, «Змінити» (сторінка форми, лише чернетка), «Видалити чернетку», «Друк» і дії розширення.
 * «Копіювати» немає: кредит-ноту створюють лише з рахунку.
 */
export function useCreditNoteHeader(
  note: CreditNote | undefined,
  statuses: ResolvedStatuses,
  slotActions: KeyedChanges<ObjectPageAction, CreditNoteActionId> | undefined,
  lock: EditLock,
): ObjectPageHeader | undefined {
  const t = useInvoicesT()
  const format = useFormat()
  const titleOf = useDocumentTitle(CREDIT_NOTE_KIND)
  const { extension, paths, preload } = useInvoicesModule()
  const lockedReason = useDocumentLockedReason(CREDIT_NOTE_KIND)
  const noteExtension = extension.creditNotes
  const extensionFields = useExtensionFields(noteExtension?.fields)
  if (!note) return undefined
  const fields: (RecordField & { id: CreditNoteFieldId })[] = [
    {
      id: "client",
      label: t("creditNote.fields.client"),
      value: <DocumentClient document={note} />,
    },
    {
      id: "invoice",
      label: t("creditNote.fields.invoice"),
      value: <CreditNoteInvoice note={note} />,
    },
    {
      id: "date",
      label: t("creditNote.fields.date"),
      value: format.date(note.date, "date"),
    },
    {
      id: "total",
      label: t("creditNote.fields.total"),
      value: <InvoiceTotal invoice={note} />,
    },
  ]
  if (note.exchange)
    fields.push({
      id: "baseTotal",
      label: t("creditNote.fields.baseTotal"),
      value: (
        <InvoiceBaseTotal invoice={note} exchange={note.exchange} isRateFixed />
      ),
    })
  const actions: (ObjectPageAction & { id: CreditNoteActionId })[] = [
    {
      id: "edit",
      node: (
        <AccessLink
          resource={CREDIT_NOTE_KIND.resource}
          action="update"
          to={paths.editCreditNote(note.id)}
          preload={preload}
          moduleText={lockedReason}
          icon="edit"
          label={t("creditNote.edit")}
          deniedReason={t("creditNote.editDenied")}
          record={note}
          lockReason={lock.reason}
        />
      ),
    },
    {
      id: "delete",
      node: (
        <InvoiceDeleteAction
          kind={CREDIT_NOTE_KIND}
          document={note}
          description={
            note.amendedFrom
              ? t("creditNote.delete.descriptionAmended")
              : t("creditNote.delete.description")
          }
          lockReason={lock.reason}
        />
      ),
    },
    {
      id: "print",
      node: (
        <Link
          to={paths.printCreditNote(note.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          <PrintIcon aria-hidden />
          {t("creditNote.print")}
        </Link>
      ),
    },
  ]
  return {
    title: titleOf(note),
    status: (
      <StatusBadge status={statuses.byId.get(note.status) ?? note.status} />
    ),
    fields: applyKeyedChanges(
      fields,
      mapKeyedChanges(noteExtension?.recordFields, (field) =>
        extensionFields.displayEntry(field, note),
      ),
    ),
    actions: applyKeyedChanges(actions, slotActions),
  }
}

/**
 * «Змінити» й «Друк» у палітрі команд (ADR-0044): права й причина ті самі, що в кнопок шапки. Поки права
 * невідомі, «Змінити» немає, як і кнопки.
 */
export function useCreditNotePaletteActions(
  note: CreditNote | undefined,
  lock: EditLock,
): PaletteAction[] {
  const t = useInvoicesT()
  const navigate = useNavigate()
  const { paths } = useInvoicesModule()
  const { canAccess, isPending, recordReason } = useDocumentAccess(
    CREDIT_NOTE_KIND,
    "update",
    note,
  )
  if (!note) return []
  const print: PaletteAction = {
    id: "print",
    label: t("creditNote.print"),
    icon: PrintIcon,
    onSelect: () => void navigate(paths.printCreditNote(note.id)),
  }
  if (isPending) return [print]
  const edit: PaletteAction = {
    id: "edit",
    label: t("creditNote.edit"),
    icon: ACTION_ICONS.edit,
    deniedReason: canAccess
      ? lock.reason
      : (recordReason ?? t("creditNote.editDenied")),
    onSelect: () => void navigate(paths.editCreditNote(note.id)),
  }
  return [edit, print]
}
