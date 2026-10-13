# Як підключити erp-ui у проект

Посібник для розробника, який починає або оновлює проект на кіті. Що є в кіті — [`CATALOG.md`](CATALOG.md). Рішення — [ADR-0004](adr/0004-registry-delivery.md).

## 0. Доступ (один раз)

Реєстр — приватний репозиторій `VasulenkoIllia/erp-ui`.

- На своєму комп'ютері: `gh auth login` (GitHub CLI). shadcn сам візьме доступ через `gh`.
- У CI проекту: fine-grained токен GitHub з правом **Contents: Read-only** лише на `erp-ui` → секрет `GH_TOKEN`.

## 1. Новий проект

```sh
pnpm create vite@latest my-erp -- --template react-ts
cd my-erp
pnpm add -D tailwindcss @tailwindcss/vite
# vite.config.ts: plugins: [react(), tailwindcss()], alias "@" → ./src; tsconfig: "paths": { "@/*": ["./src/*"] }
npx shadcn@latest init -b base -p nova
npx shadcn@latest add VasulenkoIllia/erp-ui/base
```

`base` ставить:
- теми й токени в `src/styles/erp-ui/` і замінює `src/index.css` точкою входу erp-ui (CLI спитає дозволу);
- `cn` у `src/lib/utils.ts` і `useResolvedTheme` у `src/hooks/`;
- мови й форматери: `src/lib/i18n.ts` (+ рядки кіта `i18n-uk.ts`, `i18n-en.ts`) і `src/lib/format.ts`;
- вподобання вигляду `src/lib/appearance.ts` + `src/hooks/use-appearance.ts` і словник іконок `src/lib/icons.tsx`;
- скіл для Claude Code у `.claude/skills/erp-ui/`, SPEC і каталог у `docs/erp-ui/`.

Після цього додайте в `CLAUDE.md` проекту рядок:

```md
@docs/erp-ui/CLAUDE.project.md
```

і заповніть у `docs/erp-ui/CLAUDE.project.md` модулі, палітру компанії й тип розгортання.

## 2. Компоненти

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/ui/button VasulenkoIllia/erp-ui/ui/dialog
npx shadcn@latest list VasulenkoIllia/erp-ui              # усе, що є
npx shadcn@latest search VasulenkoIllia/erp-ui -q таблиця  # пошук
```

Компоненти лягають у `src/components/ui/`, імпорти — `@/components/ui/button`. Кожен елемент приносить усе, що йому потрібно (наприклад, `ui/dialog` — ще й кнопку та `cn`).

## 3. Мови й формати

У `src/main.tsx` до рендеру застосуйте вподобання вигляду й створіть i18next із рядками проекту (ADR-0007, ADR-0008):

```tsx
import { initAppearance, syncLanguage } from "@/lib/appearance"
import { createI18n } from "@/lib/i18n"
import en from "@/i18n/en.json"
import uk from "@/i18n/uk.json"

