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
# vite.config.ts: plugins: [react(), tailwindcss()], alias "@" → ./src
# "paths": { "@/*": ["./src/*"] } — і в tsconfig.json, і в tsconfig.app.json (шаблон Vite ділить їх)
npx shadcn@latest init -b base -p nova
# package.json: "shadcn": "4.22.0" без ^ — та сама CLI для встановлення й оновлення (розділ 8)
pnpm exec shadcn add VasulenkoIllia/erp-ui/base#v1.0.0
pnpm remove @fontsource-variable/geist   # шрифт від init: Geist тепер ставить base (@fontsource/geist)
git add -A && git commit -m "erp-ui: base v1.0.0"   # команда кіта пише лише в чисте дерево
node scripts/erp-ui-kit.mjs update v1.0.0 --items base,data,mocks,auth,erp/app-gate,erp/auth-routes,erp/app-shell,erp/user-menu,lib/query-client,tools/e2e
```

Останній рядок ставить решту кіта з тегу (розділи 4–6) одним запитом і записує `kit-files.json`: список встановлених елементів і відбитки файлів кіта. Далі нові елементи — `update v1.0.0 --add <елемент>`, оновлення — розділ 8. У `pnpm lint` проекту додайте `node scripts/erp-ui-kit.mjs check`: перевірка, що файли кіта в проекті не правлені.

Код кіта компілюється й з налаштуваннями шаблону Vite (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`), перевірено тестовим проектом (крок 1.5b). Лінтер і форматер проекту (oxlint чи ESLint шаблону, Prettier) налаштуйте без файлів кіта (`src/components`, `src/hooks`, `src/lib`, `src/modules`, `src/styles/erp-ui`, `scripts/erp-ui-kit*.mjs`, `e2e/erp-ui.ts`, `docs/erp-ui`): їх перевіряє лінтер кіта, а правити їх у проекті не можна — `check` (розділ 8) не пропустить і переформатування.

`base` ставить:
- теми й токени в `src/styles/erp-ui/` і замінює `src/index.css` точкою входу erp-ui (CLI спитає дозволу);
- `cn` у `src/lib/utils.ts` і `useResolvedTheme` у `src/hooks/`;
- мови й форматери: `src/lib/i18n.ts` (+ рядки кіта `i18n-uk.ts`, `i18n-en.ts`) і `src/lib/format.ts`;
- вподобання вигляду `src/lib/appearance.ts` + `src/hooks/use-appearance.ts` і словник іконок `src/lib/icons.tsx`;
- скіл для Claude Code у `.claude/skills/erp-ui/`, SPEC і каталог у `docs/erp-ui/`;
- команду кіта `scripts/erp-ui-kit.mjs` (+ `erp-ui-kit-lib.mjs`): оновлення й перевірка файлів кіта (розділ 8, ADR-0029).

Після цього додайте в `CLAUDE.md` проекту рядок:

```md
@docs/erp-ui/CLAUDE.project.md
```

і заповніть у `docs/erp-ui/CLAUDE.project.md` модулі, палітру компанії й тип розгортання.

## 2. Компоненти

```sh
node scripts/erp-ui-kit.mjs update v1.0.0 --add ui/button,ui/dialog
npx shadcn@latest list VasulenkoIllia/erp-ui              # усе, що є
npx shadcn@latest search VasulenkoIllia/erp-ui -q таблиця  # пошук
```

Компоненти лягають у `src/components/ui/`, імпорти — `@/components/ui/button`. Кожен елемент приносить усе, що йому потрібно (наприклад, `ui/dialog` — ще й кнопку та `cn`). Ставте елементи командою кіта (`--add`), а не `shadcn add` напряму: так елемент потрапляє в `kit-files.json` і оновлюється разом з рештою (§8). Команди `shadcn add VasulenkoIllia/erp-ui/<елемент>` у розділах нижче — назви елементів для `--add`.

## 3. Мови й формати

У `src/main.tsx` до рендеру застосуйте вподобання вигляду й створіть i18next із рядками проекту (ADR-0007, ADR-0008):

```tsx
import { getAppearance, initAppearance, syncLanguage } from "@/lib/appearance"
import { createI18n, whenI18nReady } from "@/lib/i18n"
import uk from "@/i18n/uk.json"

initAppearance() // палітра, тема, щільність, сайдбар і мова з кешу (на сервері — PF11)
const i18n = createI18n({
  language: getAppearance().language,
  resources: {
    uk: { app: uk },
    // Інші мови — окремим чанком: у пам'яті лише мова інтерфейсу (ADR-0009).
    en: () => import("@/i18n/en.json").then((m) => ({ app: m.default })),
  },
  defaultNamespace: "app",
})
syncLanguage(i18n)
await whenI18nReady(i18n) // перший кадр — уже потрібною мовою, без проблиску української
```

- Рядки компонентів кіта (простір імен `erp-ui`) підключаються самі: українські — у бандлі, англійські довантажуються, коли потрібні. `changeLanguage` чекає на рядки, тож мова перемикається вже з перекладами. Перевизначити рядок: `i18n.addResourceBundle("uk", "erp-ui", { common: { close: "Закрити вікно" } }, true, true)`. Для інших мов — лише після того, як мову завантажено (`await i18n.loadLanguages("en")`): раніше доданий бандл позначить простір імен готовим, і кіт свої рядки цієї мови не довантажить.
- Мова не довантажилась (офлайн): два повтори, далі запасна українська й `<html lang="uk">`; наступний `changeLanguage` пробує знову. Скажіть про це людині, поки `toLanguage(i18n.language) !== toLanguage(i18n.resolvedLanguage)`: сповіщення з «Повторити» (`i18n.changeLanguage(i18n.language)`), зразок — `apps/demo/src/i18n/fallback-notice.ts` у репозиторії erp-ui.
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
- Поле телефону тягне дані libphonenumber (~120 КБ gzip): вантажте екрани з ним окремим чанком (`lazyWithPreload` з `@/lib/lazy`).
- Вибір запису з пошуком на сервері (компанія контакту, відповідальний) — `erp/record-picker` (ADR-0023): значення — `id`, `optionLabel` і `sort` від проекту, «Створити…» — `create.onCreate(query)` відкриває форму проекту, а новий запис проект сам ставить у значення. Реквізити в картці з «Копіювати» — `erp/copyable-value` (`kind`: `code`, `iban`, `phone`, `email`, `url`).
- Кілька значень із короткого довідника (сегменти, теги, ролі) — `MultiSelect` з `erp/multi-select` (ADR-0027): `options` — `{ value, label, description? }[]` (поки довідник вантажиться — не задавайте; не завантажився — `error` і `onRetry`), значення — масив ключів (`value`, `onValueChange`), `clearable`; на телефоні — шторка з «Готово». Ключ, якого вже немає в довіднику, лишається міткою, і його можна зняти. У `FormField` — `{...control}`, `value={field.value}`, `onValueChange={field.onChange}`, `onBlur={field.onBlur}`. Довідник на сотні записів і пошук на сервері — не сюди: мультивибору з пошуком на сервері ще немає.

