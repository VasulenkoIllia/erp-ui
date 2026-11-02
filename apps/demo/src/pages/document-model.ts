import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  useResolvedStatuses,
  useResolvedTransitions,
  type ModuleTransition,
  type ResolvedStatuses,
  type StatusTone,
} from "@/registry/lib/statuses"

import {
  DOCUMENT_STATUSES,
  DOCUMENT_TRANSITIONS,
  type DocumentStatus,
} from "@/data/documents"
import { documentsExtension } from "@/extensions/documents"

export const DOCUMENT_RESOURCE = "documents"

const TONES: Record<DocumentStatus, StatusTone> = {
  draft: "neutral",
  submitted: "info",
  paid: "success",
  cancelled: "destructive",
  reversed: "neutral",
}

/** Статуси документа мовою інтерфейсу зі статусом розширення проекту («На перевірці»). */
export function useDocumentStatuses(): ResolvedStatuses {
  const { t } = useTranslation("demo", { keyPrefix: "documentPage" })
  const statuses = useMemo(
    () =>
      DOCUMENT_STATUSES.map((id) => ({
        id,
        label: t(`statuses.${id}`),
        tone: TONES[id],
      })),
    [t],
  )
  return useResolvedStatuses(statuses, documentsExtension.statuses)
}

/** Граф дій зі змінами розширення: підписи дій життєвого циклу — кіта, власної дії — демо. */
export function useDocumentTransitions(): readonly ModuleTransition[] {
  const kitT = useErpUiT()
  const { t } = useTranslation("demo", { keyPrefix: "documentPage" })
  const transitions = useMemo(
    () =>
      DOCUMENT_TRANSITIONS.map((transition) => ({
        ...transition,
        label:
          transition.id === "markPaid"
            ? t("actions.markPaid")
            : kitT(`documentActions.${transition.id}`),
      })),
    [kitT, t],
  )
  return useResolvedTransitions(transitions, documentsExtension.transitions)
}