initAppearance() // палітра, тема, щільність, сайдбар і мова з кешу (на сервері — PF11)
syncLanguage(
  createI18n({
    resources: { uk: { app: uk }, en: { app: en } },
    defaultNamespace: "app",
  }),
)
```

- Рядки компонентів кіта (простір імен `erp-ui`) підключаються самі. Перевизначити рядок: `i18n.addResourceBundle("uk", "erp-ui", { common: { close: "Закрити вікно" } }, true, true)`.
- Множина — ключі `_one/_few/_many/_other` для uk і `_one/_other` для en: `t("invoices", { count })`.
- Типізовані ключі — оголошення `CustomTypeOptions` у проекті (приклад — `apps/demo/src/i18n/i18next.d.ts` у репозиторії erp-ui).
- Числа, суми й дати — лише через `useFormat()` з `@/lib/format`. Не пишіть шаблони на кшталт `DD.MM.YYYY` і не викликайте `toLocaleString` напряму:

```tsx
const format = useFormat()
format.money({ amount: 4_860_000, currency: "UAH" }) // 48 600,00 ₴ · ₴48,600.00
format.date("2026-10-13", "long")                    // 13 жовтня 2026 · 13 October 2026
format.relative(updatedAt)                           // 5 хвилин тому · 5 minutes ago
```

- Мова даних (назви компаній, документи) — окремо від мови інтерфейсу: форматери з `lib/format` приймають локаль явно.
- Ідентифікатори й телефони: `npx shadcn@latest add VasulenkoIllia/erp-ui/erp/ua-id-input VasulenkoIllia/erp-ui/erp/phone-input`. Перевірка — `validateUaId(kind, value)` і `validatePhone(value)`; текст помилки — `t(uaIdIssueKey(kind, issue))` з `useErpUiT()`.
- Поле телефону тягне дані libphonenumber (~120 КБ gzip): вантажте екрани з ним окремим чанком (`React.lazy`).

## 4. Оболонка застосунку

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/erp/app-shell VasulenkoIllia/erp-ui/erp/command-palette \
  VasulenkoIllia/erp-ui/erp/user-menu VasulenkoIllia/erp-ui/erp/company-switcher \
  VasulenkoIllia/erp-ui/erp/notification-bell VasulenkoIllia/erp-ui/erp/page-state
```

```tsx
<IconProvider>
  <TooltipProvider>
    <AppShell
      nav={[{ id: "sales", label: t("nav.sales"), items: [
        { id: "K2", label: kitT("modules.K2"), href: "/invoices", icon: MODULE_ICONS.K2, mobile: true },
      ] }]}
      activeId="K2"
      breadcrumbs={[{ label: t("nav.sales") }, { label: kitT("modules.K2") }]}
      header={<CompanySwitcher companies={companies} value={companyId} onValueChange={setCompanyId} />}
      actions={<>
        <CommandPaletteTrigger onClick={openPalette} />
        <NotificationBell count={unread} />
        <UserMenu user={me} onSignOut={signOut} />
      </>}
      renderLink={(href) => <Link to={href} />} // React Router; без нього — <a href>
    >
      {page}
    </AppShell>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
  </TooltipProvider>
</IconProvider>
```

- Десктоп — сайдбар із групами, планшет — вузька панель з іконками, телефон — нижня панель (пункти з `mobile: true`, до 4) + «Ще».
- Іконки модулів, статусів і дій — лише з `lib/icons` (`MODULE_ICONS`, `STATUS_ICONS`, `ACTION_ICONS`); гривня — `HryvniaIcon`.
- Стани списків і сторінок — `PageState` і `PageSkeleton` з `erp/page-state`; порожній стан не підміняє помилку.
- Сітки сторінок — з `grid-cols-1` (`minmax(0, 1fr)`), інакше широка таблиця розпирає сторінку на телефоні.

Щоб тема не блимала до завантаження JS, додайте в `<head>` `index.html` (логіка — як у `lib/appearance`):

```html
<script>
  ;(function () {
    var root = document.documentElement, a = {}
    try { a = JSON.parse(localStorage.getItem("erp-ui:appearance") || "{}") || {} } catch (e) {}
    root.dataset.palette = a.palette || "sapphire"
    root.classList.toggle("dark", a.theme === "dark" ||
      (a.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches))
    if (a.density === "compact") root.dataset.density = "compact"
    if (a.sidebar === "dark") root.dataset.sidebar = "dark"
    root.lang = a.language === "en" ? "en" : "uk"
  })()
</script>
```

## 5. Дані, вхід і моки

Шар даних (ADR-0002, ADR-0003) і моки ставляться двома пакунками:

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/data VasulenkoIllia/erp-ui/mocks
npx msw init public   # service worker для моків у браузері
```

```tsx
// src/data/providers.ts
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
export const api = createApiClient({ getCompanyId }) // X-Company-Id, cookie-сесія
export const authProvider = createAuthProvider(api, {
  onMe: (me) => {
    if (me) ensureCompany(me) // компанія за замовчуванням — до перших запитів даних
    queryClient.setQueryData(ME_QUERY_KEY, me)
  },
})
export const dataProvider = createDataProvider(api)

