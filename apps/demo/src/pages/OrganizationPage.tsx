import { useAuthenticated, useGetOne } from "ra-core"
import { useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useLocation as useRouterLocation, useSearchParams } from "react-router"

import { AuditLog } from "@/registry/erp/audit-log"
import { PageSkeleton } from "@/registry/erp/page-state"
import { PinToggle } from "@/registry/erp/pin-toggle"
import type { RecordField } from "@/registry/erp/record-header"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useFocusHeadingOnNavigation } from "@/registry/hooks/use-focus-heading"
import { companyScope } from "@/registry/lib/company-scope"
import { applyKeyedChanges } from "@/registry/lib/extensions"
import { TAB_PARAM } from "@/registry/lib/list-state"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageHeader,
  type ObjectPageSectionItem,
} from "@/registry/templates/object-page"
import { Badge } from "@/registry/ui/badge"

import { ROUTES } from "@/router"

import { BackLink } from "./back-link"

import {
  NO_ORGANIZATIONS_EXTENSION,
  type OrganizationSectionId,
  type OrganizationsExtension,
} from "./organization-extension"
import {
  ORGANIZATIONS,
  organizationLabel,
  type OrganizationRow,
} from "./organization-options"
import {
  OrganizationInvoices,
  OrganizationRequisites,
} from "./organization-sections"

/**
 * Картка організації на шаблоні Object Page з вкладками (SPEC §7; ADR-0019, ADR-0024): «Реквізити»,
 * «Нотатки» (вкладка розширення проекту, окремий чанк), «Рахунки» (запит лише після відкриття
 * вкладки), «Історія» з журналу аудиту — праворуч на широкому, останньою вкладкою на вузькому.
 * Вибрана вкладка — в адресі (`?tab=`), «Закріпити вгорі» в шапці — те саме закріплення, що в
 * списку. Зразок картки компанії модуля B1 (крок 1.4).
 */

const useCardT = () =>
  useTranslation("demo", { keyPrefix: "organizationPage" }).t

export function OrganizationPage({
  id,
  extension = NO_ORGANIZATIONS_EXTENSION,
}: {
  id: string
  extension?: OrganizationsExtension
}) {
  // Без сесії ra-core перенаправить на /login і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інша організація — інша картка: вкладка й фокус не переходять від попередньої.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <OrganizationCard key={id} id={id} extension={extension} />
  )
}

function OrganizationCard({
  id,
  extension,
}: {
  id: string
  extension: OrganizationsExtension
}) {
  const t = useCardT()
  const pagesT = useTranslation("demo", { keyPrefix: "app.pages" }).t
  const companyId = useCompanyId()
  const heading = useRef<HTMLHeadingElement>(null)
  const location = useRouterLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  // Шапка — одразу з кешу списку; `pinned` — з відповіді (особисте закріплення читача).
  const { data, isPending, error, refetch } = useGetOne<OrganizationRow>(
    ORGANIZATIONS,
    { id, meta: companyScope(companyId) },
    { refetchOnMount: "always" },
  )
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])
  const title = data ? data.name : pagesT("organization")
  useEffect(() => {
    document.title = `${title} · erp-ui`
  }, [title])
  useFocusHeadingOnNavigation(
    heading,
    location.pathname,
    !isPending || error !== null,
  )
  const header = useOrganizationHeader(data)

  const slots = useRecordSlots({
    record: data,
    resource: ORGANIZATIONS,
    sections: extension.sections,
  })
  const sections: (ObjectPageSectionItem & { id: OrganizationSectionId })[] =
    data
      ? [
          {
            id: "requisites",
            title: t("requisites"),
            content: <OrganizationRequisites organization={data} />,
          },
          {
            id: "invoices",
            title: t("invoices"),
            content: <OrganizationInvoices organization={data} />,
          },
        ]
      : []

  return (
    <ObjectPage
      title={pagesT("organization")}
      headingRef={heading}
      back={<BackLink to={ROUTES.organizations} label={t("back")} />}
      isPending={isPending}
      error={data ? undefined : (error ?? undefined)}
      onRetry={retry}
      header={header}
      sections={applyKeyedChanges(sections, slots.sections)}
      tabs={{
        value: searchParams.get(TAB_PARAM),
        onValueChange: (tab) => {
          // Без нового запису історії: «Назад» веде зі картки, а не по вкладках. Стан переходу
          // лишається — «До списку» і далі повертає фільтри списку.
          setSearchParams(
            (params) => {
              const next = new URLSearchParams(params)
              next.set(TAB_PARAM, tab)
              return next
            },
            { replace: true, state: location.state as unknown },
          )
        },
      }}
      aside={{
        label: t("history"),
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

/** Шапка: назва, тип, код і місто, «Закріпити вгорі»; без запису — немає. */
function useOrganizationHeader(
  organization: OrganizationRow | undefined,
): ObjectPageHeader | undefined {
  const t = useCardT()
  if (!organization) return undefined
  const fields: RecordField[] = [
    {
      id: "code",
      label: t(organization.type === "fop" ? "rnokpp" : "edrpou"),
      value: organization.code,
    },
    { id: "city", label: t("city"), value: organization.city },
  ]
  return {
    title: organization.name,
    status: <Badge variant="outline">{t(`types.${organization.type}`)}</Badge>,
    fields,
    actions: [
      {
        id: "pin",
        node: (
          <PinToggle
            resource={ORGANIZATIONS}
            record={organization}
            name={organizationLabel(organization)}
            variant="button"
          />
        ),
      },
    ],
  }
}
