import { z } from "zod"

import { TrashPage } from "@/components/templates/trash-page"

import { codeLabelKey } from "../components/organization-columns"
import { CONTACTS, ORGANIZATION_TYPES, ORGANIZATIONS } from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"

/** Що кошик бере з рядка списку організацій: назва й код за типом. */
const organizationTrashSchema = z.object({
  name: z.string(),
  type: z.enum(ORGANIZATION_TYPES),
  code: z.string(),
})

/** Що кошик бере з рядка списку контактів: ім'я й посада. */
const contactTrashSchema = z.object({
  name: z.string(),
  position: z.string().optional(),
})

/** Кошик організацій (PF16, ADR-0095): назва, під нею код; «Відкрити» після відновлення — картка. */
export function OrganizationsTrashPage() {
  const t = useContactsT()
  const { paths } = useContactsModule()
  return (
    <TrashPage
      resource={ORGANIZATIONS}
      schema={organizationTrashSchema}
      rowLabel={(organization) => organization.name}
      rowDescription={(organization) =>
        organization.code
          ? `${t(codeLabelKey(organization.type))} ${organization.code}`
          : undefined
      }
      recordHref={paths.organization}
      listTitle={t("organizations.title")}
      listPath={paths.organizations}
      backLabel={t("organization.back")}
    />
  )
}

/** Кошик контактів (PF16, ADR-0095): ім'я, під ним посада. */
export function ContactsTrashPage() {
  const t = useContactsT()
  const { paths } = useContactsModule()
  return (
    <TrashPage
      resource={CONTACTS}
      schema={contactTrashSchema}
      rowLabel={(contact) => contact.name}
      rowDescription={(contact) => contact.position || undefined}
      recordHref={paths.contact}
      listTitle={t("contacts.title")}
      listPath={paths.contacts}
      backLabel={t("contact.back")}
    />
  )
}