// src/main.tsx
if (import.meta.env.DEV) {
  const { setupWorker } = await import("msw/browser")
  await setupWorker(...createPlatformHandlers({ users }), ...invoices.handlers).start()
}
createRoot(root).render(
  <CoreAdminContext dataProvider={dataProvider} authProvider={authProvider}
    i18nProvider={createRaI18nProvider(i18n)} queryClient={queryClient}>
    <App />
  </CoreAdminContext>,
)
```

- Список: `useGetList("invoices", { pagination, sort, filter: { status: ["paid", "sent"], amount_gte: 10000, q } })` → `GET /api/v1/invoices?status=paid&status=sent&amount_gte=10000&q=…&sort=-date&page=1&perPage=25`.
- Профіль і права: `useMe()` (`null` — гість), `useCanAccess({ resource: "invoices", action: "edit" })`. Дія без права — неактивна кнопка у фокусі з підказкою-причиною.
- Сторінка лише для користувачів — `useAuthenticated()`: без сесії перенаправить на `/login` і поверне назад після входу (`useLogin`).
- Збереження: `useUpdate` у режимі `pessimistic` надсилає змінені поля + `version`; 409 → `ConflictDialog` з `error.current`.
- Текст помилки — `useApiErrorMessage()(error)`; стани списку — `PageState` за `error.code` (`offline`, 403 → `forbidden`, інше → `error`).
- Вподобання на сервері — `syncPreferences(api)` після входу (повертає функцію зупинки).
- Моки: `createResourceHandlers({ resource, schema, data, searchFields })` дає CRUD із фільтрами, сортуванням, правами й версіями. `<DevPanel resources={["invoices"]} compact onChange={() => queryClient.invalidateQueries()} />` — у `actions` топбара, лише в розробці.
- Повний приклад — `apps/demo` у репозиторії erp-ui: `src/data/providers.ts`, `src/mocks/`, `src/pages/DataPage.tsx`, `src/pages/LoginPage.tsx`.

## 6. Вигляд

Палітра, тема, щільність і сайдбар задаються атрибутами `<html>` (SPEC §6.2):

```html
<html lang="uk" data-palette="sapphire" class="dark" data-density="compact" data-sidebar="dark">
```

Палітри: `sapphire`, `graphite` (основні), `indigo`, `teal`, `terracotta`. Без класу `dark` — світла тема.

## 7. Оновлення

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/ui/button --diff   # що зміниться, нічого не записує
npx shadcn@latest add VasulenkoIllia/erp-ui/ui/button          # застосувати
```

- Що змінилося між версіями — `CHANGELOG.md` у репозиторії erp-ui. Мажорна версія — лише при зміні токенів чи публічного API.
- Закріпити версію: `…/ui/button#v0.1.0` (git-тег; список — теги репозиторію й `CHANGELOG.md`). Без `#…` береться найновіше з `main`.
- Якщо компонент довелося змінити в проекті — позначте правку `// erp-ui: local override — <причина>`. При оновленні вона буде видна в `--diff`, а вдалу правку варто перенести в реєстр.

## 8. Чого не робити

- Не копіювати компоненти руками з репозиторію — лише через `shadcn add` (так працюють оновлення).
- Не писати кольори, розміри й шрифти повз токени. Потрібен новий токен — він додається в erp-ui.
- Не писати тексти інтерфейсу в коді й не форматувати числа чи дати вручну — лише i18n і `lib/format`.
- Не ставити поверх стилів erp-ui інші shadcn-стилі чи компоненти з інших реєстрів напряму. Вони спершу перебудовуються в реєстрі (ADR-0006).
