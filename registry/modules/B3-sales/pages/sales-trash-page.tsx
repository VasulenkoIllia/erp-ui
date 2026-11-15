import { z } from "zod"

import { TrashPage } from "@/components/templates/trash-page"
import { isCalendarDate } from "@/lib/dates"

import { useSalesTrashLabel } from "../components/sales-trash-label"
import { useSalesModule } from "../module-context"
import { ORDER_KIND, QUOTE_KIND, type SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Що кошик бере з рядка списку: номер, у чернетки — клієнт і дата. */
const salesTrashRowSchema = z.object({
  number: z.string().nullable(),
  clientName: z.string(),
  // Дата, яку не розбере форматер, — рядок «Запис <id>», а не збій сторінки.
  date: z.string().refine(isCalendarDate),
})

/** Кошик пропозицій (PF16, ADR-0095). */
export function QuotesTrashPage() {
  return <SalesTrashPage kind={QUOTE_KIND} />
}

/** Кошик замовлень (PF16, ADR-0095). */
export function OrdersTrashPage() {
  return <SalesTrashPage kind={ORDER_KIND} />
}

/** Видалені чернетки документа продажу з «Відновити»; «Відкрити» після відновлення — картка. */
function SalesTrashPage({ kind }: { kind: SalesKindBase }) {
  const t = useSalesT()
  const { paths } = useSalesModule()
  const rowLabel = useSalesTrashLabel(kind)
  const { list, record } = kind.pathsOf(paths)
  return (
    <TrashPage
      resource={kind.resource}
      schema={salesTrashRowSchema}
      rowLabel={rowLabel}
      recordHref={record}
      listTitle={t(`${kind.keys.list}.title`)}
      listPath={list}
      backLabel={t(`${kind.keys.record}.back`)}
    />
  )
}