### Форми, дати, суми й підтвердження (ADR-0015)

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/erp/form VasulenkoIllia/erp-ui/erp/date-input VasulenkoIllia/erp-ui/erp/number-input VasulenkoIllia/erp-ui/erp/confirm-dialog
```

- Форма — react-hook-form + zod: `useForm({ mode: "onTouched", resolver: zodResolver(schema) })`. Схему будуйте в компоненті з `useErpUiT()`/`t` у `useMemo`, щоб помилки були мовою інтерфейсу. Зразок — `erp/profile-form`, повний приклад — `apps/demo/src/pages/FormsPage.tsx`.
- Пакети `zod` і `@hookform/resolvers` ставить `erp/profile-form`; для своїх форм без нього — `pnpm add zod @hookform/resolvers`.
- Поле — `FormField` з `control` і `name`; у `render` віддайте `control`-пропси керуванню (`<Input {...control} {...field} />`). Для полів дати, суми й телефону — явно: `ref={field.ref} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur}`. Поле без прав — `readOnly`, не `disabled`. Схема з `.transform`/`z.coerce` — `useForm<Вхід, unknown, Вихід>`.
- Над полями — `FormErrorSummary` (`errors`, `submitCount`, `labels`); під формою — `UnsavedChangesGuard when={isDirty}` (і під час збереження: після успіху перехід відбудеться сам).
- «Зберегти» не вимикайте: лише `disabled={isSubmitting} focusableWhenDisabled`. Помилки полів від сервера (422) — `form.setError(name, { type: "server", message })`.
- Кнопкам форми (відправка, «Скасувати») — `onMouseDown={keepFieldFocus}` з `erp/form` (ADR-0027): поле перевіряється при виході з нього, і без цього помилка під полем зсуває кнопку між натисканням і відпусканням миші — перший клік губиться. Клавіатури й дотику це не змінює.
- Дата — `DateInput` зі значенням `"2026-10-13"` або `""`; неповне введення приходить текстом, текст помилки для схеми — `useDateIssueText()(value, { min, max })` (null — помилки немає). Період — `DateRangeInput` (`{ from, to }` або `null`), час — `TimeInput`.
- Сума — `MoneyInput` зі значенням `Money` (цілі копійки й валюта) або `null`; число — `NumberInput` (за замовчуванням ціле: кома й дріб не вводяться, під полем спливає «Лише ціле число»; дріб — `decimalScale`). Сума прописом для документів — `amountInWords(money, "uk")` з `lib/amount-in-words`.
- Підтвердження: зворотна дія — `useUndoToast()`; видалення — `ConfirmDialog` з кнопкою, що називає наслідок; критична дія — ще й `confirmWord`.
- Календар (react-day-picker і date-fns) і react-hook-form важать помітно: вантажте сторінки з формами окремим чанком (`lazyWithPreload` з `@/lib/lazy`).
- Форма запису ресурсу (створення й зміна) — `RecordFormDialog` з `erp/record-form` і `useRecordForm` з `hooks/use-record-form` (ADR-0026): `const state = useRecordForm({ resource, record, schema, defaultValues, recordSchema, toPayload, toValues, onSaved })` створює форму з налаштуваннями вище (`state.form`), `POST` усіх полів, `PATCH` лише змінених з `version`, 409 — порівняння змінених полів («Зберегти мої зміни», «Взяти збережене»; `current` розбирає `recordSchema` — схема контракту з полями розширення), 422 — біля полів і в зведенні (поле, якого у формі немає, — над формою), «Закрити без збереження?» для зміненої форми. `finalFocus` — кнопка, що відкрила форму (Safari кнопку кліком не фокусує); форма поверх іншої форми — `nested`. Поля — `RecordFormItem` (`{ id, label, description?, wide?, render, text? }`, ключ — ім'я поля форми), вибір зі списку — `FormSelect` з `erp/form-select`. Діалог монтуйте, лише поки він відкритий (`{editing ? <Форма /> : null}`); `onSaved` викликається після рендера зі скинутою формою, тож перехід на картку нового запису в ньому не зупиняє `UnsavedChangesGuard`. Форма тягне react-hook-form і поля вводу: у сторінку її ставте лінивим чанком (`lazyWithPreload`, попереднє завантаження через `whenIdle`), поки чанк вантажиться чи не завантажився — діалог із назвою форми, спінером чи «Спробувати ще» (так у B1, `components/form-dialogs.tsx`).
- Елемент вкладеної колекції запису (адреса, банківський рахунок, ADR-0028) — та сама форма запису: `PATCH` запису з усією колекцією й `version`, тож чужа зміна колекції дає 409, а не губиться. `toPayload(values, keys, target)` застосовує зміну до `target` — збереженого запису, а після «Зберегти мої зміни» — того, що збережений зараз; `id` нового елемента дає сервер. Помилка сервера зі шляхом елемента (`bankAccounts.1.iban`) стає біля поля форми через `fieldOfServerError: (field) => field.replace(/^bankAccounts\.\d+\./, "")`. У моках `createResourceHandlers` такі колекції — `detailFields` (зберігаються разом із записом, у список не йдуть), показ у журналі «було → стало» — `auditValue`. Зразок — форми адреси й рахунку в B1 (`components/address-form.tsx`, `components/bank-account-form.tsx`).

## 4. Оболонка застосунку

```sh
node scripts/erp-ui-kit.mjs update v1.0.0 --add erp/app-gate,erp/app-shell,erp/command-palette,erp/user-menu,erp/company-switcher,erp/notification-inbox
```

Застосунок — брама сесії навколо оболонки, екрани входу поруч (розділ 6):

```tsx
const auth = useMemo(() => createAuthRoutes({ afterLogin: "/", title: t("app.title") }), [t])   // erp/auth-routes
const signOut = useSignOut()                                                 // erp/app-gate

