import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import { usePinColumn } from "@/components/erp/pin-toggle"
import type { DataTableColumn } from "@/lib/data-table-core"
import { formatPhone } from "@/lib/phone"
import type { ResolvedStatuses } from "@/lib/statuses"

import {
  ORGANIZATIONS,
  type Organization,
  type OrganizationType,
} from "../contract"
import type { OrganizationColumnId } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { cellText } from "./cell-text"
import { useResponsible } from "./responsible"
import { SegmentBadges, useSegments } from "./segments"

type OrganizationColumn = DataTableColumn<Organization> & {
  id: OrganizationColumnId
}

export const organizationName = (organization: Organization) =>
  organization.name

/** Підпис коду за типом: ЄДРПОУ юрособи, РНОКПП ФОП. */
export const codeLabelKey = (type: OrganizationType) =>
  type === "fop" ? "organization.fields.rnokpp" : "organization.fields.edrpou"

/**
 * Колонки списку організацій: закріплення, назва-посилання на картку, статус, код, сегменти, місто,
 * відповідальний, телефон; на телефоні — картки (назва, статус-бейдж). Ключі — `OrganizationColumnId`.
 */
export function useOrganizationColumns(
  statuses: ResolvedStatuses,
): readonly OrganizationColumn[] {
  const t = useContactsT()
  const { paths, preload } = useContactsModule()
  const segments = useSegments()
  const { column: responsible } = useResponsible()
  const pin = usePinColumn<Organization>({
    resource: ORGANIZATIONS,
    name: organizationName,
  })
  return useMemo(
    () => [
      { ...pin, id: "pin" },
      {
        id: "name",
        header: t("organizations.columns.name"),
        cell: (organization) => (
          <RecordLink
            to={paths.organization(organization.id)}
            preload={preload}
            fromList
          >
            {organization.name}
          </RecordLink>
        ),
        sortField: "name",
        minWidth: 14,
        grow: 3,
        sticky: true,
        card: "title",
      },
      {
        id: "status",
        header: t("organizations.columns.status"),
        cell: (organization) => (
          <StatusBadge
            status={
              statuses.byId.get(organization.status) ?? organization.status
            }
          />
        ),
        minWidth: 9,
        card: "badge",
      },
      {
        id: "code",
        header: t("organizations.columns.code"),
        cell: (organization) => (
          <span className="font-mono tabular-nums">{organization.code}</span>
        ),
        sortField: "code",
        minWidth: 9,
      },
      {
        id: "segments",
        header: t("organizations.columns.segments"),
        cell: (organization) => (
          <SegmentBadges ids={organization.segments} segments={segments} />
        ),
        minWidth: 10,
        priority: 6,
        overflow: "wrap",
      },
      {
        id: "city",
        header: t("organizations.columns.city"),
        cell: (organization) => cellText(organization.city),
        sortField: "city",
        minWidth: 8,
        priority: 5,
        overflow: "wrap",
      },
      responsible,
      {
        id: "phone",
        header: t("organizations.columns.phone"),
        cell: (organization) => (
          <span className="tabular-nums">
            {cellText(formatPhone(organization.phone))}
          </span>
        ),
        minWidth: 10,
        priority: 7,
        overflow: "wrap",
      },
    ],
    [t, pin, paths, preload, segments, statuses, responsible],
  )
}
