import { useMemo } from "react"

import { DataTable } from "@/components/erp/data-table"
import { PageState } from "@/components/erp/page-state"
import { Badge } from "@/components/ui/badge"
import type { DataTableColumn } from "@/lib/data-table-core"

import type { Address, Organization } from "../contract"
import { useContactsT } from "../use-contacts-t"
import { DetailRowActions, type DetailRowAction } from "./detail-row-actions"
import type { DetailState } from "./organization-sections"

/**
 * Вкладка «Адреси» картки організації (ADR-0019, ADR-0028): адреси з детального запису. З правом
 * `organizations:update` — меню дій у рядку («Змінити», «Видалити»); без права — лише читання.
 */
export function OrganizationAddresses({
  organization,
  state,
  actions,
}: {
  organization: Organization
  state: DetailState
  /** Дії рядка; без них таблиця лише для читання. */
  actions?: (address: Address) => DetailRowAction[]
}) {
  const t = useContactsT()
  const columns = useAddressColumns(actions)
  return (
    <DataTable
      label={t("organization.addresses.tableLabel", {
        name: organization.name,
      })}
      columns={columns}
      getRowId={(address) => address.id}
      rows={state.detail?.addresses}
      isPending={state.isPending}
      error={state.error}
      onRetry={state.onRetry}
      countLabel={(count, value) =>
        t("organization.addresses.count", { count, value })
      }
      empty={
        <PageState kind="empty" title={t("organization.addresses.empty")} />
      }
    />
  )
}

function useAddressColumns(
  actions: ((address: Address) => DetailRowAction[]) | undefined,
): DataTableColumn<Address>[] {
  const t = useContactsT()
  return useMemo<DataTableColumn<Address>[]>(
    () => [
      {
        id: "kind",
        header: t("organization.addresses.columns.kind"),
        cell: (address) => (
          <Badge variant="outline">
            {t(`organization.addresses.kinds.${address.kind}`)}
          </Badge>
        ),
        minWidth: 8,
        card: "badge",
      },
      {
        id: "line",
        header: t("organization.addresses.columns.line"),
        cell: (address) => address.line,
        minWidth: 14,
        grow: 3,
        card: "title",
      },
      {
        id: "city",
        header: t("organization.addresses.columns.city"),
        cell: (address) => address.city,
        minWidth: 8,
      },
      {
        id: "postalCode",
        header: t("organization.addresses.columns.postalCode"),
        cell: (address) => (
          <span className="tabular-nums">{address.postalCode}</span>
        ),
        minWidth: 6,
        priority: 5,
      },
      ...(actions
        ? [
            {
              id: "actions",
              header: t("organization.detail.actions"),
              headerHidden: true,
              cell: (address: Address) => (
                <DetailRowActions
                  // Юридична й фактична адреси часто однакові: тип робить назву кнопки своєю.
                  label={t("organization.detail.actionsFor", {
                    name: `${t(`organization.addresses.kinds.${address.kind}`)}, ${address.line}`,
                  })}
                  actions={actions(address)}
                />
              ),
              minWidth: 3.5,
              grow: 0,
              align: "end" as const,
              card: "actions" as const,
            },
          ]
        : []),
    ],
    [t, actions],
  )
}
