import { useMemo } from "react"

import { useErpUiT } from "@/lib/i18n"
import {
  useResolvedStatuses,
  useResolvedTransitions,
  type ModuleTransition,
  type ResolvedStatuses,
  type StatusTone,
} from "@/lib/statuses"

import {
  QUOTE_STATUSES,
  QUOTE_TRANSITIONS,
  type QuoteStatus,
} from "../contract"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"

const TONES: Record<QuoteStatus, StatusTone> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  declined: "warning",
  cancelled: "destructive",
}

/** Дії модуля зі своїм підписом: «Надіслати» замість «Провести» кіта, відповідь клієнта. */
const MODULE_LABELS = ["submit", "accept", "decline"] as const
const isModuleLabel = (id: string): id is (typeof MODULE_LABELS)[number] =>
  (MODULE_LABELS as readonly string[]).includes(id)

/** Дії, що питають підтвердження своїми словами: «Надіслати пропозицію?», а не «Провести документ?». */
const MODULE_CONFIRMS = ["submit", "decline"] as const
const isModuleConfirm = (id: string): id is (typeof MODULE_CONFIRMS)[number] =>
  (MODULE_CONFIRMS as readonly string[]).includes(id)

/** Статуси пропозиції мовою інтерфейсу зі статусами розширення проекту. */
export function useQuoteStatuses(): ResolvedStatuses {
  const t = useSalesT()
  const { extension } = useSalesModule()
  const statuses = useMemo(
    () =>
      QUOTE_STATUSES.map((id) => ({
        id,
        label: t(`quote.statuses.${id}`),
        tone: TONES[id],
      })),
    [t],
  )
  return useResolvedStatuses(statuses, extension.quotes?.statuses)
}

/** Граф дій зі змінами розширення: «Скасувати» й «Виправити» — підписи кіта, решта — модуля. */
export function useQuoteTransitions(): readonly ModuleTransition[] {
  const t = useSalesT()
  const kitT = useErpUiT()
  const { extension } = useSalesModule()
  const transitions = useMemo(
    () =>
      QUOTE_TRANSITIONS.map((transition) => ({
        ...transition,
        label: isModuleLabel(transition.id)
          ? t(`quote.actions.${transition.id}`)
          : kitT(`documentActions.${transition.id}`),
        confirm: isModuleConfirm(transition.id)
          ? {
              title: t(`quote.confirm.${transition.id}.title`),
              description: t(`quote.confirm.${transition.id}.description`),
              action: t(`quote.confirm.${transition.id}.action`),
            }
          : undefined,
      })),
    [t, kitT],
  )
  return useResolvedTransitions(transitions, extension.quotes?.transitions)
}
