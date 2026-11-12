import { createInvoicesModule } from "@/registry/modules/K2-invoices"
import { paymentsPaths } from "@/registry/modules/K4-payments"

import { contactsModule } from "@/contacts-module"
import { organizationParty } from "@/data/organizations"
import type { Product } from "@/data/products"
import { invoicesExtension } from "@/extensions/K2-sales-invoices"
import { MODULE_ROUTES } from "@/router"
import { salesModule } from "@/sales-module"

/**
 * Модуль K2 «Рахунки клієнтам» в демо на місці заглушки `/m/K2` (ADR-0025, ADR-0070): клієнти —
 * організації модуля B1 з посиланням на їхню картку й реквізитами покупця, потік документів — з
 * посиланнями на замовлення й пропозиції модуля B3, товар рядка — мок `products`, валюти рахунку — валюти
 * компанії модуля A1 (ADR-0071), оплати — модуль K4 (ADR-0073): лише адреси, без фабрики модуля.
 */
const payments = paymentsPaths(MODULE_ROUTES.paymentsModule)

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
  currencies: { resource: "currencies" },
  payments: {
    resource: "sales-payments",
    register: payments.newPayment,
    href: payments.payment,
    refunds: {
      resource: "sales-refunds",
      register: payments.newRefund,
      href: payments.refund,
    },
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
