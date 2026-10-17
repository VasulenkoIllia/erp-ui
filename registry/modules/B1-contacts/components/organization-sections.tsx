import { useMemo } from "react"

import { CopyableValue } from "@/components/erp/copyable-value"
import { DataTable } from "@/components/erp/data-table"
import { PageState } from "@/components/erp/page-state"
import { Badge } from "@/components/ui/badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { formatPhone } from "@/lib/phone"

import type {
  Address,
  BankAccount,
  Organization,
  OrganizationDetail,
} from "../contract"
import { useContactsT } from "../use-contacts-t"
import { codeLabelKey } from "./organization-columns"
import { RequisiteList } from "./requisite-list"

/**
 * Вкладки картки організації: реквізити з «Копіювати» (UI43), адреси й банківські рахунки з
 * детального запису (`GET /organizations/:id`, ADR-0019). Шапка картки є одразу з кешу списку, а
 * вкладені колекції — з відповіді картки: поки вона йде — скелетон вкладки, не вдалась — помилка
 * вкладки з повтором, а не сторінки (SPEC §8.1, стан 8).
 */

/** Стан вкладених колекцій для вкладки: дані, завантаження чи помилка з повтором. */
export interface DetailState {
  readonly detail: OrganizationDetail | undefined
  readonly isPending: boolean
  readonly error: unknown
  readonly onRetry: () => void
}

export function OrganizationRequisites({
  organization,
}: {
  organization: Organization
}) {
  const t = useContactsT()
  return (
    <RequisiteList
      items={[
        {
          id: "code",
          label: t(codeLabelKey(organization.type)),
          value: organization.code,
          kind: "code",
        },
        {
          id: "iban",
          label: t("organization.fields.iban"),
          value: organization.iban,
          kind: "iban",
        },
        {
          id: "phone",
          label: t("organization.fields.phone"),
          value: organization.phone,
          kind: "phone",
          display: formatPhone(organization.phone),
        },
        {
          id: "email",
          label: t("organization.fields.email"),
          value: organization.email,
          kind: "email",
        },
        {
          id: "city",
          label: t("organization.fields.city"),
          value: organization.city,
          kind: "text",
        },
      ]}
    />
  )
}

export function OrganizationAddresses({
  organization,
  state,
}: {
  organization: Organization
  state: DetailState
}) {
  const t = useContactsT()
  const columns = useMemo<DataTableColumn<Address>[]>(
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
    ],
    [t],
  )
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

export function OrganizationBankAccounts({
  organization,
  state,
}: {
  organization: Organization
  state: DetailState
}) {
  const t = useContactsT()
  const columns = useMemo<DataTableColumn<BankAccount>[]>(
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
    ],
    [t],
  )
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
