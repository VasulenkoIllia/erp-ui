import { createAuditModule } from "@/registry/modules/A5-audit"

import { auditExtension } from "@/extensions/A5-audit"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль A5 «Аудит та історія» в демо на місці заглушки `/m/A5` (ADR-0025, ADR-0045): фабрика з
 * адресою й розширенням проекту; маршрути й навігація — у `kit-modules.ts`, як і для інших модулів кіта.
 */
export const auditModule = createAuditModule({
  basePath: MODULE_ROUTES.auditModule,
  extension: auditExtension,
})
