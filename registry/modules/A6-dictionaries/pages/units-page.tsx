import { RulerIcon } from "lucide-react"
import { useMemo } from "react"

import type { DictionaryColumn } from "../components/dictionary-columns"
import { DictionaryPage } from "../components/dictionary-page"
import { UnitFormDialog } from "../components/unit-form"
import { UNITS, type Unit } from "../contract"
import type { DictionaryFilterId, UnitColumnId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"

interface UnitIds {
  column: UnitColumnId
  filter: DictionaryFilterId
  tab: never
}

/** Одиниці виміру (ADR-0047): скорочення й знаки після коми. Сторінка — `DictionaryPage`. */
export function UnitsPage() {
  const t = useDictionariesT()
  const { extension } = useDictionariesModule()
  const columns = useMemo(
    (): readonly DictionaryColumn<Unit, UnitColumnId>[] => [
      {
        id: "shortName",
        header: t("units.columns.shortName"),
        cell: (unit) => unit.shortName,
        minWidth: 7,
        grow: 0,
      },
      {
        id: "decimals",
        header: t("units.columns.decimals"),
        cell: (unit) => <span className="tabular-nums">{unit.decimals}</span>,
        align: "end",
        minWidth: 8,
        grow: 0,
      },
    ],
    [t],
  )
  return (
    <DictionaryPage<Unit, UnitIds>
      resource={UNITS}
      strings="units"
      icon={RulerIcon}
      columns={columns}
      extension={extension.units}
      form={UnitFormDialog}
    />
  )
}
