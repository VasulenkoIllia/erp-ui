import { useQueryClient } from "@tanstack/react-query"
import { useCanAccess, useRefresh, useUpdate } from "ra-core"
import { useCallback, useId, useRef, useState } from "react"
import { toast } from "sonner"

import { RecordPicker } from "@/components/erp/record-picker"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useCompanyId } from "@/hooks/use-company"
import { isApiError } from "@/lib/api"
import { companyScope } from "@/lib/company-scope"
import { formatPhone } from "@/lib/phone"

import {
  CONTACTS,
  ORGANIZATIONS,
  type Contact,
  type Organization,
} from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { RecordLink } from "./navigation"
import { RequisiteList } from "./requisite-list"
import { RecordSegments } from "./segments"

/** Порядок варіантів вибору організації контакту. */
export const ORGANIZATION_SORT = { field: "name", order: "ASC" } as const

/** Другий рядок варіанта вибору організації: код за типом і місто. */
export function useOrganizationDescription() {
  const t = useContactsT()
  return useCallback(
    (organization: Organization) =>
      [
        t(`contact.organization.option.${organization.type}`, {
          code: organization.code,
        }),
        organization.city,
      ]
        .filter(Boolean)
        .join(" · "),
    [t],
  )
}

/** Подробиці контакту: телефон і email з «Копіювати» (UI43), посада, сегменти. */
export function ContactDetails({ contact }: { contact: Contact }) {
  const t = useContactsT()
  return (
    <div className="space-y-4">
      <RequisiteList
        items={[
          {
            id: "phone",
            label: t("contact.fields.phone"),
            value: contact.phone,
            kind: "phone",
            display: formatPhone(contact.phone),
          },
          {
            id: "email",
            label: t("contact.fields.email"),
            value: contact.email,
            kind: "email",
          },
          {
            id: "position",
            label: t("contact.fields.position"),
            value: contact.position,
            kind: "text",
          },
        ]}
      />
      <RecordSegments
        label={t("contact.fields.segments")}
        ids={contact.segments}
      />
    </div>
  )
}

/**
 * Організація, яку представляє контакт: вибір з пошуком на сервері (UI40, erp/record-picker) і
 * посилання на картку. Зміна — одразу збереженням з версією запису (ADR-0002): конфлікт чи збій —
 * сповіщення, а поле лишається зі збереженим значенням. Без права змінювати контакти — лише читання.
 */
export function ContactOrganizationSection({ contact }: { contact: Contact }) {
  const t = useContactsT()
  const { paths } = useContactsModule()
  const { canAccess = false, isPending: isAccessPending } = useCanAccess({
    resource: CONTACTS,
    action: "update",
  })
  const { save, isSaving } = useSaveOrganization(contact)
  const fieldId = useId()
  const describe = useOrganizationDescription()
  return (
    <div className="max-w-md space-y-3">
      {/* Поле не вимикається на час збереження: інакше фокус з нього зникає (WCAG 2.4.3). */}
      <Field aria-busy={isSaving}>
        <FieldLabel htmlFor={fieldId}>
          {t("contact.organization.label")}
        </FieldLabel>
        {/* Поки права невідомі — місце поля, а не «лише читання», що за мить стане вибором. */}
        {isAccessPending ? (
          <Skeleton className="h-control w-full" />
        ) : (
          <RecordPicker<Organization>
            id={fieldId}
            resource={ORGANIZATIONS}
            label={t("contact.organization.label")}
            value={contact.organizationId}
            onValueChange={save}
            optionLabel={(organization) => organization.name}
            optionDescription={describe}
            sort={ORGANIZATION_SORT}
            searchPlaceholder={t("contact.organization.searchPlaceholder")}
            clearable
            readOnly={!canAccess}
          />
        )}
      </Field>
      {contact.organizationId ? (
        <RecordLink to={paths.organization(contact.organizationId)}>
          {t("contact.organization.open")}
        </RecordLink>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("contact.organization.none")}
        </p>
      )}
    </div>
  )
}

function useSaveOrganization(contact: Contact) {
  const t = useContactsT()
  const errorMessage = useApiErrorMessage()
  const companyId = useCompanyId()
  const [update] = useUpdate<Contact>()
  const refresh = useRefresh()
  const queryClient = useQueryClient()
  const [isSaving, setSaving] = useState(false)
  // Другий вибір, поки йде перший запит, не надсилається: версія запису ще стара.
  const savingRef = useRef(false)
  const save = (organizationId: string | null) => {
    if (savingRef.current || organizationId === contact.organizationId) return
    savingRef.current = true
    setSaving(true)
    void update(
      CONTACTS,
      {
        id: contact.id,
        data: { organizationId, version: contact.version },
        previousData: contact,
        // Той самий ключ, що в запиту картки: ra-core оновить її кеш відповіддю сервера.
        meta: companyScope(companyId),
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          // pessimistic лише підміняє запис у кеші: вкладки «Представники» й «Приватні особи», їхні
          // лічильники й контактні особи організацій фільтрують за організацією — перечитати.
          void queryClient.invalidateQueries({ queryKey: [CONTACTS] })
          toast.success(
            t(
              organizationId
                ? "contact.organization.saved"
                : "contact.organization.cleared",
            ),
          )
        },
        onError: (error) => {
          toast.error(errorMessage(error))
          // Контакт змінив хтось інший: картка показує його версію, і вибір можна повторити.
          if (isApiError(error) && error.code === "conflict") refresh()
        },
        onSettled: () => {
          savingRef.current = false
          setSaving(false)
        },
      },
    )
  }
  return { save, isSaving }
}
