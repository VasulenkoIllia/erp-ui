/**
 * Ресурс модуля N1 без схем: його бере точка входу (`index.ts`) для панелі розробника, не тягнучи
 * zod і схеми контракту в перший екран застосунку.
 */
import type { ModuleResource } from "@/lib/module"

/** Ресурс сценаріїв моків (`lib/mock-timeline`). Окремого права немає: досить `<ресурс>:read`. */
export const TIMELINE = "timeline"

export type TimelineResource = ModuleResource

export const TIMELINE_RESOURCES: readonly TimelineResource[] = [
  { name: TIMELINE, label: { uk: "Стрічка запису", en: "Record timeline" } },
]
