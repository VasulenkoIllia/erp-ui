import {
  DocumentFlow,
  type DocumentFlowType,
} from "@/components/erp/document-flow"

import { CREDIT_NOTES, INVOICES } from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import { INVOICE_KIND } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { useDocumentStatuses } from "./invoice-statuses"

/** Ресурси модуля B3, з яких виставляють рахунки: модуль не імпортується, лише назви (ADR-0070). */
const QUOTES = "quotes"
const ORDERS = "orders"

/**
 * Потік документів на картці рахунку чи кредит-ноти (UI13, ADR-0061, ADR-0070, ADR-0072): рахунки й
 * кредит-ноти модуля зі статусами K2, пропозиції й замовлення B3 — з посиланням на картку, коли проект дав
 * їхні адреси (`sources`), і зі станом документа кіта. Порядок і зв'язки («На підставі …», «Виправлена
 * копія …», «Сторно …») дає сервер.
 */
export function InvoiceFlow({
  resource,
  id,
}: {
  resource: string
  id: string
}) {
  const t = useInvoicesT()
  const { paths, sources } = useInvoicesModule()
  const statuses = useDocumentStatuses(INVOICE_KIND)
  const noteStatuses = useDocumentStatuses(CREDIT_NOTE_KIND)
  const types: Readonly<Record<string, DocumentFlowType>> = {
    [QUOTES]: { label: t("invoice.sources.quote"), href: sources.quote },
    [ORDERS]: { label: t("invoice.sources.order"), href: sources.order },
    [INVOICES]: { label: t("invoice.flow"), href: paths.invoice, statuses },
    [CREDIT_NOTES]: {
      label: t("creditNote.flow"),
      href: paths.creditNote,
      statuses: noteStatuses,
    },
  }
  return <DocumentFlow resource={resource} id={id} types={types} />
}
