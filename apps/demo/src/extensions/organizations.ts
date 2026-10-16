import { lazy } from "react"

import type { OrganizationsExtension } from "@/pages/organization-extension"

/**
 * Розширення картки організації (ADR-0020) — вкладка проекту «Нотатки» після «Реквізитів». Компонент
 * вкладки вантажиться окремим чанком, лише коли вкладку відкривають: шаблон показує скелетон
 * секції, поки чанк іде (ADR-0024). Файли картки (`pages/OrganizationPage.tsx`) для цього не
 * змінювались. Довідник організацій — зразок даних модуля B1 «Контакти й компанії» (крок 1.4).
 */
export const organizationsExtension: OrganizationsExtension = {
  sections: {
    add: [
      {
        id: "notes",
        title: { uk: "Нотатки", en: "Notes" },
        component: lazy(() => import("./organizations-notes")),
        place: { after: "requisites" },
      },
    ],
  },
}
