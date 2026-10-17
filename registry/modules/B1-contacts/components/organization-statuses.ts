import { useMemo } from "react"

import {
  useResolvedStatuses,
  type ResolvedStatuses,
  type StatusTone,
} from "@/lib/statuses"

import { ORGANIZATION_STATUSES, type OrganizationStatus } from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"

const TONES: Record<OrganizationStatus, StatusTone> = {
  active: "success",
  prospect: "info",
  inactive: "neutral",
}

/** Статуси організації мовою інтерфейсу зі статусами розширення проекту. */
export function useOrganizationStatuses(): ResolvedStatuses {
  const t = useContactsT()
  const { extension } = useContactsModule()
  const statuses = useMemo(
    () =>
      ORGANIZATION_STATUSES.map((id) => ({
        id,
        label: t(`organization.statuses.${id}`),
        tone: TONES[id],
      })),
    [t],
  )
  return useResolvedStatuses(statuses, extension.organizations?.statuses)
}
