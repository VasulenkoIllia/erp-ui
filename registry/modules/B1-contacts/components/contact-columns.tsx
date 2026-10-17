import { useMemo } from "react"

import { usePinColumn } from "@/components/erp/pin-toggle"
import type { DataTableColumn } from "@/lib/data-table-core"
import { formatPhone } from "@/lib/phone"

import { CONTACTS, type Contact } from "../contract"
import type { ContactColumnId } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { ContactOrganization } from "./contact-organization"
import { cellText } from "./cell-text"
import { RecordLink } from "./navigation"
import { SegmentBadges, useSegments } from "./segments"

type ContactColumn = DataTableColumn<Contact> & { id: ContactColumnId }

export const contactName = (contact: Contact) => contact.name

/**
 * Колонки списку контактів: закріплення, ім'я-посилання на картку, організація-посилання, посада,
 * телефон, email, сегменти; на телефоні — картки з ім'ям. Ключі — `ContactColumnId`.
 */
export function useContactColumns(): readonly ContactColumn[] {
  const t = useContactsT()
  const { paths } = useContactsModule()
  const segments = useSegments()
  const pin = usePinColumn<Contact>({ resource: CONTACTS, name: contactName })
  return useMemo(
    () => [
      { ...pin, id: "pin" },
      {
        id: "name",
        header: t("contacts.columns.name"),
        cell: (contact) => (
          <RecordLink to={paths.contact(contact.id)} fromList>
            {contact.name}
          </RecordLink>
        ),
        sortField: "name",
        minWidth: 12,
        grow: 2,
        sticky: true,
        card: "title",
      },
      {
        id: "organization",
        header: t("contacts.columns.organization"),
        cell: (contact) => <ContactOrganization id={contact.organizationId} />,
        minWidth: 12,
        grow: 2,
      },
      {
        id: "position",
        header: t("contacts.columns.position"),
        cell: (contact) => cellText(contact.position),
        sortField: "position",
        minWidth: 10,
        priority: 5,
        overflow: "wrap",
      },
      {
        id: "phone",
        header: t("contacts.columns.phone"),
        cell: (contact) => (
          <span className="tabular-nums">{formatPhone(contact.phone)}</span>
        ),
        minWidth: 10,
        priority: 4,
      },
      {
        id: "email",
        header: t("contacts.columns.email"),
        cell: (contact) => cellText(contact.email),
        minWidth: 12,
        priority: 6,
        overflow: "wrap",
      },
      {
        id: "segments",
        header: t("contacts.columns.segments"),
        cell: (contact) => (
          <SegmentBadges ids={contact.segments} segments={segments} />
        ),
        minWidth: 9,
        priority: 7,
        overflow: "wrap",
      },
    ],
    [t, pin, paths, segments],
  )
}
