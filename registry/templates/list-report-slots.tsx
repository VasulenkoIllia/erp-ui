import * as React from "react"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { PermissionGate } from "@/registry/erp/permission-gate"
import { useMe } from "@/registry/hooks/use-me"
import type { RowSelection } from "@/registry/hooks/use-row-selection"
import type { FilterValue } from "@/registry/lib/api"
import { hasPermission } from "@/registry/lib/auth"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type Keyed,
  type KeyedChanges,
} from "@/registry/lib/extensions"
import { useErpUiT } from "@/registry/lib/i18n"
import type {
  ListReportBulk,
  ListReportBulkAction,
  ListReportState,
} from "@/registry/templates/list-report"

/**
 * Дії розширення в списку (ADR-0020 п. 2, ADR-0086): дія в рядку й масова дія — компоненти проекту в
 * слотах шаблону List Report, як дії шапки картки (`useRecordSlots`).
 *
 * - Дія рядка стає в колонку «Дії» в кінці таблиці (на телефоні — дії картки): компонент отримує запис і
 *   ресурс. Немає дій — немає й колонки.
 * - Масова дія стає в панель вибраного поруч із діями модуля: розширення додає свою, ховає чи переставляє
 *   дію модуля за ключем. Компонент отримує ресурс, вибір, кількість вибраних і фільтр списку (вибір «усі
 *   за фільтром» — запит із ним); діалог дії — у самому компоненті, панель зникає разом із вибором.
 * - Дія з `access` видна лише з правом на дію ресурсу (у дії рядка — і коли запис її не забороняє,
 *   `deniedActions`, ADR-0037); показати неактивною з причиною (SPEC §8.4) компонент може сам
 *   (`useRecordAccess`, `DeniedAction`). Дії без права немає ще до таблиці: ні колонки «Дії», ні
 *   вибору рядків заради неї; поки права не відомі — теж. Збій компонента прибирає лише його дію.
 */

/** Що отримує дія рядка: запис і ресурс API, як секція чи дія картки (`RecordSlotProps`). */
export interface ListRowSlotProps<T> {
  readonly record: T
  readonly resource: string
}

/** Дія в рядку списку з компонентом проекту. */
export interface ExtensionRowAction<T> extends Keyed {
  readonly component: React.ComponentType<ListRowSlotProps<T>>
  /** Дія ресурсу, на яку потрібне право: `approve` (не `invoices:approve`). */
  readonly access?: string
}

/** Що отримує масова дія: ресурс, вибір, скільки вибрано й фільтр списку. */
export interface BulkSlotProps {
  readonly resource: string
  readonly selection: RowSelection
  /** Скільки вибрано; «усі за фільтром» — усі. */
  readonly count: number
  /** Фільтр списку: з вибором «усі за фільтром» запит іде з ним, а не з ключами. */
  readonly filter: Readonly<Record<string, FilterValue>>
}

/** Масова дія панелі вибраного з компонентом проекту. */
export interface ExtensionBulkAction extends Keyed {
  readonly component: React.ComponentType<BulkSlotProps>
  /** Дія ресурсу, на яку потрібне право: `approve` (не `invoices:approve`). */
  readonly access?: string
}

/**
 * Дії списку з розширення. `B` — ключі масових дій модуля; дій рядка в модулів немає, тож нова стає
 * лише на початок чи в кінець (`never`).
 */
export interface ListSlotsExtension<T, B extends string = string> {
  readonly rowActions?: KeyedChanges<ExtensionRowAction<T>, never>
  readonly bulkActions?: KeyedChanges<ExtensionBulkAction, B>
}

/** Ключ колонки дій рядка: ключів колонок модуля він не повторює. */
export const ROW_ACTIONS_COLUMN = "extensionRowActions"

const hideFailed = () => null

/**
 * Колонки й масові дії списку модуля з діями розширення. `columns` — стабільні (`useMemo` модуля):
 * новий масив перебудовує таблицю. `bulk` модуля — з рядком вибору (`rowLabel`) навіть без своїх дій:
 * масова дія розширення вмикає вибір рядків; без дій зовсім — `undefined`, вибору немає.
 */
export function useListSlots<T, B extends string>(
  report: Pick<ListReportState, "resource" | "selection" | "list">,
  columns: readonly DataTableColumn<T>[],
  bulk: ListReportBulk<T> & {
    readonly actions: readonly (ListReportBulkAction & { id: B })[]
  },
  // Ключі — з дій модуля: ключ розширення, якого модуль не має, — помилка типу, а не тихий пропуск.
  extension: ListSlotsExtension<T, NoInfer<B>> | undefined,
): {
  columns: readonly DataTableColumn<T>[]
  bulk: ListReportBulk<T> | undefined
} {
  const t = useErpUiT()
  const { resource, selection, list } = report
  const filter = list.queryFilter
  const permissions = useMe().data?.permissions
  const rowActions = extension?.rowActions
  const withRowActions = React.useMemo(() => {
    const actions = applyKeyedChanges<ExtensionRowAction<T>>(
      [],
      permittedChanges(rowActions, resource, permissions),
    )
    if (!actions.length) return columns
    const column: DataTableColumn<T> = {
      id: ROW_ACTIONS_COLUMN,
      header: t("rowActions.column"),
      headerHidden: true,
      cell: (record) => (
        <div className="flex flex-wrap justify-end gap-1">
          {actions.map(({ id, access, component: Slot }) => {
            const node = (
              <ErrorBoundary fallback={hideFailed}>
                <Slot record={record} resource={resource} />
              </ErrorBoundary>
            )
            return (
              <React.Fragment key={id}>
                {access ? (
                  <PermissionGate
                    resource={resource}
                    action={access}
                    record={record}
                  >
                    {node}
                  </PermissionGate>
                ) : (
                  node
                )}
              </React.Fragment>
            )
          })}
        </div>
      ),
      minWidth: 8,
      grow: 0,
      align: "end",
      card: "actions",
    }
    return [...columns, column]
  }, [columns, rowActions, resource, permissions, t])
  const actions = applyKeyedChanges<
    ListReportBulkAction & { id: B },
    ListReportBulkAction
  >(
    bulk.actions,
    mapKeyedChanges(
      permittedChanges(extension?.bulkActions, resource, permissions),
      ({ id, component }) => ({
        id,
        render: (count: number) => (
          <BulkSlot
            component={component}
            resource={resource}
            selection={selection}
            count={count}
            filter={filter}
          />
        ),
      }),
    ),
  )
  return {
    columns: withRowActions,
    bulk: actions.length ? { ...bulk, actions } : undefined,
  }
}

/** Зміни без нових дій, на які немає права (`access`); поки права не відомі — без усіх таких. */
function permittedChanges<
  A extends Keyed & { readonly access?: string },
  K extends string,
>(
  changes: KeyedChanges<A, K> | undefined,
  resource: string,
  permissions: readonly string[] | undefined,
): KeyedChanges<A, K> | undefined {
  if (!changes?.add) return changes
  return {
    ...changes,
    add: changes.add.filter(
      ({ access }) =>
        !access ||
        (permissions !== undefined &&
          hasPermission(permissions, resource, access)),
    ),
  }
}

function BulkSlot({
  component: Slot,
  ...props
}: BulkSlotProps & Pick<ExtensionBulkAction, "component">) {
  return (
    <ErrorBoundary fallback={hideFailed}>
      <Slot {...props} />
    </ErrorBoundary>
  )
}
