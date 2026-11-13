/**
 * Ресурси модуля A4 без схем: їх бере точка входу (`index.ts`) для прав і панелі розробника, не тягнучи
 * zod і схеми контракту в перший екран застосунку.
 */
import type { ModuleResourceWithActions } from "@/lib/module"

export const IMPORT_RUNS = "import-runs"

export type ImportExportResource = ModuleResourceWithActions

export const IMPORT_EXPORT_RESOURCES: readonly ImportExportResource[] = [
  {
    name: IMPORT_RUNS,
    label: { uk: "Історія імпорту", en: "Import history" },
    actions: ["read"],
  },
]
