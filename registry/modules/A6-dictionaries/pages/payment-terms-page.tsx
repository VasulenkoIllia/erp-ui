import { CalendarClockIcon } from "lucide-react"
import { useMemo } from "react"

import { useFormat } from "@/lib/format"

import type { DictionaryColumn } from "../components/dictionary-columns"
import { DictionaryPage } from "../components/dictionary-page"
import { partsText } from "../components/payment-parts"
import { PaymentTermFormDialog } from "../components/payment-term-form"
import { PAYMENT_TERMS, type PaymentTerm } from "../contract"
import type { DictionaryFilterId, PaymentTermColumnId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"

interface PaymentTermIds {
  column: PaymentTermColumnId
  filter: DictionaryFilterId
  tab: never
}

/** Умови оплати (ADR-0047): частини оплати одним рядком. Сторінка — `DictionaryPage`. */
export function PaymentTermsPage() {
  const t = useDictionariesT()
  const format = useFormat()
  const { extension } = useDictionariesModule()
  const columns = useMemo(
    (): readonly DictionaryColumn<PaymentTerm, PaymentTermColumnId>[] => [
      {
        id: "parts",
        header: t("paymentTerms.columns.parts"),
        cell: (term) => partsText(term.parts, t, format),
        minWidth: 16,
        grow: 2,
      },
    ],
    [t, format],
  )
  return (
    <DictionaryPage<PaymentTerm, PaymentTermIds>
      resource={PAYMENT_TERMS}
      strings="paymentTerms"
      icon={CalendarClockIcon}
      columns={columns}
      extension={extension.paymentTerms}
      form={PaymentTermFormDialog}
    />
  )
}
