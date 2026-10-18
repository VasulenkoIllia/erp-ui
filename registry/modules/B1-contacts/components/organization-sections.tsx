import { formatPhone } from "@/lib/phone"

import type { Organization, OrganizationDetail } from "../contract"
import { useContactsT } from "../use-contacts-t"
import { codeLabelKey } from "./organization-columns"
import { RequisiteList } from "./requisite-list"
import { RecordSegments } from "./segments"

/**
 * Вкладка «Реквізити» картки організації з «Копіювати» (UI43) і стан вкладених колекцій для вкладок
 * «Адреси» й «Рахунки» (`organization-addresses`, `organization-bank-accounts`). Шапка картки є
 * одразу з кешу списку, а адреси й рахунки — з детального запису (`GET /organizations/:id`,
 * ADR-0019): поки він іде — скелетон вкладки, не вдався — помилка вкладки з повтором, а не сторінки
 * (SPEC §8.1, стан 8).
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
    <div className="space-y-4">
      <OrganizationRequisiteList organization={organization} />
      <RecordSegments
        label={t("organization.fields.segments")}
        ids={organization.segments}
      />
    </div>
  )
}

function OrganizationRequisiteList({
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
