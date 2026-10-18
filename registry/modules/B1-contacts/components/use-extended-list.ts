import { useMemo } from "react"

import type { DataTableColumn } from "@/lib/data-table-core"
import {
  useExtensionFields,
  type ExtensionColumn,
  type ExtensionColumnChange,
  type ExtensionField,
  type ExtensionFilter,
  type ExtensionTab,
} from "@/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/lib/extensions"
import type { FilterDefinition } from "@/lib/filters"
import type { ListTab } from "@/lib/list-state"

/** Ключі модуля для списку сутності — ті самі, що в типі розширення (`OrganizationIds`…). */
interface ListIds {
  column: string
  filter: string
  tab: string
}

/** Те, що розширення змінює в списку сутності (ADR-0020). */
interface ListExtension<Ids extends ListIds> {
  readonly fields?: readonly ExtensionField[]
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    Ids["column"],
    ExtensionColumnChange
  >
  readonly filters?: KeyedChanges<ExtensionFilter, Ids["filter"]>
  readonly tabs?: KeyedChanges<ExtensionTab, Ids["tab"]>
}

interface ExtendedList<Row> {
  readonly columns: readonly DataTableColumn<Row>[]
  readonly filters: readonly FilterDefinition[]
  readonly tabs: readonly ListTab[]
}

/**
 * Колонки, фільтри й вкладки списку модуля зі змінами розширення проекту. Аргументи — стабільні між
 * рендерами (`useMemo` модуля, константа файлу розширення): від них залежить перебудова таблиці.
 * `locked` — колонки, яких розширення не ховає й не замінює (назва — посилання на картку).
 * `Ids` передається явно (`useExtendedList<Contact, ContactIds>`): ключ, якого немає в типах
 * розширення, — помилка TypeScript і в списках модуля.
 */
export function useExtendedList<Row, Ids extends ListIds>(
  columns: readonly (DataTableColumn<Row> & { id: Ids["column"] })[],
  filters: readonly (FilterDefinition & { id: Ids["filter"] })[],
  tabs: readonly (ListTab & { id: Ids["tab"] })[],
  extension: ListExtension<Ids> | undefined,
  locked: readonly Ids["column"][],
): ExtendedList<Row> {
  const fields = useExtensionFields(extension?.fields)
  return useMemo(
    () => ({
      columns: applyKeyedChanges(
        columns,
        mapKeyedChanges(extension?.columns, fields.column, fields.columnChange),
        { locked },
      ),
      filters: applyKeyedChanges(
        filters,
        mapKeyedChanges(extension?.filters, fields.filter),
      ),
      tabs: applyKeyedChanges(
        tabs,
        mapKeyedChanges(extension?.tabs, fields.tab),
      ),
    }),
    [columns, filters, tabs, extension, fields, locked],
  )
}
