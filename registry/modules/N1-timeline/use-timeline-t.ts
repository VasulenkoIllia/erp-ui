import { createModuleT } from "@/lib/i18n-namespaces"

import type { TimelineMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useTimelineModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок (простір імен `N1-timeline`): перевизначення — з `strings`
 * розширення проекту.
 */
export const useTimelineT = createModuleT<TimelineMessages>(
  "N1-timeline",
  uk,
  () => import("./i18n/en.json").then((m) => m.default),
  useTimelineModule,
)
