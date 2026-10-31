import { useAuthenticated } from "ra-core"
import { useMemo, useState } from "react"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"
import { RecordHistory } from "@/components/erp/record-history"
import { BackToList } from "@/components/erp/record-link"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageSectionItem,
} from "@/components/templates/object-page"
import { useCardRecord, type CardRecord } from "@/hooks/use-card-record"
import { useHistoryRefresh } from "@/hooks/use-history-refresh"
import { usePageHeading } from "@/hooks/use-page-heading"
import {
  usePaletteActions,
  useSectionActions,
} from "@/hooks/use-palette-actions"
import { useTabParam } from "@/hooks/use-tab-param"
import { applyKeyedChanges } from "@/lib/extensions"

import { useAccessPaletteAction, useOpener } from "../components/access-action"
import { OrganizationContacts } from "../components/organization-contacts"
import {
  OrganizationFormDialog,
  usePreloadForm,
} from "../components/form-dialogs"
import { OrganizationAddresses } from "../components/organization-addresses"
import { OrganizationBankAccounts } from "../components/organization-bank-accounts"
import { useDetailEditing } from "../components/organization-details"
import { useOrganizationHeader } from "../components/organization-header"
import {
  OrganizationRequisites,
  type DetailState,
} from "../components/organization-sections"
import { useOrganizationStatuses } from "../components/organization-statuses"
import { useLeaveAfterTransfer } from "../components/responsible"
import {
  ORGANIZATIONS,
  type Organization,
  type OrganizationDetail,
} from "../contract"
import type { OrganizationSectionId } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"

type OrganizationCardRecord = Organization & Partial<OrganizationDetail>

const MISSING_DETAIL = new Error(
  "Organization addresses and bank accounts are missing in the response",
)

/**
 * Картка організації на шаблоні Object Page з вкладками (SPEC §7; ADR-0019, ADR-0024): «Реквізити»,
 * «Адреси», «Рахунки», «Контактні особи» і вкладки розширення проекту; «Історія» з журналу аудиту —
 * праворуч на широкому, останньою вкладкою на вузькому. Вибрана вкладка — в адресі (`?tab=`).
 * Адреси й рахунки змінюються в картці (ADR-0028): «Додати…» в заголовку вкладки, меню рядка.
 */
export function OrganizationPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інша організація — інша картка: вкладка й фокус не переходять від попередньої.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <OrganizationCard key={id} id={id} />
  )
}

function OrganizationCard({ id }: { id: string }) {
  const t = useContactsT()
  const { extension, paths } = useContactsModule()
  const leaveAfterTransfer = useLeaveAfterTransfer(
    ORGANIZATIONS,
    paths.organizations,
  )
  const card = useCardRecord<OrganizationCardRecord>(ORGANIZATIONS, id)
  const organization = card.record
  const heading = usePageHeading(
    organization?.name ?? t("organization.title"),
    !card.isPending || card.pageError !== undefined,
  )
  const statuses = useOrganizationStatuses()
  const slots = useRecordSlots({
    record: organization,
    resource: ORGANIZATIONS,
    sections: extension.organizations?.sections,
    actions: extension.organizations?.actions,
  })
  const [isEditing, setEditing] = useState(false)
  const opener = useOpener()
  usePreloadForm("organization", "update")
  const header = useOrganizationHeader(
    organization,
    statuses,
    slots.actions,
    (event) => {
      opener.remember(event)
      setEditing(true)
    },
  )
  const detail = useDetailState(card)
  const details = useDetailEditing(organization, detail)
  useHistoryRefresh(organization?.version)
  const tabs = useTabParam()
  const sections: (ObjectPageSectionItem & { id: OrganizationSectionId })[] =
    organization
      ? [
          {
            id: "requisites",
            title: t("organization.sections.requisites"),
            content: <OrganizationRequisites organization={organization} />,
          },
          {
            id: "addresses",
            title: t("organization.sections.addresses"),
            actions: details.addAddress,
            content: (
              <OrganizationAddresses
                organization={organization}
                state={detail}
                actions={details.addressActions}
              />
            ),
          },
          {
            id: "bankAccounts",
            title: t("organization.sections.bankAccounts"),
            actions: details.addBankAccount,
            content: (
              <OrganizationBankAccounts
                organization={organization}
                state={detail}
                actions={details.bankAccountActions}
              />
            ),
          },
          {
            id: "contacts",
            title: t("organization.sections.contacts"),
            content: <OrganizationContacts organization={organization} />,
          },
        ]
      : []

  const shownSections = applyKeyedChanges(sections, slots.sections)
  const editAction = useAccessPaletteAction({
    id: "edit",
    resource: ORGANIZATIONS,
    action: "update",
    icon: "edit",
    label: t("organization.edit"),
    deniedReason: t("organization.editDenied"),
    record: organization,
    onSelect: () => {
      setEditing(true)
    },
  })
  const sectionActions = useSectionActions(shownSections, tabs.onValueChange)
  usePaletteActions(
    organization
      ? {
          title: organization.name,
          actions: editAction
            ? [editAction, ...sectionActions]
            : sectionActions,
        }
      : null,
  )

  return (
    <>
      <ObjectPage
        title={t("organization.title")}
        headingRef={heading}
        back={
          <BackToList to={paths.organizations} label={t("organization.back")} />
        }
        isPending={card.isPending}
        error={card.pageError}
        onRetry={card.retry}
        header={header}
        sections={shownSections}
        tabs={{ ...tabs, label: t("organization.tabsLabel") }}
        // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
        aside={
          extension.organizations?.history === false
            ? undefined
            : {
                label: t("organization.history"),
                content: (
                  <RecordHistory
                    target={{
                      type: ORGANIZATIONS,
                      id,
                      name: organization?.name,
                    }}
                  />
                ),
              }
        }
      />
      {isEditing && organization ? (
        <OrganizationFormDialog
          organization={organization}
          finalFocus={opener.ref}
          onClose={() => {
            setEditing(false)
          }}
          onSaved={(saved) => {
            setEditing(false)
            leaveAfterTransfer(saved)
          }}
        />
      ) : null}
      {details.dialogs}
    </>
  )
}

/** Адреси й рахунки з відповіді картки: у рядку списку їх немає (ADR-0019). */
function useDetailState(card: CardRecord<OrganizationCardRecord>): DetailState {
  const { record, isFetching, failure, retry } = card
  const addresses = record?.addresses
  const bankAccounts = record?.bankAccounts
  return useMemo(() => {
    const detail =
      addresses && bankAccounts ? { addresses, bankAccounts } : undefined
    return {
      detail,
      isPending: !detail && isFetching,
      error: detail || isFetching ? undefined : (failure ?? MISSING_DETAIL),
      onRetry: retry,
    }
  }, [addresses, bankAccounts, isFetching, failure, retry])
}
