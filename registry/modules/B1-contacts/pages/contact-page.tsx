import { useAuthenticated } from "ra-core"
import { useState, type MouseEvent } from "react"
import { useParams } from "react-router"

import { EditLockNotice } from "@/components/erp/edit-lock-notice"
import { PageSkeleton } from "@/components/erp/page-state"
import { PinToggle } from "@/components/erp/pin-toggle"
import type { RecordField } from "@/components/erp/record-header"
import { RecordHistory } from "@/components/erp/record-history"
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
import { useEditLock, type EditLock } from "@/hooks/use-edit-lock"
import { useHistoryRefresh } from "@/hooks/use-history-refresh"
import { usePageHeading } from "@/hooks/use-page-heading"
import { usePaletteActions } from "@/hooks/use-palette-actions"
import { useExtensionFields } from "@/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/lib/extensions"
import { formatPhone } from "@/lib/phone"

import {
  AccessAction,
  useAccessPaletteAction,
  useOpener,
} from "../components/access-action"
import { contactName } from "../components/contact-columns"
import { ContactFormDialog, usePreloadForm } from "../components/form-dialogs"
import { ContactOrganization } from "../components/contact-organization"
import {
  ContactDetails,
  ContactOrganizationSection,
} from "../components/contact-sections"
import {
  useLeaveAfterTransfer,
  useResponsible,
} from "../components/responsible"
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
 * перечитується з новою версією запису, її місце може зайняти стрічка зі слота `aside` (ADR-0054);
 * «Змінити» — форма в діалозі (ADR-0026).
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
  const leaveAfterTransfer = useLeaveAfterTransfer(CONTACTS, paths.contacts)
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
    aside: extension.contacts?.aside,
  })
  const [isEditing, setEditing] = useState(false)
  const opener = useOpener()
  usePreloadForm("contact", "update")
  const lock = useEditLock({
    resource: CONTACTS,
    id,
    enabled: extension.contacts?.editLock !== false,
  })
  const startEditing = async () => {
    if (await lock.acquire()) setEditing(true)
  }
  const header = useContactHeader(contact, slots.actions, lock, (event) => {
    opener.remember(event)
    void startEditing()
  })
  const editAction = useAccessPaletteAction({
    id: "edit",
    resource: CONTACTS,
    action: "update",
    icon: "edit",
    label: t("contact.edit"),
    deniedReason: t("contact.editDenied"),
    record: contact,
    lockReason: lock.reason,
    onSelect: () => {
      void startEditing()
    },
  })
  usePaletteActions(
    contact && editAction
      ? { title: contact.name, actions: [editAction] }
      : null,
  )
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
        notice={<EditLockNotice holder={lock.holder} />}
        sections={applyKeyedChanges(sections, slots.sections)}
        // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
        aside={
          slots.aside ??
          (extension.contacts?.history === false
            ? undefined
            : {
                label: t("contact.history"),
                content: (
                  <RecordHistory
                    target={{ type: CONTACTS, id, name: contact?.name }}
                  />
                ),
              })
        }
      />
      {isEditing && contact ? (
        <ContactFormDialog
          contact={contact}
          finalFocus={opener.ref}
          onClose={() => {
            setEditing(false)
            lock.release()
          }}
          onSaved={(saved) => {
            setEditing(false)
            lock.release()
            leaveAfterTransfer(saved)
          }}
        />
      ) : null}
    </>
  )
}

/** Шапка: ім'я, «Приватна особа», організація, посада, телефон, email, відповідальний і поля розширення. */
function useContactHeader(
  contact: Contact | undefined,
  slotActions: KeyedChanges<ObjectPageAction, ContactActionId> | undefined,
  lock: EditLock,
  onEdit: (event: MouseEvent<HTMLButtonElement>) => void,
): ObjectPageHeader | undefined {
  const t = useContactsT()
  const { extension } = useContactsModule()
  const extensionFields = useExtensionFields(extension.contacts?.fields)
  const { headerField } = useResponsible()
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
    headerField(contact),
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
          lockReason={lock.reason}
          busy={lock.isAcquiring}
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
