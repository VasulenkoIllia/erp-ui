import {
  DocumentFlow,
  type DocumentFlowType,
} from "@/components/erp/document-flow"

import { INVOICES } from "../contract"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { useInvoiceStatuses } from "./invoice-statuses"

/** Ресурси модуля B3, з яких виставляють рахунки: модуль не імпортується, лише назви (ADR-0070). */
const QUOTES = "quotes"
const ORDERS = "orders"

/**
 * Потік документів на картці рахунку (UI13, ADR-0061, ADR-0070): рахунки модуля зі статусами K2,
 * пропозиції й замовлення B3 — з посиланням на картку, коли проект дав їхні адреси (`sources`), і зі станом
 * документа кіта. Порядок і зв'язки («На підставі …», «Виправлена копія …», «Сторно …») дає сервер.
 */
export function InvoiceFlow({ id }: { id: string }) {
  const t = useInvoicesT()
  const { paths, sources } = useInvoicesModule()
  const statuses = useInvoiceStatuses()
  const types: Readonly<Record<string, DocumentFlowType>> = {
    [QUOTES]: { label: t("invoice.sources.quote"), href: sources.quote },
    [ORDERS]: { label: t("invoice.sources.order"), href: sources.order },
    [INVOICES]: { label: t("invoice.flow"), href: paths.invoice, statuses },
  }
  return <DocumentFlow resource={INVOICES} id={id} types={types} />
}
