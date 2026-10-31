import { createDictionariesModule } from "@/registry/modules/A6-dictionaries"

import { dictionariesExtension } from "@/extensions/A6-dictionaries"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль A6 «Довідники» в демо на місці заглушки `/m/A6` (ADR-0025, ADR-0047): фабрика з адресою й
 * розширенням проекту; маршрути й навігація — у `kit-modules.ts`, як і для інших модулів кіта.
 */
export const dictionariesModule = createDictionariesModule({
  basePath: MODULE_ROUTES.dictionariesModule,
  extension: dictionariesExtension,
})
