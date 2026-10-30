import { useQuery } from "@tanstack/react-query"
import { useGetList } from "ra-core"

import { useErpAuthProvider } from "@/components/erp/auth-layout"
import { OFFLINE } from "@/hooks/use-card-record"
import { useCompanyId } from "@/hooks/use-company"
import { useHasPermission } from "@/hooks/use-me"
import { companyScope } from "@/lib/company-scope"
import { INVITATION_QUERY_KEYS } from "@/lib/invitations"

const USERS = "users"
/** Двох записів досить, щоб знати, що людина в компанії не сама. */
const COLLEAGUES_PAGE = { page: 1, perPage: 2 }

/**
 * Запрошення, що чекають відповіді. Той самий запит, що в `InvitationsSection`: надіслане на кроці
 * «Колеги» одразу видно тут. Прострочене не рахується: на нього вже ніхто не відповість, а прийняте
 * зникає зі списку й видно людиною в компанії. Збій перечитування не ховає те, що вже є.
 */
export function useWaitingInvitations(enabled: boolean) {
  const provider = useErpAuthProvider()
  const companyId = useCompanyId()
  const { data, error, fetchStatus, isPending, refetch } = useQuery({
    queryKey: [...INVITATION_QUERY_KEYS.list, companyScope(companyId)],
    queryFn: () => provider.invitations.list(),
    enabled,
  })
  const isPaused = enabled && fetchStatus === "paused"
  return {
    isPending: enabled && isPending,
    failure: data ? undefined : (error ?? (isPaused ? OFFLINE : undefined)),
    count: data?.filter((invitation) => invitation.status === "pending").length,
    retry: () => {
      // `refetch` не дивиться на `enabled`, а проект без запрошень не має цієї адреси.
      if (enabled) void refetch()
    },
  }
}

/** Пункт «Колеги»: є запрошення, що чекає, чи в компанії більше однієї людини. */
export function useTeamProgress(enabled: boolean) {
  const invitations = useWaitingInvitations(enabled)
  const canReadUsers = useHasPermission(USERS, "read")
  const readsUsers = enabled && canReadUsers
  const users = useGetList(
    USERS,
    { pagination: COLLEAGUES_PAGE },
    { enabled: readsUsers },
  )
  const usersPaused = users.fetchStatus === "paused"
  const usersFailure =
    readsUsers && users.total === undefined
      ? (users.error ?? (usersPaused ? OFFLINE : undefined))
      : undefined
  const hasTeam = (invitations.count ?? 0) > 0 || (users.total ?? 0) > 1
  return {
    // Одного джерела досить: друге, навіть у збої чи без мережі, відповіді вже не змінить.
    isPending:
      !hasTeam && (invitations.isPending || (readsUsers && users.isPending)),
    failure: hasTeam ? undefined : (invitations.failure ?? usersFailure),
    hasTeam,
    retry: () => {
      invitations.retry()
      if (readsUsers) void users.refetch()
    },
  }
}
