import { invoicesPaths } from "@/registry/modules/K2-invoices"
import { createPaymentsModule } from "@/registry/modules/K4-payments"

import { contactsModule } from "@/contacts-module"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль K4 «Оплати» в демо на місці заглушки `/m/K4` (ADR-0025, ADR-0073): клієнти — організації модуля B1
 * з посиланням на їхню картку, рахунки — модуля K2 з посиланням на картку рахунку: лише адреса, без фабрики
 * модуля.
 */
export const paymentsModule = createPaymentsModule({
  basePath: MODULE_ROUTES.paymentsModule,
  clients: {
    resource: "organizations",
    labelField: "name",
    descriptionField: "code",
    href: contactsModule.paths.organization,
  },
  invoices: {
    resource: "sales-invoices",
    href: invoicesPaths(MODULE_ROUTES.invoicesModule).invoice,
  },
})
