import { createImportExportModule } from "@/registry/modules/A4-import-export"

import { importExportExtension } from "@/extensions/A4-import-export"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль A4 «Імпорт і експорт» у демо на місці заглушки `/m/A4` (ADR-0025, ADR-0050): фабрика з адресою
 * й розширенням проекту; маршрути й навігація — у `kit-modules.ts`, як і для інших модулів кіта.
 */
export const importExportModule = createImportExportModule({
  basePath: MODULE_ROUTES.importExportModule,
  extension: importExportExtension,
})
