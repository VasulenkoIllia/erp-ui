import { useGetManyAggregate } from "ra-core"

import { RecordLink } from "@/components/erp/record-link"
import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"

import { ORGANIZATIONS, type Organization } from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { useOwnScope } from "./responsible"

/**
 * Підпис організації, якої сервер не віддав людині, що бачить лише свої організації (ADR-0039):
 * «прихована». Чужу й видалену сервер не розрізняє, тож це вибір тексту, а не правило доступу.
 */
export function useHiddenOrganizationText(): string | undefined {
  const t = useContactsT()
  return useOwnScope(ORGANIZATIONS, "read")
    ? t("contact.organization.hidden")
    : undefined
}

/** Організація контакту за `id`: назви рядків сторінки — одним запитом. */
export function useContactOrganization(id: string | null) {
  const companyId = useCompanyId()
  const { data, isPending, isError } = useGetManyAggregate<Organization>(
    ORGANIZATIONS,
    { ids: id === null ? [] : [id], meta: companyScope(companyId) },
    { enabled: id !== null },
  )
  return {
    organization: data?.find((item) => item.id === id),
    isPending,
    isError,
  }
}

/**
 * Організація контакту посиланням на її картку: назви рядків сторінки — одним запитом
 * (`useGetManyAggregate` → `GET /organizations?id=…&id=…`). Приватна особа — підпис; організацію
 * видалили — «не знайдено», а не порожнє місце; людина бачить лише свої організації — «прихована»;
 * запит не вдався (немає права, збій, офлайн) — «не вдалося завантажити», а не «видалили».
 */
export function ContactOrganization({
  id,
  link = true,
}: {
  id: string | null
  /** Назва посиланням на картку; без нього — текстом (порівняння в діалозі конфлікту). */
  link?: boolean
}) {
  const t = useContactsT()
  const { paths, preload } = useContactsModule()
  const { organization, isPending, isError } = useContactOrganization(id)
  const hidden = useHiddenOrganizationText()
  if (id === null)
    return <span className="text-muted-foreground">{t("contact.private")}</span>
  if (organization)
    return link ? (
      <RecordLink to={paths.organization(id)} preload={preload}>
        {organization.name}
      </RecordLink>
    ) : (
      organization.name
    )
  if (isPending) return null
  return (
    <span className="text-muted-foreground">
      {isError
        ? t("contact.organization.unavailable")
        : (hidden ?? t("contact.organization.missing"))}
    </span>
  )
}
