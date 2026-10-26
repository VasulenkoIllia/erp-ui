import { createContactsModule } from "@/registry/modules/B1-contacts"

import { contactsExtension } from "@/extensions/B1-contacts"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль B1 «Контакти й компанії» в демо на місці заглушки `/m/B1` (ADR-0025): фабрика з адресою й
 * розширенням проекту; маршрути й навігація — у `kit-modules.ts`, як і для інших модулів кіта.
 */
export const contactsModule = createContactsModule({
  basePath: MODULE_ROUTES.contacts,
  extension: contactsExtension,
})
