import type { MouseEvent } from "react"

import { PinToggle } from "@/components/erp/pin-toggle"
import type { RecordField } from "@/components/erp/record-header"
import { StatusBadge } from "@/components/erp/status-badge"
import type {
  ObjectPageAction,
  ObjectPageHeader,
} from "@/components/templates/object-page"
import { useExtensionFields } from "@/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/lib/extensions"
import { formatPhone } from "@/lib/phone"
import type { ResolvedStatuses } from "@/lib/statuses"

import { ORGANIZATIONS, type Organization } from "../contract"
import type { OrganizationActionId, OrganizationFieldId } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { AccessAction } from "./access-action"
import { codeLabelKey, organizationName } from "./organization-columns"

/**
 * Шапка картки організації: назва, статус, ключові поля (код, тип, місто, телефон) з полями
 * розширення, «Змінити» (форма в діалозі), «Закріпити вгорі» й дії розширення; без запису — немає.
 */
export function useOrganizationHeader(
  organization: Organization | undefined,
  statuses: ResolvedStatuses,
  slotActions: KeyedChanges<ObjectPageAction, OrganizationActionId> | undefined,
  onEdit: (event: MouseEvent<HTMLButtonElement>) => void,
): ObjectPageHeader | undefined {
  const t = useContactsT()
  const { extension } = useContactsModule()
  const extensionFields = useExtensionFields(extension.organizations?.fields)
  if (!organization) return undefined
  const fields: (RecordField & { id: OrganizationFieldId })[] = [
    {
      id: "code",
      label: t(codeLabelKey(organization.type)),
      value: (
        <span className="font-mono tabular-nums">{organization.code}</span>
      ),
    },
    {
      id: "type",
      label: t("organization.fields.type"),
      value: t(`organization.types.${organization.type}`),
    },
    {
      id: "city",
      label: t("organization.fields.city"),
      value: organization.city,
    },
    {
      id: "phone",
      label: t("organization.fields.phone"),
      value: formatPhone(organization.phone),
    },
  ]
  const actions: (ObjectPageAction & { id: OrganizationActionId })[] = [
    {
      id: "edit",
      node: (
        <AccessAction
          resource={ORGANIZATIONS}
          action="update"
          icon="edit"
          label={t("organization.edit")}
          deniedReason={t("organization.editDenied")}
          onClick={onEdit}
        />
      ),
    },
    {
      id: "pin",
      node: (
        <PinToggle
          resource={ORGANIZATIONS}
          record={organization}
          name={organizationName(organization)}
          variant="button"
        />
      ),
    },
  ]
  return {
    title: organization.name,
    status: (
      <StatusBadge
        status={statuses.byId.get(organization.status) ?? organization.status}
      />
    ),
    fields: applyKeyedChanges(
      fields,
      mapKeyedChanges(extension.organizations?.recordFields, (field) =>
        extensionFields.displayEntry(field, organization),
      ),
    ),
    actions: applyKeyedChanges(actions, slotActions),
  }
}
