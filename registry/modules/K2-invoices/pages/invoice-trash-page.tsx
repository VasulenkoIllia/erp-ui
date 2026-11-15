import { z } from "zod"

import { TrashPage } from "@/components/templates/trash-page"

import { useDocumentTrashLabel } from "../components/document-trash-label"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import type { K2DocumentKind } from "../document-kind"
import { INVOICE_KIND } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Що кошик бере з рядка списку: номер, у чернетки — клієнт і дата. */
const documentTrashRowSchema = z.object({
  number: z.string().nullable(),
  clientName: z.string(),
  date: z.string(),
})

/** Кошик рахунків (PF16, ADR-0095). */
export function InvoicesTrashPage() {
  return <DocumentTrashPage kind={INVOICE_KIND} title="invoices.title" />
}

/** Кошик кредит-нот (PF16, ADR-0095). */
export function CreditNotesTrashPage() {
  return <DocumentTrashPage kind={CREDIT_NOTE_KIND} title="creditNotes.title" />
}

/** Видалені чернетки рахунків чи кредит-нот з «Відновити»; «Відкрити» після відновлення — картка. */
function DocumentTrashPage({
  kind,
  title,
}: {
  kind: K2DocumentKind
  title: "invoices.title" | "creditNotes.title"
}) {
  const t = useInvoicesT()
  const { paths } = useInvoicesModule()
  const rowLabel = useDocumentTrashLabel(kind.key)
  const { list, record } = kind.pathsOf(paths)
  return (
    <TrashPage
      resource={kind.resource}
      schema={documentTrashRowSchema}
      rowLabel={rowLabel}
      recordHref={record}
      listTitle={t(title)}
      listPath={list}
      backLabel={t(`${kind.key}.back`)}
    />
  )
}
