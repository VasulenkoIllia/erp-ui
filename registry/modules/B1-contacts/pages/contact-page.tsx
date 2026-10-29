import { useAuthenticated } from "ra-core"
import { useState, type MouseEvent } from "react"
import { useParams } from "react-router"

import { AuditLog } from "@/components/erp/audit-log"
import { PageSkeleton } from "@/components/erp/page-state"
import { PinToggle } from "@/components/erp/pin-toggle"
import type { RecordField } from "@/components/erp/record-header"
import { BackToList } from "@/components/erp/record-link"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageAction,
  type ObjectPageHeader,
  type ObjectPageSectionItem,
} from "@/components/templates/object-page"
import { Badge } from "@/components/ui/badge"
import { useCardRecord } from "@/hooks/use-card-record"
import { useHistoryRefresh } from "@/hooks/use-history-refresh"
import { usePageHeading } from "@/hooks/use-page-heading"
import { useExtensionFields } from "@/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/lib/extensions"
import { formatPhone } from "@/lib/phone"

import { AccessAction, useOpener } from "../components/access-action"
import { contactName } from "../components/contact-columns"
import { ContactFormDialog, usePreloadForm } from "../components/form-dialogs"
import { ContactOrganization } from "../components/contact-organization"
import {
  ContactDetails,
  ContactOrganizationSection,
} from "../components/contact-sections"
import { CONTACTS, type Contact } from "../contract"
import type {
  ContactActionId,
  ContactFieldId,
  ContactSectionId,
} from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"

/**
 * Картка контакту на шаблоні Object Page (SPEC §7; ADR-0019): «Подробиці» з «Копіювати» (UI43) і
 * «Організація» з вибором компанії (UI40), секції розширення проекту; «Історія» з журналу аудиту
 * перечитується з новою версією запису; «Змінити» — форма в діалозі (ADR-0026).
 */
export function ContactPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <ContactCard key={id} id={id} />
  )
}

function ContactCard({ id }: { id: string }) {
  const t = useContactsT()
  const { extension, paths } = useContactsModule()
  const card = useCardRecord<Contact>(CONTACTS, id)
  const contact = card.record
  useHistoryRefresh(contact?.version)
  const heading = usePageHeading(
    contact?.name ?? t("contact.title"),
    !card.isPending || card.pageError !== undefined,
  )
  const slots = useRecordSlots({
    record: contact,
    resource: CONTACTS,
    sections: extension.contacts?.sections,
    actions: extension.contacts?.actions,
  })
  const [isEditing, setEditing] = useState(false)
  const opener = useOpener()
  usePreloadForm("contact", "update")
  const header = useContactHeader(contact, slots.actions, (event) => {
    opener.remember(event)
    setEditing(true)
  })
  const sections: (ObjectPageSectionItem & { id: ContactSectionId })[] = contact
    ? [
        {
          id: "details",
          title: t("contact.sections.details"),
          content: <ContactDetails contact={contact} />,
        },
        {
          id: "organization",
          title: t("contact.sections.organization"),
          content: <ContactOrganizationSection contact={contact} />,
        },
      ]
    : []
  return (
    <>
      <ObjectPage
        title={t("contact.title")}
        headingRef={heading}
        back={<BackToList to={paths.contacts} label={t("contact.back")} />}
        isPending={card.isPending}
        error={card.pageError}
        onRetry={card.retry}
        header={header}
        sections={applyKeyedChanges(sections, slots.sections)}
        // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
        aside={
          extension.contacts?.history === false
            ? undefined
            : {
                label: t("contact.history"),
                content: (
                  <AuditLog
                    filter={{ targetType: CONTACTS, targetId: id }}
                    filters={false}
                    exportable={false}
                    perPage={10}
                  />
                ),
              }
        }
      />
      {isEditing && contact ? (
        <ContactFormDialog
          contact={contact}
          finalFocus={opener.ref}
          onClose={() => {
            setEditing(false)
          }}
          onSaved={() => {
            setEditing(false)
          }}
        />
      ) : null}
    </>
  )
}

/** Шапка: ім'я, «Приватна особа», організація, посада, телефон, email і поля розширення. */
function useContactHeader(
  contact: Contact | undefined,
  slotActions: KeyedChanges<ObjectPageAction, ContactActionId> | undefined,
  onEdit: (event: MouseEvent<HTMLButtonElement>) => void,
): ObjectPageHeader | undefined {
  const t = useContactsT()
  const { extension } = useContactsModule()
  const extensionFields = useExtensionFields(extension.contacts?.fields)
  if (!contact) return undefined
  const fields: (RecordField & { id: ContactFieldId })[] = [
    {
      id: "organization",
      label: t("contact.fields.organization"),
      value: <ContactOrganization id={contact.organizationId} />,
    },
    {
      id: "position",
      label: t("contact.fields.position"),
      value: contact.position,
    },
    {
      id: "phone",
      label: t("contact.fields.phone"),
      value: formatPhone(contact.phone),
    },
    { id: "email", label: t("contact.fields.email"), value: contact.email },
  ]
  const actions: (ObjectPageAction & { id: ContactActionId })[] = [
    {
      id: "edit",
      node: (
        <AccessAction
          resource={CONTACTS}
          action="update"
          icon="edit"
          label={t("contact.edit")}
          deniedReason={t("contact.editDenied")}
          record={contact}
          onClick={onEdit}
        />
      ),
    },
    {
      id: "pin",
      node: (
        <PinToggle
          resource={CONTACTS}
          record={contact}
          name={contactName(contact)}
          variant="button"
        />
      ),
    },
  ]
  return {
    title: contact.name,
    status:
      contact.organizationId === null ? (
        <Badge variant="outline">{t("contact.private")}</Badge>
      ) : undefined,
    fields: applyKeyedChanges(
      fields,
      mapKeyedChanges(extension.contacts?.recordFields, (field) =>
        extensionFields.displayEntry(field, contact),
      ),
    ),
    actions: applyKeyedChanges(actions, slotActions),
  }
}
