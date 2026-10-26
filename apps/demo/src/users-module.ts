import { createUsersModule } from "@/registry/modules/A2-users"

import { usersExtension } from "@/extensions/A2-users"
import { MODULE_ROUTES, ROUTES } from "@/router"

/**
 * Модуль A2 «Користувачі й ролі» в демо на місці заглушки `/m/A2` (ADR-0025, ADR-0031): фабрика з
 * адресою й розширенням проекту; після «Увійти як…» — стрес-сторінка, яку бачить менеджер.
 */
export const usersModule = createUsersModule({
  basePath: MODULE_ROUTES.usersModule,
  extension: usersExtension,
  homePath: ROUTES.data,
})
