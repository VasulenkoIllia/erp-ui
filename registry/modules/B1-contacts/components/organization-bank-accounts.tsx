import { useMemo } from "react"

import { CopyableValue } from "@/components/erp/copyable-value"
import { DataTable } from "@/components/erp/data-table"
import { PageState } from "@/components/erp/page-state"
import { Badge } from "@/components/ui/badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { formatIban } from "@/lib/ua-ids"

import type { BankAccount, Organization } from "../contract"
import { useContactsT } from "../use-contacts-t"
import { DetailRowActions, type DetailRowAction } from "./detail-row-actions"
import type { DetailState } from "./organization-sections"

/**
 * Вкладка «Рахунки» картки організації (ADR-0019, ADR-0028): рахунки з детального запису, основний
 * — з позначкою. З правом `organizations:update` — меню дій у рядку («Змінити», «Зробити основним»,
 * «Видалити»); без права — лише читання.
 */
export function OrganizationBankAccounts({
  organization,
  state,
  actions,
}: {
  organization: Organization
  state: DetailState
  /** Дії рядка; без них таблиця лише для читання. */
  actions?: (account: BankAccount) => DetailRowAction[]
}) {
  const t = useContactsT()
  const columns = useBankAccountColumns(actions)
  return (
    <DataTable
      label={t("organization.bankAccounts.tableLabel", {
        name: organization.name,
      })}
      columns={columns}
      getRowId={(account) => account.id}
      rows={state.detail?.bankAccounts}
      isPending={state.isPending}
      error={state.error}
      onRetry={state.onRetry}
      countLabel={(count, value) =>
        t("organization.bankAccounts.count", { count, value })
      }
      empty={
        <PageState kind="empty" title={t("organization.bankAccounts.empty")} />
      }
    />
  )
}

function useBankAccountColumns(
  actions: ((account: BankAccount) => DetailRowAction[]) | undefined,
): DataTableColumn<BankAccount>[] {
  const t = useContactsT()
  return useMemo<DataTableColumn<BankAccount>[]>(
    () => [
      {
        id: "iban",
        header: t("organization.bankAccounts.columns.iban"),
        cell: (account) => (
          <CopyableValue
            label={t("organization.bankAccounts.columns.iban")}
            value={account.iban}
            kind="iban"
          />
        ),
        // IBAN групами по 4 — 34 знаки з кнопкою в один рядок.
        minWidth: 24,
        grow: 3,
        card: "title",
      },
      {
        id: "primary",
        header: t("organization.bankAccounts.primary"),
        headerHidden: true,
        cell: (account) =>
          account.primary ? (
            <Badge variant="info">
              {t("organization.bankAccounts.primary")}
            </Badge>
          ) : null,
        minWidth: 7,
        card: "badge",
      },
      {
        id: "bankName",
        header: t("organization.bankAccounts.columns.bankName"),
        cell: (account) => account.bankName,
        minWidth: 12,
        grow: 2,
      },
      {
        id: "currency",
        header: t("organization.bankAccounts.columns.currency"),
        cell: (account) => account.currency,
        minWidth: 6,
      },
      ...(actions
        ? [
            {
              id: "actions",
              header: t("organization.detail.actions"),
              headerHidden: true,
              cell: (account: BankAccount) => (
                <DetailRowActions
                  label={t("organization.detail.actionsFor", {
                    name: formatIban(account.iban),
                  })}
                  actions={actions(account)}
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
