import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { TimelineExtension, TimelineMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useTimelineModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const TIMELINE_NAMESPACE = "N1-timeline"

const NO_STRINGS: NonNullable<TimelineExtension["strings"]> = {}

const resourcesFor = moduleResources<TimelineMessages>(uk, () =>
  import("./i18n/en.json").then((m) => m.default),
)

/**
 * Переклад рядків модуля для сторінок: рядки приходять разом зі сторінками модуля (ADR-0025),
 * перевизначення — з `strings` розширення проекту. Рядки самої стрічки — у кіті (`timeline.*`).
 */
export function useTimelineT() {
  const { extension } = useTimelineModule()
  useNamespaceResources(
    TIMELINE_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<TimelineMessages>(TIMELINE_NAMESPACE)
}
