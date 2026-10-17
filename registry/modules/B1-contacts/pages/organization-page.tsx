import { useAuthenticated } from "ra-core"
import { useMemo } from "react"
import { useLocation, useParams, useSearchParams } from "react-router"

import { AuditLog } from "@/components/erp/audit-log"
import { PageSkeleton } from "@/components/erp/page-state"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageSectionItem,
} from "@/components/templates/object-page"
import { applyKeyedChanges } from "@/lib/extensions"
import { TAB_PARAM } from "@/lib/list-state"

import { BackToList } from "../components/navigation"
import { OrganizationContacts } from "../components/organization-contacts"
import { useOrganizationHeader } from "../components/organization-header"
import {
  OrganizationAddresses,
  OrganizationBankAccounts,
  OrganizationRequisites,
  type DetailState,
} from "../components/organization-sections"
import { useOrganizationStatuses } from "../components/organization-statuses"
import { useCardRecord, type CardRecord } from "../components/use-card-record"
import { usePageHeading } from "../components/use-page-heading"
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
  const header = useOrganizationHeader(organization, statuses, slots.actions)
  const detail = useDetailState(card)
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
            content: (
              <OrganizationAddresses
                organization={organization}
                state={detail}
              />
            ),
          },
          {
            id: "bankAccounts",
            title: t("organization.sections.bankAccounts"),
            content: (
              <OrganizationBankAccounts
                organization={organization}
                state={detail}
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

  return (
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
      sections={applyKeyedChanges(sections, slots.sections)}
      tabs={{ ...tabs, label: t("organization.tabsLabel") }}
      aside={{
        label: t("organization.history"),
        content: (
          <AuditLog
            filter={{ targetType: ORGANIZATIONS, targetId: id }}
            filters={false}
            exportable={false}
            perPage={10}
          />
        ),
      }}
    />
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

/** Вибрана вкладка — в адресі, без нового запису історії: «Назад» веде з картки, а не по вкладках. */
function useTabParam() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  return {
    value: searchParams.get(TAB_PARAM),
    onValueChange: (tab: string) => {
      // Стан переходу лишається: «До організацій» і далі повертає фільтри списку.
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params)
          next.set(TAB_PARAM, tab)
          return next
        },
        { replace: true, state: location.state as unknown },
      )
    },
  }
}
