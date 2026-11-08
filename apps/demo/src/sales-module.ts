import { createSalesModule } from "@/registry/modules/B3-sales"

import { contactsModule } from "@/contacts-module"
import type { Product } from "@/data/products"
import { salesExtension } from "@/extensions/B3-sales"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль B3 «Пропозиції й замовлення» в демо на місці заглушки `/m/B3` (ADR-0025): клієнти —
 * організації модуля B1 з посиланням на їхню картку, товар рядка — мок `products`.
 */
export const salesModule = createSalesModule({
  basePath: MODULE_ROUTES.salesModule,
  extension: salesExtension,
  clients: {
    resource: "organizations",
    labelField: "name",
    descriptionField: "code",
    href: contactsModule.paths.organization,
  },
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
