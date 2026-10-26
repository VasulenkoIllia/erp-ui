import { useMemo } from "react"

import {
  useResolvedStatuses,
  type ResolvedStatuses,
  type StatusTone,
} from "@/lib/statuses"

import { USER_STATUSES, type UserStatus } from "../contract"
import { useUsersT } from "../use-users-t"

const TONES: Record<UserStatus, StatusTone> = {
  active: "success",
  blocked: "destructive",
}

/**
 * Статуси людини мовою інтерфейсу. Розширення статусів не додає: «заблоковано» — стан входу, його
 * веде сервер (ADR-0013), а не довідник проекту.
 */
export function useUserStatuses(): ResolvedStatuses {
  const t = useUsersT()
  const statuses = useMemo(
    () =>
      USER_STATUSES.map((id) => ({
        id,
        label: t(`statuses.${id}`),
        tone: TONES[id],
      })),
    [t],
  )
  return useResolvedStatuses(statuses)
}
