import { keepPreviousData } from "@tanstack/react-query"
import { useGetList } from "ra-core"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import { CopyableValue } from "@/registry/erp/copyable-value"
import { DataTable } from "@/registry/erp/data-table"
import { useCompanyId } from "@/registry/hooks/use-company"
import { companyScope } from "@/registry/lib/company-scope"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"

import type { Invoice } from "@/data/invoices"
import type { Organization } from "@/data/organizations"
import { invoiceHref } from "@/router"

import { InvoiceStatusBadge } from "./invoice-status"

/**
 * Вкладки картки організації (OrganizationPage): реквізити з «Копіювати» (UI43) і рахунки клієнта
 * сторінками. Вміст вкладки монтується, лише коли її відкрили (ADR-0024): рахунки не вантажаться,
 * доки не відкрито «Рахунки».
 */

const useCardT = () =>
  useTranslation("demo", { keyPrefix: "organizationPage" }).t

/** Реквізити: показ для людини, у буфер — як зберігається. */
export function OrganizationRequisites({
  organization,
}: {
  organization: Organization
}) {
  const t = useCardT()
  const rows = [
    {
      id: "code",
      label: t(organization.type === "fop" ? "rnokpp" : "edrpou"),
      value: organization.code,
      kind: "code",
    },
    { id: "iban", label: "IBAN", value: organization.iban, kind: "iban" },
    {
      id: "phone",
      label: t("phone"),
      value: organization.phone,
      kind: "phone",
    },
    { id: "email", label: "Email", value: organization.email, kind: "email" },
    { id: "city", label: t("city"), value: organization.city, kind: "text" },
  ] as const
  return (
    <div className="@container">
      <dl className="grid gap-x-6 gap-y-3 @xl:grid-cols-[max-content_1fr]">
        {rows.map((row) => (
          <div key={row.id} className="contents">
            <dt className="text-sm text-muted-foreground @xl:pt-1">
              {row.label}
            </dt>
            <dd className="-mt-2 @xl:mt-0">
              <CopyableValue
                label={row.label}
                value={row.value}
                kind={row.kind}
              />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const INVOICES = "invoices"
const INVOICES_PER_PAGE = 10
const INVOICE_SORT = { field: "date", order: "DESC" } as const

/** Рахунки клієнта (фільтр `client` за назвою), новіші першими, сторінками по 10. */
export function OrganizationInvoices({
  organization,
}: {
  organization: Organization
}) {
  const t = useCardT()
  const companyId = useCompanyId()
  const [page, setPage] = useState(1)
  const columns = useInvoiceColumns()
  const { data, total, isPending, isFetching, error, refetch } =
    useGetList<Invoice>(
      INVOICES,
      {
        pagination: { page, perPage: INVOICES_PER_PAGE },
        sort: INVOICE_SORT,
        filter: { client: organization.name },
        meta: companyScope(companyId),
      },
      { placeholderData: keepPreviousData },
    )
  const retry = () => {
    void refetch()
  }
  return (
    <DataTable
      label={t("invoicesLabel", { name: organization.name })}
      columns={columns}
      getRowId={(invoice) => invoice.id}
      rows={data}
      pagination={{
        page,
        perPage: INVOICES_PER_PAGE,
        total: total ?? data?.length ?? 0,
        onPageChange: setPage,
      }}
      isPending={isPending}
      isRefreshing={isFetching && !isPending}
      error={error}
      onRetry={retry}
      onRefresh={retry}
      countLabel={(count, value) => t("invoiceCount", { count, value })}
    />
  )
}

function useInvoiceColumns(): DataTableColumn<Invoice>[] {
  const t = useCardT()
  const format = useFormat()
  return useMemo(
    () => [
      {
        id: "number",
        header: t("invoiceColumns.number"),
        cell: (invoice) => (
          <Link
            to={invoiceHref(invoice.id)}
            className="touch-target relative inline-flex min-h-7 items-center font-medium tabular-nums underline underline-offset-4"
          >
            {invoice.number}
          </Link>
        ),
        minWidth: 9,
        card: "title",
      },
      {
        id: "date",
        header: t("invoiceColumns.date"),
        cell: (invoice) => format.date(invoice.date, "date"),
        minWidth: 8,
      },
      {
        id: "status",
        header: t("invoiceColumns.status"),
        cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
        minWidth: 10,
        card: "badge",
      },
      {
        id: "amount",
        header: t("invoiceColumns.amount"),
        cell: (invoice) =>
          format.money({ amount: invoice.amount, currency: invoice.currency }),
        align: "end",
        minWidth: 9,
      },
    ],
    [t, format],
  )
}
