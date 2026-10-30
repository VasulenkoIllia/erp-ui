import { createCompanyModule } from "@/registry/modules/A1-company"

import { companyExtension } from "@/extensions/A1-company"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль A1 «Компанія й валюти» в демо на місці заглушки `/m/A1` (ADR-0025, ADR-0043): фабрика з
 * адресою й розширенням проекту; маршрути й навігація — у `kit-modules.ts`, як і для інших модулів кіта.
 */
export const companyModule = createCompanyModule({
  basePath: MODULE_ROUTES.companyModule,
  extension: companyExtension,
})
