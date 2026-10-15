import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import { DeniedAction } from "@/registry/erp/permission-gate"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"

import type { Invoice } from "@/data/invoices"
import { invoiceHref, invoiceLinkState } from "@/router"

import { preloadPage } from "./lazy-pages"

/** Номер-посилання й дія «Редагувати» в рядку списку рахунків (колонки — invoice-columns.tsx). */

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

/** Номер — посилання на картку; адреса списку їде зі станом переходу для «До списку». */
export function InvoiceNumberLink({
  invoice,
  listSearch,
}: {
  invoice: Invoice
  listSearch: string
}) {
  const href = invoiceHref(invoice.id)
  const preload = () => {
    preloadPage(href)
  }
  return (
    <Link
      to={href}
      state={invoiceLinkState(listSearch)}
      onPointerEnter={preload}
      onFocus={preload}
      // Ціль дотику ≥ 24 px (WCAG 2.5.8): кнопка клієнта під номером у картці заходить на 4 px угору.
      className="touch-target relative inline-flex min-h-7 items-center font-medium tabular-nums underline underline-offset-4"
    >
      {invoice.number}
    </Link>
  )
}

/** SPEC §8.4: без права дія неактивна, але у фокусі й пояснює причину. */
export function InvoiceEditButton({
  label,
  canEdit,
  onEdit,
}: {
  label: string
  canEdit: boolean
  onEdit: () => void
}) {
  const t = usePageT()
  const Edit = ACTION_ICONS.edit
  if (canEdit) {
    return (
      <Button variant="ghost" size="icon" aria-label={label} onClick={onEdit}>
        <Edit aria-hidden />
      </Button>
    )
  }
  return (
    <DeniedAction
      variant="ghost"
      size="icon"
      aria-label={label}
      reason={t("readOnlyHint")}
    >
      <Edit aria-hidden />
    </DeniedAction>
  )
}
