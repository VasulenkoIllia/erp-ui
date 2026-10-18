import { useAuthenticated } from "ra-core"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"
import { isPinned } from "@/lib/pins"

import { AccessAction, useOpener } from "../components/access-action"
import { useContactColumns } from "../components/contact-columns"
import { ContactFormDialog, usePreloadForm } from "../components/form-dialogs"
import { useSegmentFilter } from "../components/segments"
import { useExtendedList } from "../components/use-extended-list"
import { usePageHeading } from "../components/use-page-heading"
import { CONTACTS, type Contact } from "../contract"
import type { ContactColumnId, ContactIds, ContactTabId } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"

/** Без параметрів в адресі: усі контакти за ім'ям. */
const CONTACT_LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "name", order: "ASC" },
  sortFields: ["name", "position"],
}

/** Ім'я — заголовок картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS: readonly ContactColumnId[] = ["name"]

/** Вкладки — фільтр за організацією: `null` у параметрі — «немає» (плоскі параметри, ADR-0002). */
const TAB_FILTERS: Record<ContactTabId, Record<string, string>> = {
  all: {},
  representatives: { organizationId_ne: "null" },
  private: { organizationId: "null" },
}

/**
 * Список контактів на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0024): вкладки «Усі»,
 * «Представники організацій», «Приватні особи», фільтр «Сегменти», пошук за ім'ям, телефоном чи
 * email, закріплення вгорі, запам'ятаний розмір сторінки; ім'я — посилання на картку контакту,
 * організація — на картку організації. «Створити контакт» — форма в діалозі (ADR-0026), після
 * створення — картка нового контакту.
 */
export function ContactsListPage() {
  const t = useContactsT()
  const { paths } = useContactsModule()
  const navigate = useNavigate()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("contacts.title"))
  const [isCreating, setCreating] = useState(false)
  const opener = useOpener()
  usePreloadForm("contact", "create")
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <AccessAction
          resource={CONTACTS}
          action="create"
          icon="create"
          label={t("contacts.create")}
          deniedReason={t("contacts.createDenied")}
          variant="default"
          onClick={(event) => {
            opener.remember(event)
            setCreating(true)
          }}
        />
      ),
    },
  ]
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("contacts.title")}
        description={t("contacts.lead")}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending ? <PageSkeleton rows={8} /> : <ContactList />}
      {isCreating ? (
        <ContactFormDialog
          finalFocus={opener.ref}
          onClose={() => {
            setCreating(false)
          }}
          onSaved={(contact) => {
            setCreating(false)
            void navigate(paths.contact(String(contact.id)))
          }}
        />
      ) : null}
    </div>
  )
}

function ContactList() {
  const t = useContactsT()
  const { extension } = useContactsModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const columns = useContactColumns()
  const segmentFilter = useSegmentFilter(t("contacts.filters.segments"))
  const filters = useMemo(
    () => [{ ...segmentFilter, id: "segments" as const }],
    [segmentFilter],
  )
  const tabs = useMemo(
    () =>
      (Object.keys(TAB_FILTERS) as ContactTabId[]).map((id) => ({
        id,
        label: t(`contacts.tabs.${id}`),
        filter: TAB_FILTERS[id],
      })),
    [t],
  )
  const list = useExtendedList<Contact, ContactIds>(
    columns,
    filters,
    tabs,
    extension.contacts,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: CONTACTS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: CONTACT_LIST_DEFAULTS,
    tabs: list.tabs,
    filters: list.filters,
  })
  return (
    <ListReport
      report={report}
      mode="pages"
      tabsLabel={t("contacts.tabsLabel")}
      searchPlaceholder={t("contacts.search")}
      tableLabel={t("contacts.tableLabel")}
      columns={list.columns}
      isPinned={isPinned}
      countLabel={(count, value) => t("contacts.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={MODULE_ICONS.B1}
          title={t("contacts.empty.title")}
          description={t("contacts.empty.description")}
        />
      }
    />
  )
}
