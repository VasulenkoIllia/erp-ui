import { useMemo } from "react"

import {
  useResolvedStatuses,
  type ModuleStatus,
  type ResolvedStatuses,
} from "@/lib/statuses"

import { REASON_KINDS } from "../contract"
import type { ReasonKindId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"

/**
 * Види причин мовою інтерфейсу зі змінами розширення. Вид — статус із точкою розширення (`lib/statuses`):
 * проект додає свої, а схований вид лишається підписаним у старих значеннях.
 */
export function useReasonKinds(): ResolvedStatuses {
  const t = useDictionariesT()
  const { extension } = useDictionariesModule()
  const baseKinds = useMemo(
    () =>
      REASON_KINDS.map((id): ModuleStatus & { readonly id: ReasonKindId } => ({
        id,
        label: t(`reasons.kinds.${id}`),
        tone: "neutral",
      })),
    [t],
  )
  return useResolvedStatuses(baseKinds, extension.reasons?.kinds)
}
