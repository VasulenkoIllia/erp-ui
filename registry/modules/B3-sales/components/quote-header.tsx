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

import type { Quote } from "../contract"
import type { QuoteActionId, QuoteFieldId } from "../extension"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"
import { AccessLink } from "./access-link"
import { useQuoteAccess } from "./quote-access"
import { QuoteDeleteAction } from "./quote-delete"
import { QuoteValidity, useQuoteTitle } from "./quote-display"

const PrintIcon = ACTION_ICONS.print

/** Клієнт пропозиції: посилання на його картку, якщо вона є в проекті, інакше — назва текстом. */
function QuoteClient({ quote }: { quote: Quote }) {
  const { clients } = useSalesModule()
  return clients.href ? (
    <Link
      to={clients.href(quote.clientId)}
      className="underline-offset-4 hover:underline focus-visible:underline"
    >
      {quote.clientName}
    </Link>
  ) : (
    quote.clientName
  )
}

/**
 * Шапка картки пропозиції: номер (чернетка — без номера), статус, ключові поля (клієнт, дата, «Дійсна
 * до», сума) з полями розширення, «Змінити» (сторінка форми, лише чернетка), «Видалити чернетку»,
 * «Друк» і дії розширення; без запису — немає.
 */
export function useQuoteHeader(
  quote: Quote | undefined,
  statuses: ResolvedStatuses,
  slotActions: KeyedChanges<ObjectPageAction, QuoteActionId> | undefined,
  lock: EditLock,
): ObjectPageHeader | undefined {
  const t = useSalesT()
  const format = useFormat()
  const titleOf = useQuoteTitle()
  const { extension, paths } = useSalesModule()
  const extensionFields = useExtensionFields(extension.quotes?.fields)
  if (!quote) return undefined
  const fields: (RecordField & { id: QuoteFieldId })[] = [
    {
      id: "client",
      label: t("quote.fields.client"),
      value: <QuoteClient quote={quote} />,
    },
    {
      id: "date",
      label: t("quote.fields.date"),
      value: format.date(quote.date, "date"),
    },
    {
      id: "validUntil",
      label: t("quote.fields.validUntil"),
      value: <QuoteValidity quote={quote} />,
    },
    {
      id: "total",
      label: t("quote.fields.total"),
      value: (
        <span className="tabular-nums">
          {format.money({ amount: quote.total, currency: quote.currency })}
        </span>
      ),
    },
  ]
  const actions: (ObjectPageAction & { id: QuoteActionId })[] = [
    {
      id: "edit",
      node: (
        <AccessLink
          action="update"
          to={paths.editQuote(quote.id)}
          icon="edit"
          label={t("quote.edit")}
          deniedReason={t("quote.editDenied")}
          record={quote}
          lockReason={lock.reason}
        />
      ),
    },
    {
      id: "delete",
      node: <QuoteDeleteAction quote={quote} lockReason={lock.reason} />,
    },
    {
      id: "print",
      node: (
        <Link
          to={paths.printQuote(quote.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          <PrintIcon aria-hidden />
          {t("quote.print")}
        </Link>
      ),
    },
  ]
  return {
    title: titleOf(quote),
    status: (
      <StatusBadge status={statuses.byId.get(quote.status) ?? quote.status} />
    ),
    fields: applyKeyedChanges(
      fields,
      mapKeyedChanges(extension.quotes?.recordFields, (field) =>
        extensionFields.displayEntry(field, quote),
      ),
    ),
    actions: applyKeyedChanges(actions, slotActions),
  }
}

/**
 * «Змінити» й «Друк» у палітрі команд (ADR-0044): права й причина ті самі, що в кнопок шапки. Поки
 * права невідомі, «Змінити» немає, як і кнопки.
 */
export function useQuotePaletteActions(
  quote: Quote | undefined,
  lock: EditLock,
): PaletteAction[] {
  const t = useSalesT()
  const navigate = useNavigate()
  const { paths } = useSalesModule()
  const { canAccess, isPending, recordReason } = useQuoteAccess("update", quote)
  if (!quote) return []
  const print: PaletteAction = {
    id: "print",
    label: t("quote.print"),
    icon: PrintIcon,
    onSelect: () => void navigate(paths.printQuote(quote.id)),
  }
  if (isPending) return [print]
  const edit: PaletteAction = {
    id: "edit",
    label: t("quote.edit"),
    icon: ACTION_ICONS.edit,
    deniedReason: canAccess
      ? lock.reason
      : (recordReason ?? t("quote.editDenied")),
    onSelect: () => void navigate(paths.editQuote(quote.id)),
  }
  return [edit, print]
}
