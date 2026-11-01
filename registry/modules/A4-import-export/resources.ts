/**
 * Ресурси модуля A4 без схем: їх бере точка входу (`index.ts`) для прав і панелі розробника, не тягнучи
 * zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

export const IMPORT_RUNS = "import-runs"

export interface ImportExportResource {
  readonly name: string
  readonly label: LocalizedText
  readonly actions: readonly string[]
}

export const IMPORT_EXPORT_RESOURCES: readonly ImportExportResource[] = [
  {
    name: IMPORT_RUNS,
    label: { uk: "Історія імпорту", en: "Import history" },
    actions: ["read"],
  },
]
