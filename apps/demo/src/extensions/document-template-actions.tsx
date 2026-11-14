import { Suspense } from "react"
import { FileTextIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { lazyWithPreload } from "@/registry/lib/lazy"
import type { Order, Quote } from "@/registry/modules/B3-sales"
import type { Invoice } from "@/registry/modules/K2-invoices"
import type { RecordSlotProps } from "@/registry/templates/object-page"
import { Button } from "@/registry/ui/button"

/**
 * Дія «Документ із шаблону» в розширеннях B3 і K2 (ADR-0087): розширення збирається на старті
 * застосунку, тож компонент дії лінивий, інакше генератор зі сторонами й діалогом потрапив би в перший
 * екран (ADR-0009). Поки чанк вантажиться, на місці дії неактивна кнопка з тим самим підписом: шапка
 * картки не зсувається.
 */

const slots = () => import("./document-template-slots")

const QuoteSlot = lazyWithPreload(() =>
  slots().then((module) => module.QuoteFromTemplate),
)
const OrderSlot = lazyWithPreload(() =>
  slots().then((module) => module.OrderFromTemplate),
)
const InvoiceSlot = lazyWithPreload(() =>
  slots().then((module) => module.InvoiceFromTemplate),
)

function ActionPlaceholder() {
  const t = useErpUiT()
  return (
    <Button variant="outline" disabled>
      <FileTextIcon aria-hidden />
      {t("documentGenerator.action")}
    </Button>
  )
}

export function QuoteFromTemplate(props: RecordSlotProps<Quote>) {
  return (
    <Suspense fallback={<ActionPlaceholder />}>
      <QuoteSlot {...props} />
    </Suspense>
  )
}

export function OrderFromTemplate(props: RecordSlotProps<Order>) {
  return (
    <Suspense fallback={<ActionPlaceholder />}>
      <OrderSlot {...props} />
    </Suspense>
  )
}

export function InvoiceFromTemplate(props: RecordSlotProps<Invoice>) {
  return (
    <Suspense fallback={<ActionPlaceholder />}>
      <InvoiceSlot {...props} />
    </Suspense>
  )
}
