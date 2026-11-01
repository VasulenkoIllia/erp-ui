import type { TimelineExtension } from "@/registry/modules/N1-timeline"

import { MODULE_ROUTES, invoiceHref } from "@/router"

/** Адреси карток у демо: їх знає проект, модуль N1 про сусідні модулі не знає. */
const CARD_HREFS: Readonly<Record<string, (id: string) => string>> = {
  invoices: invoiceHref,
  contacts: (id) =>
    `${MODULE_ROUTES.contacts}/contacts/${encodeURIComponent(id)}`,
  organizations: (id) =>
    `${MODULE_ROUTES.contacts}/organizations/${encodeURIComponent(id)}`,
}

/**
 * Розширення модуля N1 «Стрічка запису» під клієнта (ADR-0020, ADR-0054) — так виглядає файл проекту
 * `src/extensions/N1-timeline.ts`: менше дій на сторінку й посилання з рядка на картку запису.
 */
export const timelineExtension: TimelineExtension = {
  myActivities: {
    perPage: 5,
    recordHref: ({ resource, id }) =>
      Object.hasOwn(CARD_HREFS, resource)
        ? CARD_HREFS[resource]?.(id)
        : undefined,
  },
}
