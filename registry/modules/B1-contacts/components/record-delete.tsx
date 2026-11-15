import { DocumentDeleteAction } from "@/components/erp/document-delete-action"

import {
  CONTACTS,
  ORGANIZATIONS,
  type Contact,
  type Organization,
} from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"

/**
 * «Видалити» в шапці картки організації чи контакту (ADR-0095): кнопка кіта зі словами модуля, право
 * `<ресурс>:delete` («Свої» — свій запис). З кошиком на сервері — без підтвердження, зі «Скасувати»; без
 * нього — підтвердження: видалення назавжди. Контакти видаленої організації лишаються (вікторина PF16).
 */
export function ContactsDeleteAction({
  entity,
  record,
  lockReason,
}: {
  entity: "organization" | "contact"
  record: Organization | Contact
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason: string | undefined
}) {
  const t = useContactsT()
  const { paths } = useContactsModule()
  const isOrganization = entity === "organization"
  return (
    <DocumentDeleteAction
      resource={isOrganization ? ORGANIZATIONS : CONTACTS}
      document={record}
      name={record.name}
      listPath={isOrganization ? paths.organizations : paths.contacts}
      lockReason={lockReason}
      texts={{
        button: t(`${entity}.delete.button`),
        denied: t(`${entity}.delete.denied`),
        done: t(`${entity}.delete.done`),
        trashed: t(`${entity}.delete.trashed`),
        title: t(`${entity}.delete.title`),
        description: t(`${entity}.delete.description`),
        confirm: t(`${entity}.delete.confirm`),
      }}
    />
  )
}
