import { lazyWithPreload } from "@/registry/lib/lazy"
import { parsePath, type Route } from "@/router"

/**
 * Кожна сторінка — окремий чанк (ADR-0009: JS першого екрана ≤ 250 КБ gzip), через
 * `lazyWithPreload` з lib/lazy. `preload` вантажить чанк заздалегідь — при наведенні чи фокусі на
 * посиланні й одразу на старті для поточної адреси, паралельно з мок-сервером. Збій завантаження
 * ловить ErrorBoundary в App.tsx: «Спробувати ще» вантажить чанк заново.
 */
export const PAGES = {
  appearance: lazyWithPreload(() =>
    import("./AppearancePage").then((m) => m.AppearancePage),
  ),
  primitives: lazyWithPreload(() =>
    import("./PrimitivesPage").then((m) => m.PrimitivesPage),
  ),
  // Поле телефону тягне дані libphonenumber (~120 КБ gzip).
  formats: lazyWithPreload(() =>
    import("./FormatsPage").then((m) => m.FormatsPage),
  ),
  // Календар (react-day-picker, локалі date-fns) і react-hook-form.
  fields: lazyWithPreload(() =>
    import("./FieldsPage").then((m) => m.FieldsPage),
  ),
  forms: lazyWithPreload(() => import("./FormsPage").then((m) => m.FormsPage)),
  icons: lazyWithPreload(() => import("./IconsPage").then((m) => m.IconsPage)),
  states: lazyWithPreload(() =>
    import("./StatesPage").then((m) => m.StatesPage),
  ),
  data: lazyWithPreload(() => import("./DataPage").then((m) => m.DataPage)),
  inbox: lazyWithPreload(() => import("./InboxPage").then((m) => m.InboxPage)),
  security: lazyWithPreload(() =>
    import("./SecurityPage").then((m) => m.SecurityPage),
  ),
  users: lazyWithPreload(() => import("./UsersPage").then((m) => m.UsersPage)),
  roles: lazyWithPreload(() => import("./RolesPage").then((m) => m.RolesPage)),
  company: lazyWithPreload(() =>
    import("./CompanyPage").then((m) => m.CompanyPage),
  ),
  profile: lazyWithPreload(() =>
    import("./ProfilePage").then((m) => m.ProfilePage),
  ),
  notifications: lazyWithPreload(() =>
    import("./NotificationsPage").then((m) => m.NotificationsPage),
  ),
  securityPolicy: lazyWithPreload(() =>
    import("./SecurityPolicyPage").then((m) => m.SecurityPolicyPage),
  ),
  audit: lazyWithPreload(() => import("./AuditPage").then((m) => m.AuditPage)),
  integrations: lazyWithPreload(() =>
    import("./IntegrationsPage").then((m) => m.IntegrationsPage),
  ),
} satisfies Record<Route, unknown>

export const AuthPage = lazyWithPreload(() =>
  import("./AuthPage").then((m) => m.AuthPage),
)
export const ModulePage = lazyWithPreload(() =>
  import("./ModulePage").then((m) => m.ModulePage),
)
// Картка рахунку (шаблон Object Page): журнал аудиту й діалог зміни — у її чанку, не в списку.
export const InvoicePage = lazyWithPreload(() =>
  import("./InvoicePage").then((m) => m.InvoicePage),
)

// Панель розробника — частина шару моків, поза бюджетом першого екрана (ADR-0009).
export const DevPanel = lazyWithPreload(() =>
  import("@/registry/erp/dev-panel").then((m) => m.DevPanel),
)
// Смуга «Увійти як…» потрібна лише адміністратору в цьому режимі, а модуль тягне діалог повторного
// підтвердження (поля пароля й коду), — окремим чанком.
export const ImpersonationBanner = lazyWithPreload(() =>
  import("@/registry/erp/impersonation").then((m) => m.ImpersonationBanner),
)

/** Попередньо завантажити чанк сторінки за адресою (`/settings/users`, `/m/K2?tab=1`, `/login`). */
export function preloadPage(href: string): void {
  // Без `new URL`: адреса з hash буває будь-якою (`#//`), а тут потрібен лише шлях.
  const location = parsePath(href.split(/[?#]/)[0] ?? "")
  const page =
    location.route === "auth"
      ? AuthPage
      : location.route === "module"
        ? ModulePage
        : location.route === "invoice"
          ? InvoicePage
          : PAGES[location.route]
  void page.preload()
}
