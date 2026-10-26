import { keepPreviousData } from "@tanstack/react-query"
import { useGetList } from "ra-core"
import { useMemo, useState } from "react"

import { DataTable } from "@/components/erp/data-table"
import { PageState } from "@/components/erp/page-state"
import { RecordLink } from "@/components/erp/record-link"
import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"
import type { DataTableColumn } from "@/lib/data-table-core"
import { formatPhone } from "@/lib/phone"

import { CONTACTS, type Contact, type Organization } from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { cellText } from "./cell-text"

const CONTACTS_PER_PAGE = 10
const CONTACT_SORT = { field: "name", order: "ASC" } as const

/**
 * Контактні особи організації (`GET /contacts?organizationId=<id>`) сторінками по 10; ім'я —
 * посилання на картку контакту. Вкладка монтується, лише коли її відкрили: запиту до того немає.
 */
export function OrganizationContacts({
  organization,
}: {
  organization: Organization
}) {
  const t = useContactsT()
  const companyId = useCompanyId()
  const [page, setPage] = useState(1)
  const columns = useOrganizationContactColumns()
  const { data, total, isPending, isFetching, error, refetch } =
    useGetList<Contact>(
      CONTACTS,
      {
        pagination: { page, perPage: CONTACTS_PER_PAGE },
        sort: CONTACT_SORT,
        filter: { organizationId: organization.id },
        meta: companyScope(companyId),
      },
      { placeholderData: keepPreviousData },
    )
  const retry = () => {
    void refetch()
  }
  return (
    <DataTable
      label={t("organization.contacts.tableLabel", { name: organization.name })}
      columns={columns}
      getRowId={(contact) => contact.id}
      rows={data}
      pagination={{
        page,
        perPage: CONTACTS_PER_PAGE,
        total: total ?? data?.length ?? 0,
        onPageChange: setPage,
      }}
      isPending={isPending}
      isRefreshing={isFetching && !isPending}
      error={error}
      onRetry={retry}
      onRefresh={retry}
      countLabel={(count, value) =>
        t("organization.contacts.count", { count, value })
      }
      empty={
        <PageState kind="empty" title={t("organization.contacts.empty")} />
      }
    />
  )
}

function useOrganizationContactColumns(): DataTableColumn<Contact>[] {
  const t = useContactsT()
  const { paths, preload } = useContactsModule()
  return useMemo(
    () => [
      {
        id: "name",
        header: t("organization.contacts.columns.name"),
        cell: (contact) => (
          <RecordLink to={paths.contact(contact.id)} preload={preload}>
            {contact.name}
          </RecordLink>
        ),
        minWidth: 12,
        grow: 2,
        card: "title",
      },
      {
        id: "position",
        header: t("organization.contacts.columns.position"),
        cell: (contact) => contact.position,
        minWidth: 10,
        card: "subtitle",
      },
      {
        id: "phone",
        header: t("organization.contacts.columns.phone"),
        cell: (contact) => (
          <span className="tabular-nums">
            {cellText(formatPhone(contact.phone))}
          </span>
        ),
        minWidth: 10,
      },
      {
        id: "email",
        header: t("organization.contacts.columns.email"),
        cell: (contact) => cellText(contact.email),
        minWidth: 12,
        priority: 5,
      },
    ],
    [t, paths, preload],
  )
}
