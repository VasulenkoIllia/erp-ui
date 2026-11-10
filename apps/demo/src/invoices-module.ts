import { createInvoicesModule } from "@/registry/modules/K2-invoices"

import { contactsModule } from "@/contacts-module"
import { organizationParty } from "@/data/organizations"
import type { Product } from "@/data/products"
import { invoicesExtension } from "@/extensions/K2-sales-invoices"
import { MODULE_ROUTES } from "@/router"
import { salesModule } from "@/sales-module"

/**
 * Модуль K2 «Рахунки клієнтам» в демо на місці заглушки `/m/K2` (ADR-0025, ADR-0070): клієнти —
 * організації модуля B1 з посиланням на їхню картку й реквізитами покупця, потік документів — з
 * посиланнями на замовлення й пропозиції модуля B3, товар рядка — мок `products`.
 */
export const invoicesModule = createInvoicesModule({
  basePath: MODULE_ROUTES.invoicesModule,
  extension: invoicesExtension,
  clients: {
    resource: "organizations",
    labelField: "name",
    descriptionField: "code",
    href: contactsModule.paths.organization,
    party: organizationParty,
  },
  sources: { order: salesModule.paths.order, quote: salesModule.paths.quote },
  lineItem: {
    resource: "products",
    optionLabel: (product: Product) => product.name,
    optionDescription: (product: Product) => product.sku,
    filter: { active: true },
    toLine: (product: Product) => ({
      name: product.name,
      price: String(product.price),
    }),
  },
})
