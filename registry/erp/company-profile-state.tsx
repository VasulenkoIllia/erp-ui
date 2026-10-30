import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { isApiError } from "@/registry/lib/api"
import { COMPANY_QUERY_KEYS, type CompanyProfile } from "@/registry/lib/company"

/** Спільне для частин налаштувань компанії (erp/company-settings): оновлення й стани профілю. */

export function useRefreshCompany() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: COMPANY_QUERY_KEYS.profile })
}

/** Стан завантаження й помилки профілю — однаковий для всіх частин. */
export function ProfileState({
  query,
  rows,
  children,
}: {
  query: ReturnType<typeof useCompanyProfile>
  rows: number
  children: (profile: CompanyProfile) => React.ReactNode
}) {
  if (query.isPending) return <SectionSkeleton rows={rows} />
  if (query.isError)
    return isApiError(query.error) && query.error.status === 403 ? (
      <PageState kind="forbidden" className="min-h-40" />
    ) : (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  return <>{children(query.data)}</>
}