useRoutes([
  ...auth.routes,
  { path: "*", element: <SessionGate><Shell /></SessionGate> },
])
```

`SessionGate` (ADR-0029): гість — на `/login` (після входу ra-core поверне на ту саму адресу); поки сесія й профіль перевіряються вперше — спінер (повторна перевірка після «Увійти як…» оболонку не прибирає); профіль не завантажився (мережа, 5xx) — стан помилки з h1 і «Спробувати ще», а не «Увійти»: людина, можливо, вже увійшла; далі — вміст і `SessionGuard` (попередження перед кінцем сесії, автовихід за політикою сервера, вихід у всіх вкладках). `SessionGuard` окремо не ставте: брама ставить його сама, свої параметри — `<SessionGate idleMinutes={30} warnSeconds={120}>`. `useSignOut()` — для меню користувача: «Ви вийшли» чи помилка, якщо сервер не завершив сесію (офлайн, 5xx, 10 с без відповіді), щоб людина не думала, що вийшла. Потрібен `<Toaster />` з `ui/sonner`.

```tsx
<IconProvider>
  <TooltipProvider>
    <AppShell
      nav={[{ id: "sales", label: t("nav.sales"), items: [
        { id: "K2", label: kitT("modules.K2"), href: "/invoices", icon: MODULE_ICONS.K2, mobile: true },
      ] }]}
      activeId="K2"
      breadcrumbs={[{ label: t("nav.sales") }, { label: kitT("modules.K2"), href: "/invoices" }, { label: invoice.number }]}
      header={<CompanySwitcher companies={me.companies} value={companyId ?? ""} onValueChange={switchCompany} />}
      actions={<>
        <CommandPaletteTrigger onClick={openPalette} />
        <InboxBell onNavigate={navigate} onShowAll={() => navigate("/notifications")} />
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

- Компанія: `const [companyId, switchCompany] = useCompany()` з `hooks/use-company` (пакунок `data`). Перемикання скасовує запити, скидає дані попередньої компанії й перечитує профіль; свої `useQuery` з даними компанії додають у кінець ключа `companyScope(useCompanyId())` з `lib/company-scope`. Компанія з іншого джерела (напр. з адреси сторінки) — через `setCompanyId` з `lib/company-scope`: `X-Company-Id` і ключі кешу беруться лише звідти.
- Крихти: остання без `href` — поточна сторінка, з `href` — посилання (список над карткою запису, як у прикладі), тож крихті поточної сторінки `href` не давайте; інша крихта без `href` — підпис групи. На телефоні видно лише останню.
- Десктоп — сайдбар із групами, планшет — вузька панель з іконками, телефон — нижня панель (пункти з `mobile: true`, до 4) + «Ще».
- Іконки модулів, статусів і дій — лише з `lib/icons` (`MODULE_ICONS`, `STATUS_ICONS`, `ACTION_ICONS`); гривня — `HryvniaIcon`.
- Стани списків і сторінок — `PageState` і `PageSkeleton` з `erp/page-state`; порожній стан не підміняє помилку. Рівень заголовка стану — `headingLevel`: 2 за замовчуванням (під h1 сторінки), 1 — стан замість усієї сторінки («Не знайдено» картки), 3 — стан секції чи вкладки.
- Сітки сторінок — з `grid-cols-1` (`minmax(0, 1fr)`), інакше широка таблиця розпирає сторінку на телефоні.
- Сторінки — лінивими чанками через `lazyWithPreload` з `@/lib/lazy`, не `React.lazy`: той запам'ятовує невдале завантаження назавжди. Сторінку обгорніть у межу помилок із ключем-адресою, тоді чанк, що не завантажився (офлайн, застарілий після деплою), покаже «Спробувати ще» (а після невдалого повтору — й «Оновити сторінку»), а не білий екран. Помилки в моніторинг — `onError` межі. `LoadingFallback` з `erp/page-state` оголошує скрінрідеру «Завантаження», якщо чанк вантажиться понад секунду (новий `role="status"` у fallback скрінрідер часто не озвучує):

  ```tsx
  const InvoicesPage = lazyWithPreload(() => import("@/pages/InvoicesPage").then((m) => m.InvoicesPage))

  <ErrorBoundary key={pathname}>
    <Suspense fallback={<LoadingFallback />}>
      <InvoicesPage />
    </Suspense>
  </ErrorBoundary>
  ```

  Чанк вантажте заздалегідь, коли на посилання навели чи сфокусувались: `renderLink={(href) => <Link to={href} onPointerEnter={() => preloadPage(href)} onFocus={() => preloadPage(href)} />}`, де `preloadPage` викликає `.preload()` сторінки за адресою (зразок — `apps/demo/src/pages/lazy-pages.ts` у репозиторії erp-ui). Палітра команд сама вантажить пошук, коли браузер вільний (ADR-0009).

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
node scripts/erp-ui-kit.mjs update v1.0.0 --add data,mocks,lib/mock-views,lib/query-client
npx msw init public --save   # service worker для моків у браузері; без --save MSW питає в терміналі
```

Списки на шаблоні List Report читають особисті види (`/me/views`) і розмір сторінки (`/me/list-settings/<ресурс>`): у моках це `createSavedViewHandlers()` з `@/lib/mock-views` (окремий елемент `lib/mock-views`) і `createListSettingsHandlers()` з `@/lib/mock-lists` поруч з обробниками ресурсів.

```tsx
// src/data/providers.ts
// Політика повторів кіта (lib/query-client, ADR-0029): читання — один повтор через 1 с лише після
// тимчасового збою (офлайн, 5xx); 4xx (зокрема 401 — кінець сесії) і зміни — без повтору.
export const queryClient = createQueryClient()
// X-Company-Id — лише з lib/company-scope (компанію з профілю вибирає authProvider), cookie-сесія
export const api = createApiClient()
export const authProvider = createAuthProvider(api, {
  onMe: (me) => queryClient.setQueryData(ME_QUERY_KEY, me),
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
- Таблиця (ADR-0016) — `DataTable` з `erp/data-table`: колонки описуються один раз для гріда й карток (на контейнері вужчому за 40 rem — картки), сортування й фільтри — на сервері.

  ```tsx
  const columns: DataTableColumn<Invoice>[] = [
    { id: "number", header: t("number"), cell: (r) => r.number, sortField: "number", sticky: true, card: "title" },
    { id: "client", header: t("client"), cell: (r) => r.client, priority: 2, overflow: "wrap", card: "subtitle" },
    { id: "amount", header: t("amount"), cell: (r) => format.money(r.amount, r.currency), sortField: "amount", align: "end", firstSortOrder: "DESC" },
    { id: "dueDate", header: t("dueDate"), cell: (r) => format.date(r.dueDate), priority: 3, overflow: "hide" },
  ]
  // Великий список: вікна по 100 з сервера, прокрутка на висоту екрана.
  const list = useWindowedList<Invoice>("invoices", { sort, filter })
  <DataTable label={t("tableLabel")} columns={columns} getRowId={(r) => r.id} list={list} sort={sort} onSortChange={setSort}
    isFiltered={Boolean(filter.q)} onResetFilters={reset} countLabel={(count, value) => t("count", { count, value })} />
  // Малий список: rows={data} pagination={{ page, perPage, total, onPageChange }} і стани з useGetList.
  ```

  Стани (скелетон, оновлення, порожньо, нічого не знайдено, помилка, немає доступу, офлайн, збій частини рядків) таблиця показує сама; `useUpdate` оновлює рядок у кеші вікна. Сторінку списку цілком збирає шаблон List Report (нижче); колонки рахунків у демо — `src/pages/invoice-columns.tsx`.
- Сторінка списку (ADR-0022) — шаблон List Report з `templates/list-report`: заголовок і дії, вкладки-статуси, панель фільтрів, особисті збережені види (ADR-0017), панель масових дій і таблиця. Стан списку живе в адресі сторінки тим самим синтаксисом, що й запит до API (`?tab=overdue&client=A&amount_gte=1000000&sort=-date`); роутер дає застосунок:

  ```tsx
  const tabs: ListTab[] = [{ id: "all", label: t("all"), filter: {} }, { id: "overdue", label: t("overdue"), filter: { status: "overdue" } }]
  const filters: FilterDefinition[] = [
    { kind: "options", id: "client", field: "client", label: t("client"), options },
    { kind: "date-range", id: "date", field: "date", label: t("date") },         // date_gte, date_lte
    { kind: "money-range", id: "amount", field: "amount", label: t("amount"), currency: "UAH" }, // мінорні одиниці
  ]
  // tabs, filters, defaults і columns — стабільні між рендерами (useMemo чи константа модуля).
  const [params, setParams] = useSearchParams()                  // React Router
  const report = useListReport({ resource: "invoices", params, onParamsChange: setParams, tabs, filters,
    defaults: { tab: "all", sort: { field: "date", order: "DESC" }, sortFields: ["number", "date", "amount"] } })
  <ListReport report={report} title={t("title")} tableLabel={t("tableLabel")} columns={columns}
    tabsLabel={t("status")} searchPlaceholder={t("search")} countLabel={(count, value) => t("count", { count, value })}
    actions={[{ id: "create", node: <Button onClick={create}>{t("create")}</Button> }]}
    mode="scroll" />                                             // малий список — mode="pages"
  ```

  Колонки, фільтри, вкладки й дії — списки з ключами, порядок на екрані — порядок у списку: розширення модуля додає, ховає чи переставляє елемент за ключем (ADR-0020). Поки види вантажаться, таблиця — скелетон: дані не вантажаться двічі. Без `title` шапки в шаблоні немає: її ставить сторінка (`ListReportHeader`), напр. над перевіркою сесії, щоб шапка не з'являлась заново. Збирати список вручну з `StatusTabs`, `FilterBar`, `SavedViewsMenu`, `useListState` і `DataTable` не треба; повний приклад — `src/pages/DataPage.tsx` у демо.

  Закріплення записів угорі списку (ADR-0024) — колонка `usePinColumn({ resource, name })` з `erp/pin-toggle` першою в `columns` і `isPinned={isPinned}` (з `lib/pins`) у `ListReport`; порядок «закріплені спершу» дає сервер (`PUT`/`DELETE /<ресурс>/:id/pin`, `pinned: true` у відповіді), у моках — `pins: true` у `createResourceHandlers`. У шапці картки — `<PinToggle variant="button" … />`. Бекенд без закріплення — розширення ховає колонку `pin`. Розмір сторінки в `mode="pages"` запам'ятовується сам (`/me/list-settings/<ресурс>`, у моках — `createListSettingsHandlers()`); інші розміри — `perPageOptions`, без вибору — `perPageOptions={[]}`.

  Адреса — ввід ззовні: з `filters` у запит ідуть лише описані фільтри й `q`, сортування — лише за `sortFields`. Поки види вантажаться, `isReady` — false: якщо сторінку відкрили без параметрів, спершу застосується вид за замовчуванням, і список не вантажиться двічі. Бекенд реалізує `/me/views` за контрактом `lib/saved-views`; у моках — `createSavedViewHandlers()` поруч з іншими обробниками, сценарій — ресурс `views` у панелі розробника.
- Картка запису (ADR-0019) — шаблон Object Page з `templates/object-page`: «Назад до списку», шапка з даних (назва — h1, статус, ключові поля, дії), смуга етапів, секції й стрічка запису праворуч чи вкладкою (за шириною контейнера):

  ```tsx
  const heading = useRef<HTMLHeadingElement>(null)
  // Фокус на h1 після переходу (WCAG 2.4.3), той самий хук — для списку; адресу дає роутер.
  useFocusHeadingOnNavigation(heading, useLocation().pathname, !isPending || pageError !== undefined)
  <ObjectPage title={t("invoice")} headingRef={heading} back={<BackLink />}
    isPending={isPending} error={pageError} onRetry={retry}
    header={invoice && { title: t("title", { number: invoice.number }), status: <StatusBadge status={invoice.status} />,
      fields: [{ id: "client", label: t("client"), value: invoice.client }],
      actions: [{ id: "edit", node: <EditButton invoice={invoice} /> }] }}
    statusBar={invoice && <RecordStatusBar label={t("steps")} steps={steps} current={invoice.status} />}
    sections={invoice ? [{ id: "lines", title: t("lines"), content: <InvoiceLines invoice={invoice} /> }] : []}
    aside={{ label: t("history"), content: <AuditLog filter={{ targetType: "invoices", targetId: id }} /> }} />
  ```

  Ключові поля, дії й секції — списки з ключами, як у List Report. Поки запису немає, `header` не передається: h1 — прихований `title`. Дані — `useGetOne` з `meta` компанії: шапка одразу з кешу списку, детальний запис (рядки документа) — з `GET /<ресурс>/:id` (у моках — опція `detail`; поле, значення якого не повторюється в компанії, — `unique: ["name"]`, сервер відповідає 422 `duplicate`); помилку запису передавай лише коли запису немає, інакше це стан секції. Повний приклад — `src/pages/InvoicePage.tsx` у демо.

  Багато розділів — вкладками (ADR-0024): `tabs={{ value: searchParams.get(TAB_PARAM), onValueChange: (tab) => setSearchParams(…, { replace: true }) }}`. Вкладки — ті самі `sections` з ключами (вкладка розширення — секція слота), змонтована лише вибрана, тож вкладка вантажить свої дані, коли її відкрили; невідомий ключ з адреси — перша вкладка; на вузькому контейнері стрічка — остання вкладка (`OBJECT_PAGE_ASIDE_TAB`). Приклад — `src/pages/OrganizationPage.tsx` у демо.
- Вибір рядків і масові дії (ADR-0018). Вибір живе на сторінці й скидається зі зміною фільтра; таблиця сама додає колонку прапорців і панель вибраного. Дія — фонова задача сервера, прогрес і підсумок — у сповіщенні, що живе поза сторінкою:

  ```tsx
  const selection = useRowSelection([list.queryFilter, companyId])   // hooks/use-row-selection
  const dataProvider = useDataProvider<ErpDataProvider>()
  const approve = async () => {
    // У try — лише запуск: задачу прийнято, далі тільки показ (повторне «Погодити» не дублює її).
    const started = await dataProvider.startBulk("invoices", "approve", toBulkSelection(selection.state, list.queryFilter))
      .catch((error: unknown) => { toast.error(errorMessage(error)); return null })
    if (!started) return
    selection.clear()
    showJobProgress({ jobId: started.jobId, title: t("approving"), failureLabel: (code) => t(`reasons.${code}`, { defaultValue: "" }) || undefined })
  }
  <DataTable … selection={selection} rowLabel={(row) => t("rowLabel", { number: row.number })}
    bulkActions={(count) => <Button onClick={() => setConfirm(count)}>{t("approve")}</Button>} />
  ```

  У шаблоні List Report вибір — `report.selection`, фільтр — `report.list.queryFilter`, а кнопки — `bulk={{ actions: [{ id: "approve", render: (count) => … }], rowLabel }}`; без `bulk` прапорців немає. `selection` передається лише разом із `rowLabel` (це перевіряє тип). У «Прокрутці» прапорець у шапці вибирає всі записи за фільтром (зняті — винятки, запит `{ filter, exclude }`), на сторінках — сторінку, далі панель пропонує «Вибрати всі N»; у картках цей прапорець із підписом стоїть у рядку стану. Підтвердження з кількістю — `ConfirmDialog` на сторінці (не в панелі: панель зникає разом із вибором), `returnFocus={() => tableTabStop(table)}`. Бекенд реалізує `POST /<ресурс>/bulk/<дія>` і `/jobs/:id` за контрактом `lib/jobs`; у моках — `createBulkHandlers({ resource, db, actions })` і `createJobHandlers()` перед обробниками ресурсу, сценарій опитування — ресурс `jobs`.
- Редагування в комірці — `EditableCell` з `erp/editable-cell` у `cell` колонки: значення одразу (`useOptimistic`), відмова сервера — відкат і сповіщення з «Повторити», помилка перевірки — під полем. Зберігай через `useUpdate` у режимі `pessimistic` з `returnPromise: true` і `version` рядка; збереження одного запису з різних комірок став у чергу з версією попереднього (приклад — `invoice-cells.tsx` демо), інакше друга комірка отримає 409 на власну зміну людини. Конфлікт (409) обробляй в `onError` діалогом `ConflictDialog` сторінки, перевіривши `error.current` схемою (без запису — поверни false, і кіт покаже сповіщення). Важкий редактор (поле суми) — лінивим у `ErrorBoundary` + `Suspense`: `ref` з `inputProps` фокусує поле, щойно воно змонтувалось.
- Профіль і права: `useMe()` (`null` — гість), `useCanAccess({ resource: "invoices", action: "edit" })`. Дія без права — неактивна кнопка у фокусі з підказкою-причиною.
- Сторінка лише для користувачів — `useAuthenticated()`: без сесії перенаправить на `/login` і поверне назад після входу (`useLogin`).
- Збереження: `useUpdate` у режимі `pessimistic` надсилає змінені поля + `version`; 409 → `ConflictDialog` з `error.current`.
- Текст помилки — `useApiErrorMessage()(error)`; стани списку — `PageState` за `error.code` (`offline`, 403 → `forbidden`, інше → `error`).
- Вподобання на сервері — `syncPreferences(api)` після входу (повертає функцію зупинки).
- Моки: `createResourceHandlers({ resource, schema, data, searchFields })` дає CRUD із фільтрами, сортуванням, правами й версіями. `<DevPanel resources={["invoices"]} compact onChange={() => queryClient.invalidateQueries()} />` — у `actions` топбара, лише в розробці.
- Повний приклад — `apps/demo` у репозиторії erp-ui: `src/data/providers.ts`, `src/mocks/`, `src/pages/DataPage.tsx`, `src/pages/LoginPage.tsx`.

### e2e проекту (ADR-0029)

Елемент `tools/e2e` ставить `e2e/erp-ui.ts` — помічники Playwright (залежності `@playwright/test` і `@axe-core/playwright` — у `devDependencies`):

```ts
import { expectNoA11yViolations, expectNoHorizontalScroll, openAs } from "./erp-ui"

await openAs(page, "/crm", { user: "u-olena", appearance: { theme: "dark", language: "uk" } })   // user: null — гість
await expectNoA11yViolations(page)    // axe, WCAG 2.2 AA
await expectNoHorizontalScroll(page)  // 360/390/768
```

`openAs` засіває сховище (вигляд, користувач моків) один раз на виклик: після перезавантаження тест бачить те, що змінив сам. Ще — `cellOf` (комірка таблиці за назвою колонки), `waitForMenuFocus` і `chooseInSubmenu` (меню й підменю). Користувачі, ширини й теми — у своєму `e2e/helpers.ts` проекту.

### Модуль під клієнта: файл розширення (ADR-0020)

Файли модуля в проекті не правляться. Усе, чим клієнт відрізняється, — поля, колонки, ключові поля картки, секції й дії — лежить в окремому файлі проекту `src/extensions/<ID>-<назва>.ts`, який `shadcn add` не створює й не перезаписує. Модуль отримує розширення там, де його підключають (маршрути, моки), і зливає зі своїми елементами за ключем:

```ts
// src/extensions/K2-invoices-fields.ts — поля без компонентів: їх беруть і моки
export const invoiceFields: InvoicesExtension["fields"] = [{ id: "manager", type: "text",
  label: { uk: "Менеджер", en: "Manager" }, mockValues: ["Ірина Бондар", "Олег Мельник", null] }]

// src/extensions/K2-invoices.ts — дані; компоненти слотів — поруч у K2-invoices-slots.tsx
export const invoicesExtension: InvoicesExtension = {
  fields: invoiceFields,
  columns: { add: [{ id: "manager", place: { after: "client" }, priority: 7, overflow: "hide" }] },
  recordFields: { add: [{ id: "manager", place: { after: "client" } }] },
  sections: { add: [{ id: "paymentTerms", title: { uk: "Умови оплати", en: "Payment terms" },
    component: PaymentTerms, place: { after: "lines" } }] },
  actions: { add: [{ id: "remind", component: RemindAction, access: "edit" }] },
}
```

- Зміни списку (`lib/extensions`): `add` — новий елемент на місці `place` (`"start"`, `"end"`, `{ before: "…" }`, `{ after: "…" }`; без нього — у кінець), `hide` — сховати, `move` — переставити. Ключі модуля в `hide`, `move` і `place` типізовані: модуль перейменував ключ — TypeScript покаже місце у файлі розширення. Ключ модуля в `add` — заміна його секції чи дії; номер-посилання й обов'язкові поля модуль закріплює (`locked`): їх не сховати й не замінити.
- Розширення — дані (тип поля, підпис `{ uk, en }`, обов'язковість, значення для моків), крім компонентів у слотах: секція й дія отримують `{ record, resource }` (тип з `templates/object-page`), поле розширення беруть через `extensionValue(record, "manager")`, права — з `useCanAccess`, мову — з `useLanguage`; дія з `access` (`"edit"`, не `"invoices:edit"`) видна лише з правом. Компонент, що впав, не валить картку: секція покаже помилку з повтором, дія зникне. Так ті самі зміни зможе прислати сервер (PF09).
- Нові поля проходять перевірку: модуль розбирає відповіді схемою `extendSchema(контракт, fields)`, моки — теж, а фікстури отримують значення з `withMockValues` (`lib/extension-fields`). Моки імпортують лише файл полів: компоненти слотів у шарі моків роздувають перший екран.
- Бракує точки розширення — її додають у кіт (PR в erp-ui), проект оновлює модуль. Аварійний вихід — «від'єднати» модуль: скопіювати під іншою назвою й більше не оновлювати з кіта (рішення — у README проекту).
- Приклад — `src/extensions/K2-invoices.ts` у демо: рахунки «Даних і моків» з колонкою й полем «Менеджер», секцією «Умови оплати» і дією «Нагадати клієнту»; точки розширення модуля-прикладу — `src/pages/invoice-extension.ts`.

### Модуль у проекті (ADR-0025)

```sh
node scripts/erp-ui-kit.mjs update v1.0.0 --add modules/B1-contacts
```

Мінімальний набір для проекту з модулем на моках (тестовий проект `erp-ui-pilot`): `base`, `data`, `mocks`, `auth`, `lib/mock-views`, `lib/query-client`, `erp/app-gate`, `erp/auth-routes`, `erp/app-shell`, `erp/user-menu`, `ui/sonner`, `tools/e2e` і сам модуль — усі з одного тегу. Команда кіта ставить модуль з тегу одним запитом (§8): напряму з приватного GitHub CLI робить на модуль сотні й тисячі запитів API, кожен з тайм-аутом 15 с і без повтору (ліміт — 5 000 на годину для особистого токена).

Файли модуля стають у `src/modules/B1-contacts/` як є, спільні компоненти кіта, яких бракує, — на свої місця. Кіт модуль імпортує шляхами проекту (`@/components/…`, `@/lib/…`, `@/hooks/…`), тож псевдоніми, які створив `shadcn init`, не змінюйте. Підключення — фабрика один раз:

```ts
// src/modules.ts
import { createContactsModule } from "@/modules/B1-contacts"
import { contactsExtension } from "@/extensions/B1-contacts"

export const contactsModule = createContactsModule({ basePath: "/crm", extension: contactsExtension })

// маршрути — під Suspense і межею помилок застосунку
function Contacts() { return useRoutes(contactsModule.routes) }
// навігація — contactsModule.nav: { id, label: { uk, en }, href, icon }, підпис — localizedText(item.label, language)
// права й ресурси — contactsModule.resources (contacts, organizations, segments), до каталогу прав бекенда

// src/mocks/handlers.ts — моки беруть лише файл полів, без компонентів
import { createListSettingsHandlers } from "@/lib/mock-lists"
import { createSavedViewHandlers } from "@/lib/mock-views"
import { createContactsMocks } from "@/modules/B1-contacts/mocks"
import { contactsMockExtension } from "@/extensions/B1-contacts-fields"
const contacts = createContactsMocks({ extension: contactsMockExtension })
// Види й розмір сторінки списків модуля — обробники кіта поруч із модулем.
setupWorker(...platformHandlers, ...createSavedViewHandlers(), ...createListSettingsHandlers(), ...contacts.handlers)
```

Крім полів, колонок, ключових полів картки, секцій і дій (вище), розширення модуля має:

```ts
// src/extensions/B1-contacts-fields.ts — дані без компонентів, їх беруть і моки
export const contactsMockExtension = {
  organizations: {
    fields: [{ id: "vatPayer", type: "boolean", label: { uk: "Платник ПДВ", en: "VAT payer" }, mockValues: [true, false] }],
    statuses: { add: [{ id: "suspended", label: { uk: "Призупинена", en: "Suspended" }, tone: "warning", mockEvery: 11 }] },
  },
} satisfies ContactsMockExtension

// src/extensions/B1-contacts.ts
export const contactsExtension: ContactsExtension = {
  organizations: {
    ...contactsMockExtension.organizations,
    filters: { add: [{ id: "vatPayer" }] },               // з поля-списку, так/ні чи дати
    columns: { change: [{ id: "city", header: { uk: "Місто клієнта", en: "Client city" } }] },
    form: {
      add: [{ id: "vatPayer", place: { after: "code" } }],  // поле розширення у формі
      change: [{ id: "city", description: { uk: "Як у виписці з ЄДР", en: "As in the register" } }],
    },
  },
  contacts: {
    tabs: { add: [{ id: "key", label: { uk: "Ключові", en: "Key" }, filter: { segments: "seg-key" } }] },
  },
  strings: { uk: { contacts: { lead: "Люди, з якими працює студія." } } },
}
```

- `statuses` — додати статус (тон `neutral`, `info`, `success`, `warning`, `destructive`; `mockEvery` — кожен N-й запис фікстур), змінити підпис, тон чи іконку статусу модуля без заміни (`change`, з v0.3.0; ключ модуля в `add` замінює статус цілком) чи сховати з вибору (`hide`). Схований лишається дійсним: записи з ним показуються з бейджем (зі змінами `change`). Новий статус стає й вкладкою списку.
- `detailRows: { hide: [...] }` — сховати рядки «Подробиць» картки (у B1 — посада, сегменти тощо), `history: false` — картка без журналу «Історія» (з v0.3.0): для бекенду, який цих полів чи журналу змін не має, щоб картка не показувала порожнього.
- `filters` — фільтр панелі з поля розширення: список і так/ні — варіанти, дата — період; текст і число фільтром не стають (помилка при запуску). `tabs` — вкладка списку з фільтром плоскими параметрами API. Фільтр вкладки перекриває фільтр панелі з тим самим ключем (у демо «Ключові» за сегментом: на цій вкладці фільтр «Сегменти» не діє), тож для вкладки краще поле без фільтра панелі.
- `form` — поле розширення у формі створення й зміни: `add` з місцем серед полів модуля (`OrganizationFormFieldId`, `ContactFormFieldId`), `description` — підказка, `wide` — на всю ширину. Поле вводу — за типом поля (текст, число з `decimals`, дата, список, так/ні); обов'язкове поле (`required`) мусить бути у формі, інакше форма не збереться (помилка розробника). У запит іде лише змінене поле, порожнє — `null`.
- `change` — змінити властивість елемента модуля без заміни (ADR-0026): у колонці — `header`, `minWidth`, `grow`, `priority`, `align`; у полі форми — `label`, `description`. Вміст і поведінка лишаються модуля, тож оновлення модуля до них доходять; закріплений елемент теж можна змінити.
- Довгий підпис (заголовок колонки розширення, перейменований статус) таблиця кіта поки не обрізає: текст ширший за колонку налазить на сусідню. Дайте колонці ширину — новій `minWidth`, колонці модуля `columns.change: [{ id: "status", minWidth: 14 }]` (так у тестовому проекті з «Обслуговування припинено»).
- Що файли кіта в проекті не змінені, перевіряє `node scripts/erp-ui-kit.mjs check` (у `pnpm lint`) за відбитками `kit-files.json`, які записує команда оновлення: правка файлу кіта падає з підказкою «зміни — у файлі розширення».
- `strings` — перевизначення рядків модуля за ключами його `i18n/uk.json` і `en.json`; ключа, якого немає, TypeScript не пропустить. Рядки модуля — у своєму просторі імен, застосунку реєструвати їх не треба; простір один на застосунок, тож модуль підключають одним екземпляром.
- Опис модуля, контракт і моки — `README.md` модуля; повний приклад — `apps/demo/src/extensions/B1-contacts.ts` у репозиторії erp-ui.

### Наявний бекенд через адаптер (ADR-0021)

Бекенд за контрактом кіта (ADR-0002, ADR-0003) адаптера не потребує: `createApiClient({ baseUrl })` і провайдери кіта. Адаптер — для наявного бекенду з іншим API, який ми не змінюємо. Приклад — `src/adapters/pilot-api/` тестового проекту `erp-ui-pilot` (pilot-api, крок 1.6).

- **Де.** `src/adapters/<бекенд>/` — файли проекту, `shadcn add` їх не чіпає. Модулі й моки про адаптер не знають.
- **Перемикач.** Моки лишаються за замовчуванням: `VITE_BACKEND=mocks|<бекенд>` у `.env.local` (ключ — у `.env.example`), з бекендом MSW не запускайте й панель сценаріїв сховайте. Бекенд — через проксі Vite на тому ж домені (`server.proxy` і `preview.proxy`, адреса — зі змінної середовища), тоді CORS не потрібен.
- **Транспорт.** Свій `fetch` для `createApiClient`: `Authorization: Bearer`, одне спільне оновлення токена на всі паралельні 401 і один повтор запиту, помилки бекенду → `{ code, message, fieldErrors? }` кіта (`ApiError`, `Retry-After` зберігайте). Відповіді бекенду перевіряйте zod-схемами: розбіжність — явна помилка `server`, не тихі порожні дані.
- **Вхід, вихід і профіль.** Поки в `createAuthProvider` немає опцій (ADR-0021), вхід перекладає міст: окремий `fetch` для клієнта кіта відповідає на `/auth/methods`, `/auth/login`, `/auth/logout` і `/me` у форматі кіта, а сам іде в бекенд. Профіль бекенду → `Me` з правами `<ресурс>:<дія>`; способи входу, яких бекенд не має, вимикає відповідь `/auth/methods`.
- **Дані.** Обгортка над `createDataProvider`: перевизначте лише ресурси й методи, що відрізняються (`getList`, `getOne`, `create`, `update`, `delete`…); `id` — рядком; немає `version` — стала `version: 1`, і бекенду її не шліть. Чого бекенд не має (ресурси, поля, вкладки), ховайте окремим файлом розширення модуля поверх розширення проекту (`withPilotApiContacts` у тестовому проекті), а не показуйте порожнім; рядки «Подробиць» картки — `detailRows: { hide }`, журнал змін, якого бекенд не веде, — `history: false` (з v0.3.0).
- **Токени.** Лише в пам'яті вкладки, не в `localStorage` (ADR-0021, п. 5). Якщо бекенд віддає refresh лише в тілі відповіді, після перезавантаження сторінки — вхід заново (кіт поверне на ту саму адресу), або httpOnly cookie через проксі чи доробку бекенду (рішення власника).
- **Перевірка.** Модульні тести адаптера на підставному `fetch`; контрактні тести zod-схемами проти запущеної копії бекенду (окремий скрипт, напр. `pnpm test:pilot-api`) і e2e з бекендом (`pnpm e2e:pilot-api`) — окремо від звичайних `pnpm test`, `pnpm e2e` і CI. Локальна копія бекенду — Docker з тестовими даними й скриптом наповнення, порти лише на `127.0.0.1`.
- **README проекту** називає, чого адаптер не дає (конфлікти версій, масові дії, історія, вихід на сервері тощо) і вади бекенду, які видно з кодом.

## 6. Вхід і акаунт

```sh
node scripts/erp-ui-kit.mjs update v1.0.0 --add auth,erp/auth-routes   # усі екрани входу й безпеки (потрібен пакунок data)
```

Що показати на сторінці входу, вирішує бекенд (`GET /auth/methods`, ADR-0010): пароль, код на email чи в SMS, ключ доступу, Google, Apple, будь-який OIDC, реєстрація, відновлення. Маршрути — поза брамою сесії (розділ 4), усі одним викликом `createAuthRoutes` з `erp/auth-routes` (ADR-0029):

```tsx
const auth = createAuthRoutes({ afterLogin: "/", afterSignUp: "/onboarding", title: t("app.title") })
// auth.routes — лінивими чанками:
// /login          → LoginScreen
// /login/forgot   → ForgotPasswordScreen
// /login/reset    → ResetPasswordScreen (token з адреси)
// /login/invite   → AcceptInviteScreen (token з адреси)
// /login/link     → EmailLinkScreen (token з адреси)
// /signup         → SignUpScreen
// /auth/callback  → SsoCallbackScreen
auth.preload(location.pathname)   // на старті: чанк екрана входу для поточної адреси
```

- Інші адреси — `createAuthRoutes({ paths: { forgot: "/password/forgot" } })` (`AUTH_ROUTE_PATHS` — усі за замовчуванням). Вхід — завжди `/login`: туди ra-core веде гостя й після виходу. Кожен екран — у своїй межі помилок (чанк, що не завантажився, — «Спробувати ще» з h1). Після входу — туди, звідки ra-core перенаправив, або `afterLogin`. Логотип, підвал і своя перевірка «не бот» замість Turnstile — `logo`, `footer`, `renderCaptcha`.
- Моки за замовчуванням вмикають усі способи входу (`DEFAULT_MOCK_METHODS`). Проект, де змонтовано лише `/login`, передає в `createPlatformHandlers` `methods: { passwordless: [], providers: [], passwordReset: false, signUp: false }`, інакше екран входу веде на сторінки, яких немає.
- Охорону сесії (`SessionGuard`: попередження перед кінцем сесії, вихід у всіх вкладках) ставить `SessionGate` сам. Автовихід через бездіяльність — за політикою сервера (`idleTimeoutMinutes` з `GET /auth/methods`; поки її не завантажено, діє лише термін сесії сервера); свій термін — `<SessionGate idleMinutes={30}>`, лише термін сесії сервера — `idleMinutes={null}`.
- Налаштування безпеки (сторінка «Безпека акаунта», ADR-0011):
  - `FactorsSection` — застосунок із QR, SMS, email, ключі доступу, резервні коди;
  - `ChangePasswordForm`, `ChangeEmailForm`, `AccountDataSection` з `erp/account-security`;
  - `SessionsSection`, `TrustedDevicesSection`, `SignInAlertsSwitch`, `SignInHistory` з `erp/account-devices`.
- Профіль (ADR-0012): `ProfilePhoto` і `ProfileForm` з `erp/profile-form` — фото з обрізанням, ім'я, посада, контактний телефон, часовий пояс (`TimezoneSelect`), підпис.
- Токени API для інтеграцій: `ApiTokensSection` з `erp/api-tokens` (права й ресурси дає бекенд, токен показується один раз).
- Адміністратору (права `security:*`, `users:update`):
  - `SecurityPolicyForm` з `erp/security-policy-form` — обов'язковий другий крок, способи входу, пароль, сесія, дозволені адреси;
  - `RecoveryRequestsSection` і `useResetFactors()` з `erp/reset-factors` — запити «втратив доступ до другого кроку» й скидання з причиною.
- Сповіщення: `NotificationSettingsForm` з `erp/notification-settings-form` (події й канали дає бекенд).
- Адміністратору (ADR-0013):
  - `AuditLog` з `erp/audit-log` (право `audit:read`); `<AuditLog filter={{ targetType: "invoices", targetId }} />` — історія запису;
  - `WebhooksSection` з `erp/webhooks-section` (права `webhooks:*`);
  - у списку користувачів — `useUserAccessSheet({ onChange })` і `UserBlockedBadge`, на сторінці — `ActiveSessionsSection` з `erp/user-access`; у панелі доступу — і ролі людини.
- Команда й компанія (ADR-0014):
  - `RolesEditor` з `erp/roles-editor` (права `roles:*`) — ролі й матриця прав; каталог ресурсів і дій віддає бекенд;
  - `InvitationsSection` з `erp/invitations-section` (право `users:create`) — запрошення колег; прийняття — `AcceptInviteScreen`;
  - `<PermissionGate resource="invoices" action="delete">…</PermissionGate>` з `erp/permission-gate` — показати лише з правом (бекенд однаково перевіряє);
  - у топбарі — `<InboxBell onNavigate={navigate} onShowAll={() => navigate("/notifications")} />`, сторінка — `<NotificationInbox onNavigate={navigate} />` з `erp/notification-inbox`;
  - `CompanyProfileForm`, `CompanyImages`, `CompanyBranchesSection` з `erp/company-settings` (змінювати — `company:update`, решта бачить).
- Політику виконує вхід сам: налаштування другого кроку під час входу (`FactorSetupStep`), новий пароль після терміну, 403 `ip_not_allowed`. Для SMS у `FactorSetupStep`/`useFactorSetup` можна передати `phone={{ Input: PhoneInput, validate: validatePhone }}` — на сторінці входу без нього легше пакунок.
- Чутливі дії обгортайте `useReauth().guard(action)` — діалог «Підтвердьте, що це ви» з'явиться сам на 403 `reauth_required`.
- «Увійти як…»: у списку користувачів — `useImpersonation({ onStarted })`, в оболонці — `<AppShell banner={<ImpersonationBanner onStopped={…} />}>`.
- Бренд (white-label): бекенд віддає `branding` у `GET /auth/methods` за доменом; екрани входу показують його самі. У корені застосунку — `useBrandAppearance(useCompanyProfile(Boolean(me)).data?.palette)` (`hooks/use-company-profile`), щоб палітра компанії чи бренду була типовою й після входу.
- Клієнт API: `createApiClient({ getLanguage: () => getAppearance().language })` — сервер пише листи й місця входу мовою інтерфейсу.
- Після зміни власних ролей чи «Увійти як…» профіль перечитує `useRefreshMe()` з `hooks/use-me`: `invalidateQueries(ME_QUERY_KEY)` для цього не годиться, authProvider кешує профіль.
- Моки: `createPlatformHandlers({ …, securityPolicy, roles, permissionResources, apiResources, auditSeeds, webhookEvents, webhookSeeds, notificationChannels, notificationEvents, inboxSeeds, companyProfiles })`; `subscribeMockEvents` — `users.roles_changed` і `users.joined`, щоб оновити свій список людей; `createResourceHandlers({ …, label, fieldLabels })` — зміни записів ідуть у журнал аудиту й на вебхуки.
- Бекенд: `X-Session-Expires-At` у кожній відповіді (і в `Access-Control-Expose-Headers`, якщо API на іншому домені); Turnstile перевіряється на сервері; «Увійти як…» і скидання другого кроку пишуться в аудит із причиною; токени API зберігаються лише хешем; політика (другий крок, пароль, адреси) перевіряється на сервері; журнал аудиту пише сервер; вебхуки — з підписом HMAC і повторами (ADR-0013); заблокований не входить жодним способом; права перевіряються з ролей на кожному запиті, вбудовані й свої ролі не змінюються, токен запрошення зберігається хешем, реквізити перевіряються як на клієнті (ADR-0014).

## 7. Вигляд

Палітра, тема, щільність і сайдбар задаються атрибутами `<html>` (SPEC §6.2):

```html
<html lang="uk" data-palette="sapphire" class="dark" data-density="compact" data-sidebar="dark">
```

Палітри: `sapphire`, `graphite` (основні), `indigo`, `teal`, `terracotta`. Без класу `dark` — світла тема.

Рух (SPEC §6.6, ADR-0009) — лише функціональний і лише з токенів:

- тривалості `duration-fast` (150 мс: кольори, меню, підказки), `duration-base` (200 мс: панелі, розгортання), `duration-slow` (250 мс: шторки); криві `ease-standard`, `ease-enter` (поява), `ease-exit` (зникнення);
- не `transition-all` (анімує й розкладку), а конкретні властивості: `transition-colors`, `transition-opacity`, `transition-[width]`;
- `prefers-reduced-motion` вимикає рух сам, окремо нічого робити не треба.

Швидкість (SPEC §18.5): відгук на дії ≤ 200 мс і перший екран ≤ 2,5 с на телефоні середнього класу. Тримають її ліниві сторінки, одна мова в пам'яті й важкі частини, що вантажаться при відкритті.

## 8. Оновлення

Одна команда кіта в проекті (ADR-0029; ставиться з `base`, файл — `scripts/erp-ui-kit.mjs`):

```sh
node scripts/erp-ui-kit.mjs update vX.Y.Z --dry-run   # що зміниться, нічого не записує
node scripts/erp-ui-kit.mjs update vX.Y.Z             # оновити всі встановлені елементи кіта
node scripts/erp-ui-kit.mjs update vX.Y.Z --add erp/command-palette   # і поставити новий
node scripts/erp-ui-kit.mjs check                     # файли кіта не правлені (у pnpm lint і CI)
```

- Що робить `update`: вимагає чисте git (оновлення видно окремо в `git diff`, повернути — `git restore .`) і незмінені файли кіта → бере тег архівом одним запитом (`gh api repos/VasulenkoIllia/erp-ui/tarball/vX.Y.Z`, ~1,5 МБ; тайм-аут 120 с, повтори через 5 і 30 с після збою мережі, 5xx чи 429; на 401, 404 і вичерпаному ліміті — зупинка з поясненням) → перевіряє, що це кіт і та версія → `shadcn build` закріпленою CLI проекту → звіт `add --dry-run` (зміниться, нові, без змін) → `add --overwrite --yes` → нові відбитки в `kit-files.json`. Напряму з приватного GitHub CLI робить на модуль тисячі запитів `gh api` з тайм-аутом 15 с і без повтору, тож команда так не робить (крок 1.7b).
- `kit-files.json` — `kit` (версія), `items` (встановлені елементи: наступне оновлення бере їх звідси), `files` (відбитки файлів кіта), `own` (див. нижче). Комітьте його разом з оновленням.
- Файли, які проект доповнює сам (`src/index.css`, `docs/erp-ui/CLAUDE.project.md`), команда не перевіряє: якщо проект їх змінював, лишає версію проекту й показує різницю з новою версією кіта — перенесіть потрібне вручну. Файли, які git ігнорує (напр. `.claude/` у `.git/info/exclude`), у відбитки не входять.
- Файлів, яких у новій версії немає, команда не видаляє, а називає (`? шлях`): видаліть сам, якщо не потрібен.
- Після оновлення — `pnpm typecheck`, `pnpm lint`, тести, збірка й e2e; що змінилось — `CHANGELOG.md` кіта. Мажорна версія — лише при зміні токенів чи публічного API (CLAUDE.md кіта, правило 8). У мінорній і патч-версії файли розширення й адаптера змінювати не треба, крім названого в `CHANGELOG.md` (як у v0.3.0: стара анотація типу статусів і точні назви кнопок у тестах).
- Перший раз у проекті без команди (кіт до v1.0.0): завантажте її з тегу в тимчасову теку й запустіть звідти — вона сама стане у `scripts/` разом із `base`. Список `--items` — елементи, які стоять у проекті (README проекту):

  ```sh
  git status --short   # чисте дерево
  T="$(mktemp -d)"
  for f in erp-ui-kit erp-ui-kit-lib; do
    gh api "repos/VasulenkoIllia/erp-ui/contents/registry/tools/$f.mjs?ref=v1.0.0" \
      -H "Accept: application/vnd.github.raw" > "$T/$f.mjs"
  done
  node "$T/erp-ui-kit.mjs" update v1.0.0 --items base,data,mocks,auth,modules/B1-contacts
  rm -rf "$T"
  ```

  Відбитки проекту в старому форматі (`{ kit, files }`, як у тестовому проекті) команда читає: перевіряє за ними, що файли кіта не правлені, і перезаписує в новому.
- Якщо компонент спільного шару (`ui`, `erp`, `templates`, `lib`, `hooks`) довелося змінити в проекті — позначте правку `// erp-ui: local override — <причина>`, а вдалу правку перенесіть у реєстр. `update` такий файл не перезапише: `check` і перевірка перед оновленням покажуть його як змінений. Перенесіть правку (у розширення чи в кіт) і поверніть файл (`git checkout -- <файл>` чи попередня версія кіта).
- Модуль оновлюється тією самою командою: його файли в проекті не правляться, тож зміни в них — лише кіта, а відмінності клієнта лишаються у файлі розширення (§5, ADR-0020). Несумісна зміна типу розширення — мажорна версія, що змінити — у розділі «Як оновити розширення» в `CHANGELOG.md`: після `update` `pnpm typecheck`, як правило, падає у файлах розширення (`src/extensions/`) — так і має бути, файли модуля не правте (зміну поведінки без помилки TypeScript розділ теж називає). Поправте лише файли розширення, далі — `pnpm typecheck`, пошук старої назви в `src/` (обов'язковий: об'єкт без типу, де поруч є інші ключі розширення, TypeScript пропускає мовчки), тести, збірка й e2e. Зручно двома комітами: «кіт X.0.0» (як встановлено) і «розширення за розділом». Розширення оголошуйте з типом (`const organizations: OrganizationsExtension = {…}` чи `satisfies`), тоді TypeScript покаже кожне місце.
- Гілка чи коміт кіта до випуску (перевірити зміну на своєму проекті, як у 1.7c): `update <гілка чи SHA> --from <тека копії кіта>` — команда бере з копії лише реєстр і файли, на які він посилається (`git archive`, ~4 МБ). Такий стан проекту в `main` не мерджиться.
- Версія CLI shadcn — та сама для встановлення й оновлення: закріпіть її в проекті (`"shadcn": "4.22.0"` без `^`). Команда бере CLI проекту (`node_modules/.bin/shadcn`) і повертає закріплення, якщо `add` його змінив (до v1.0.0 `base` і `tokens` несли залежність `shadcn@^…`, з v1.0.0 — ні). Нову версію CLI беріть окремим кроком: оновили CLI → `update` тієї ж версії кіта → `git diff` показує лише перетворення CLI. Звіт `--dry-run` команда читає з формату CLI 4.22: інший формат — помилка з повним звітом, а не порожній список.
- Директива `"use client"`: з v0.3.1 у файлах кіта її немає (крок fix-use-client). При оновленні з v0.3.0 чи старішої вона один раз зникає з файлів кіта, де ще стоїть (`git diff --numstat` такого файлу — 0 доданих і 2 прибрані рядки).
- Без команди (напр. один файл для перегляду): `pnpm exec shadcn add <реєстр із тегу>/<елемент>.json --diff <шлях>` — різниця одного файлу (`--diff` без шляху показує лише перші п'ять файлів, навіть незмінних).

## 9. Чого не робити

- Не копіювати компоненти руками з репозиторію — лише через `shadcn add` (так працюють оновлення).
- Не правити файли модуля під клієнта — лише файл розширення проекту (ADR-0020).
- Не писати кольори, розміри й шрифти повз токени. Потрібен новий токен — він додається в erp-ui.
- Не писати тексти інтерфейсу в коді й не форматувати числа чи дати вручну — лише i18n і `lib/format`.
- Не ставити поверх стилів erp-ui інші shadcn-стилі чи компоненти з інших реєстрів напряму. Вони спершу перебудовуються в реєстрі (ADR-0006).
