import { createNotificationsModule } from "@/registry/modules/N5-notifications"

import { notificationsExtension } from "@/extensions/N5-notifications"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль N5 «Сповіщення» в демо на місці заглушки `/m/N5` (ADR-0025, ADR-0046): фабрика з адресою й
 * розширенням проекту; маршрути й навігація — у `kit-modules.ts`, як і для інших модулів кіта.
 */
export const notificationsModule = createNotificationsModule({
  basePath: MODULE_ROUTES.notificationsModule,
  extension: notificationsExtension,
})
