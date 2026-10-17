import { useGetManyAggregate } from "ra-core"

import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"

import { ORGANIZATIONS, type Organization } from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { RecordLink } from "./navigation"

/**
 * Організація контакту посиланням на її картку: назви рядків сторінки — одним запитом
 * (`useGetManyAggregate` → `GET /organizations?id=…&id=…`). Приватна особа — підпис; організацію
 * видалили — «не знайдено», а не порожнє місце; запит не вдався (немає права, збій, офлайн) —
 * «не вдалося завантажити», а не «видалили».
 */
export function ContactOrganization({ id }: { id: string | null }) {
  const t = useContactsT()
  const { paths } = useContactsModule()
  const companyId = useCompanyId()
  const { data, isPending, isError } = useGetManyAggregate<Organization>(
    ORGANIZATIONS,
    { ids: id === null ? [] : [id], meta: companyScope(companyId) },
    { enabled: id !== null },
  )
  if (id === null)
    return <span className="text-muted-foreground">{t("contact.private")}</span>
  const organization = data?.find((item) => item.id === id)
  if (organization)
    return (
      <RecordLink to={paths.organization(id)}>{organization.name}</RecordLink>
    )
  if (isPending) return null
  return (
    <span className="text-muted-foreground">
      {t(
        isError
          ? "contact.organization.unavailable"
          : "contact.organization.missing",
      )}
    </span>
  )
}
