import { PercentIcon } from "lucide-react"
import { useMemo } from "react"

import { useFormat } from "@/lib/format"

import type { DictionaryColumn } from "../components/dictionary-columns"
import { DictionaryPage } from "../components/dictionary-page"
import { percentText } from "../components/payment-parts"
import { TaxFormDialog } from "../components/tax-form"
import { TAXES, type Tax } from "../contract"
import type { DictionaryFilterId, TaxColumnId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"

interface TaxIds {
  column: TaxColumnId
  filter: DictionaryFilterId
  tab: never
}

/** Податки (ADR-0047): ставка й чи податок уже в ціні. Сторінка — `DictionaryPage`. */
export function TaxesPage() {
  const t = useDictionariesT()
  const format = useFormat()
  const { extension } = useDictionariesModule()
  const columns = useMemo(
    (): readonly DictionaryColumn<Tax, TaxColumnId>[] => [
      {
        id: "rate",
        header: t("taxes.columns.rate"),
        cell: (tax) => (
          <span className="tabular-nums">{percentText(format, tax.rate)}</span>
        ),
        align: "end",
        minWidth: 7,
        grow: 0,
      },
      {
        id: "included",
        header: t("taxes.columns.included"),
        cell: (tax) => t(tax.included ? "common.yes" : "common.no"),
        minWidth: 8,
        grow: 0,
      },
    ],
    [t, format],
  )
  return (
    <DictionaryPage<Tax, TaxIds>
      resource={TAXES}
      strings="taxes"
      icon={PercentIcon}
      columns={columns}
      extension={extension.taxes}
      form={TaxFormDialog}
    />
  )
}
