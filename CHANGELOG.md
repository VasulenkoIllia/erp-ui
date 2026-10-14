# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/uk/1.1.0/), версії — `vX.Y.Z` (CLAUDE.md, правило 8).

## [Unreleased]

### Додано — крок 0.6b (таблиця на 10 000 рядків і картки, ADR-0016)

- `erp/data-table` — таблиця даних на TanStack Table 9 + Virtual (SPEC §7 List Report, §8.1, §9, §10):
  - великий список (`list` з `useWindowedList`) — віртуальна прокрутка у власній області на висоту екрана, рядки вікнами по 100 з сервера, `aria-rowcount` — увесь список; малий (`rows` + `pagination`) — сторінки, висота за вмістом;
  - грід за W3C APG: одна зупинка Tab, стрілки, Home/End, PageUp/PageDown, Ctrl+Home/End, Enter/F2 у клітинку з кількома елементами й Esc назад; рядок у фокусі лишається в DOM під час прокрутки й після довантаження вікна; липкі шапка й колонка-ідентифікатор не перекривають фокус (WCAG 2.4.11);
  - колонки (`DataTableColumn`): пріоритет і поведінка «лишити / перенести / сховати» за шириною контейнера, сортування на сервері (`sortField`, `firstSortOrder`), роль у картці (`card`);
  - нижче 40 rem ширини контейнера (`cardsBelow`) — картки за W3C APG Feed (`aria-posinset` / `aria-setsize` на весь список, PageUp/PageDown), сортування — випадним списком у рядку стану;
  - стани SPEC §8.1: скелетон, оновлення з видимими даними, дозавантаження, порожньо, нічого не знайдено, помилка, збій частини рядків із повтором, немає доступу, офлайн, «Оновлено о…» з «Оновити»; рядок стану — постійний live-регіон.
- Нові елементи реєстру: `erp/data-table-grid`, `erp/data-table-cells`, `erp/data-table-cards` (ставляться з `erp/data-table`), `hooks/use-windowed-list`, `hooks/use-grid-keyboard`, `hooks/use-virtual-rows` (віртуальні рядки гріда й карток, якір прокрутки на рядку у фокусі), `hooks/use-element-size`, `lib/data-table-core` (чиста логіка: вікна, розкладка колонок, навігація), `lib/announce` (оголошення через один постійний live-регіон, WCAG 4.1.3; повертає скасування).
- Токени: утиліта `min-h-row` (мінімальна висота рядка щільності, `--row-h`). Клітинки таблиці без вертикальних відступів: рядок дорівнює щільності (44 px, компактна — 33 px).
- `DataTable`: джерело — або `list`, або `rows` (+ `pagination`); без `onSortChange` сортування не пропонується; сторінка за межами списку — запит останньої; стан помилки, що замінив таблицю з фокусом, бере фокус на «Повторити».
- `useWindowedList(resource, { sort, filter })` — розріджені вікна з `dataProvider.getList`: лише видимі вікна й запас 30 рядків; ключі запитів як у ra-core, тож `useUpdate` оновлює рядок у кеші вікна; новий фільтр показує попередні рядки до відповіді, інша компанія — ні; вікно, що не завантажилось, — повтор у рядку.
- `erp/page-state`: `LoadingFallback` — fallback лінивої сторінки чи палітри: спінер з `aria-busy`, а якщо вантаження триває понад 1 с, — «Завантаження» для скрінрідера через постійний live-регіон.
- Рядки кіта `dataTable.*` (uk, en).
- Залежності: `@tanstack/react-table` ^9.3.1, `@tanstack/react-virtual` ^3.14.17.

### Змінено — крок 0.6b

- `lib/mocks`: `data` у `createResourceHandlers` може бути функцією — дані створюються при першому запиті, без копії; відсортований порядок кешується, доки дані не змінились (10 000 записів вікнами по 100 не сортуються щоразу); `db.all()` (прямі зміни з подій моку) скидає цей кеш. Масив, як і раніше, копіюється.
- `erp/command-palette` і fallback сторінок демо — `LoadingFallback` замість спінера без тексту.
- Демо: «Дані й моки» — стрес-сторінка SPEC §18.1: 12 500 рахунків у моку (10 000 у першій компанії) на `erp/data-table`, перемикач «Прокрутка / Сторінки», редагування, права й конфлікт лишились; на телефоні — картки, список займає екран під заголовком. `pnpm perf` міряє на ній (на 390 px — картки, сортування з рядка стану).
- Межі бюджету JS (`apps/demo/bundle-budget.json`) оновлено свідомо: маршрут «Дані й моки» +10 КБ gzip (TanStack Table і Virtual), вхідний чанк +2 КБ (рядки кіта `dataTable`, `LoadingFallback`, `lib/announce`); решта маршрутів — від нового входу.

### Додано — крок 0.6a (рух і швидкість, ADR-0009)

- Токени руху в `tokens/base.css` (SPEC §6.6): `duration-fast` / `duration-base` / `duration-slow` (150 / 200 / 250 мс) і криві `ease-standard` / `ease-enter` / `ease-exit`; `transition-*` без явної тривалості теж бере токени.
- Бюджети швидкості (SPEC §18.5):
  - `scripts/check-bundle.mjs` і `pnpm check:bundle` — JS першого екрана кожного маршруту демо проти меж у `apps/demo/bundle-budget.json` (храповик, ціль 250 КБ gzip, шар моків поза бюджетом);
  - `pnpm perf` — LCP ≤ 2,5 с і INP ≤ 200 мс під CPU ×4 і мережею 4G (Playwright, медіана з трьох), окремий джоб CI; на машині, повільнішій за еталонний Mac (раннер CI), множник CPU калібрується еталонним навантаженням.
- `lib/i18n`: `whenI18nReady(i18n, timeoutMs = 5000)` — чекати рядки початкової мови перед першим рендером, але не довше таймауту (зависла мережа не тримає порожній екран); рядки проекту можна дати функцією, що вантажить їх окремим чанком.
- Новий елемент реєстру `erp/command-palette-list` — пошук і список палітри команд; `erp/command-palette` ставить його залежністю.
- Новий елемент `lib/lazy` (входить у `base`): `lazyWithPreload` — лінивий компонент із `preload()`; завантажений заздалегідь рендериться одразу, без кадру з fallback; компонент мемоізований — сторінка не перемальовується, коли оновлюється оболонка; збій завантаження кидає `ChunkLoadError` з повтором, а невдалий попередній прогрів перший рендер повторює сам; `whenIdle` — запуск, коли браузер вільний.
- Новий елемент `erp/error-boundary`: помилка рендеру чи чанк, що не завантажився, показує стан «Не вдалося завантажити» з «Спробувати ще» (без мережі — «Немає з'єднання»), а не білий екран; чанк не завантажився й після повтору — ще й «Оновити сторінку»; `onError` — для моніторингу; `fallback` — власний вигляд для тісних місць. Рядок кіта `pageState.error.reload`.
- Правило `motion` у `scripts/check-tokens.mjs`; `scripts/adapt-upstream.mjs` переписує рух у коді з upstream.
- Демо: розділ «Рух» на сторінці «Теми й вигляд».

### Змінено — крок 0.6a

- `lib/i18n`: у пам'яті лише мова інтерфейсу — українські рядки кіта в бандлі, англійські довантажуються окремим чанком; `changeLanguage` чекає на них. Наслідки для проектів:
  - у `main.tsx`: `createI18n({ language: getAppearance().language, … })` і `await whenI18nReady(i18n)` перед рендером, інакше людина з англійською мовою побачить перший кадр українською;
  - екземпляр завжди стартує українською (синхронно, `useTranslation` не призупиняє рендер) і одразу перемикається на початкову мову; доки її рядки в дорозі, `i18n.language` — `uk`;
  - `addResourceBundle(lng, ns, …)` для мови, яку ще не завантажено, позначає простір імен готовим, і кіт свої рядки цієї мови для нього вже не довантажить — рядки проекту давайте через `resources` у `createI18n`;
  - `AppResources`: українські рядки — лише об'єктом;
  - мова приходить цілою — рядки кіта й проекту разом; не довантажились (офлайн) — два повтори (0,3 і 0,6 с), далі запасна українська, `<html lang>` — мова, якою справді показано інтерфейс; наступний `changeLanguage` пробує знову.
- `lib/appearance`: `syncLanguage` звіряє вподобання з останньою запитаною мовою — швидке «English → Українська» більше не лишає англійську, коли її рядки приходять пізніше; функція відписки знімає й слухача i18next.
- `erp/command-palette`: пошук і список — окремим чанком, що вантажиться, коли браузер вільний після старту (раніше — при наведенні чи фокусі на кнопці пошуку); збій показує повтор у самій палітрі; список, що прийшов уже після відкриття, сам ставить фокус у пошук. API не змінився.
- Примітиви на токенах руху: без `transition-all` (`button`, `badge`, `switch`, `input-otp`, `tabs`, `sidebar`); меню, поповери, select, комбобокс, діалоги й підказки з'являються за 150 мс з `ease-enter` і зникають з `ease-exit` (було 100 мс і `ease`); сайдбар і шторки — `duration-base` з `ease-standard` замість `ease-linear` / `ease-in-out`.
- `scripts/build-registry.mjs` враховує динамічні `import("./файл")` у межах шару (файл, що вантажиться за запитом, їде з елементом) і не пропускає `import("@/registry/…")`: такий шлях shadcn CLI переписує неправильно.
- Демо: усі сторінки й екран входу — лінивими чанками (`lib/lazy`) з попереднім завантаженням при наведенні чи фокусі на посиланні, межа помилок на кожній сторінці; мок-сервер, панель розробника й смуга «Увійти як…» — окремими чанками (смуга — лише в цьому режимі й уже в першому кадрі). Сповіщення з повтором, якщо мова не довантажилась. Вхідний чанк з імпортами — 335 КБ gzip замість ≈ 580.
- `scripts/check-bundle.mjs` падає, якщо у збірці немає сторінок або в `bundle-budget.json` лишились межі маршрутів, яких уже немає; `pnpm perf` падає на порожньому замірі (LCP 0 чи менше п'яти взаємодій).
- CI: повний набір (e2e, швидкість, доставка) — лише в PR; після мерджу на `main` — статичні перевірки й збірка, бо PR мерджимо лише на свіжому `main` (ліміт хвилин приватного репозиторію). `pnpm e2e:repeat <файли>` — 20 повторів на всіх ядрах, щоб ловити нестабільні тести до пушу. В e2e пункти підменю обираються клавіатурою (`chooseInSubmenu`): миттєвий клік Playwright на завантаженому раннері губився.

### Виправлено — крок 0.5d-fix (ціле число без дробу)

- `erp/number-input`: у полі без дробу (`NumberInput` без `decimalScale`, валюта без копійок, напр. JPY) кома й крапка не вводяться, цифри дробу одразу за ними теж, вставлений дріб відхиляється. Раніше react-number-format відкидав лише роздільник: «12,5» ставало 125, «1,200.5» у JPY ставало 12 005, вставлене «12.5» ставало 125.
- Під полем спливає підказка «Лише ціле число» (`ui/tooltip`, розкладку не зсуває), її озвучує live-регіон у групі поля; Escape ховає підказку, наступний закриває діалог; у полі лише для читання підказки немає.
- Новий елемент реєстру `erp/number-group` (група поля й захист від дробу); `erp/number-input` тягне його залежністю.
- Рядок кіта: `validation.number.whole`.

### Додано — крок 0.5d (форми, дати, суми, підтвердження, ADR-0015)

- Форми — `erp/form` на react-hook-form + zod (`@hookform/resolvers`):
  - `FormField` — підпис, опис, помилка й aria-атрибути; поле без прав — лише читання;
  - `FormErrorSummary` — зведення помилок над формою, фокус після невдалої спроби, перехід до поля;
  - `UnsavedChangesGuard` — діалог «Вийти без збереження?» у застосунку й `beforeunload`.
- Дати (UI39):
  - `lib/dates` — календарні дати `"YYYY-MM-DD"`, «сьогодні» в поясі, 12 пресетів періодів, розбір і перевірка введення (`dateIssue`);
  - `ui/calendar` — react-day-picker 10 (shadcn, перебудовано): тиждень з понеділка, ISO-номери тижнів, підписи днів для скрінрідера;
  - `erp/date-input` — `DateInput` з клавіатури й календарем, `TimeInput`, `useDateIssueText` (текст помилки дати мовою інтерфейсу);
  - `erp/date-range-input` — період із пресетами, календарем і полями «Від/До»; `min`/`max` обрізають пресети й перевіряють введені дати.
- Суми й числа:
  - `erp/number-input` — `MoneyInput` (мінорні одиниці й валюта) і `NumberInput` (ціле чи з дробом, одиниця поруч); до 15 цілих розрядів, валюта чи одиниця — в описі поля для скрінрідера;
  - `lib/amount-in-words` — сума прописом uk/en: гривня, долар США, євро; інші валюти — параметром.
- `lib/user-timezone` — пояс користувача з профілю: `setUserTimeZone` (викликає `useMe`), `useUserTimeZone`, `isTimeZone`.
- `lib/format`: `useFormat().timeZone`, `formatDateRange` / `useFormat().dateRange`, `decimalToMinor`, `currencyLabel`, `numberSeparators`.
- Поля дати, часу, суми й числа передають `ref` на `<input>`: react-hook-form фокусує поле з помилкою.
- Підтвердження дій (SPEC §8.2) — `erp/confirm-dialog`: `ConfirmDialog` (кнопка-наслідок, введення слова для критичної дії, фокус назад на кнопку, з якої відкрили) і `useUndoToast`; `ui/alert-dialog`.
- Рядки кіта: `dates`, `confirm`, `forms`, `validation.date`, `validation.time`, `validation.number`.
- Демо: сторінки «Дати й числа» (`#/fields`) і «Форми» (`#/forms`); на «Мови й формати» — сума прописом, пояси, періоди.
- e2e: дати, періоди, суми, форми, три рівні підтвердження, forced-colors і зменшений рух; скриншоти кроку — `docs/screenshots/wave-0/0.5d`.

### Змінено — крок 0.5d

- `ProfileForm` — на react-hook-form + zod: «Зберегти» не вимикається, надсилаються лише змінені поля, без змін — тост «Змін немає», вихід зі сторінки з незбереженими змінами питає підтвердження.
- Діалоги підтвердження у факторах входу, пристроях, вебхуках і доступі користувачів — спільний `ConfirmDialog`; їхня роль тепер `alertdialog` (тести проектів, що шукали `dialog`, треба оновити).
- Дати й «відносний час» у `useFormat` показуються в поясі користувача з профілю (`useMe`), а без нього — як раніше, у поясі браузера.
- `PhoneInput` передає `ref` на поле номера (раніше губився).
- `formatRelative` і `useFormat().relative`: календарна дата — у своєму дні («сьогодні», «учора»), без зсуву поясом (раніше в поясі на захід від UTC — «учора» замість «сьогодні»).
- `ui/input-group`: клік усередині поповера (календар) не переводить фокус у поле групи.
- Фокус у forced-colors (режим високої контрастності Windows) — системний контур для елемента у фокусі й підсвіченого пункту меню (`tokens/base.css`); вибраний день календаря — теж контуром.

### Змінено (несумісно) — крок 0.5b5-fix

Зміни публічного API (правило 8): наступний випуск — несумісний, з міграцією нижче.

- `createApiClient()` більше не приймає `getCompanyId`: `X-Company-Id` береться лише з `lib/company-scope`, від якої залежать і ключі кешу. Міграція: прибрати опцію; компанію з іншого джерела (напр. з адреси) передавати `setCompanyId(id)`, перемикач — `useCompany()`.
- Ключі запитів кіта, що залежать від компанії, мають у кінці `companyScope(id)`: `[...X_QUERY_KEYS.list, { companyId }]`. Інвалідація за `*_QUERY_KEYS` працює як раніше (префікс); точні `getQueryData`/`setQueryData` зі старим ключем — уже ні.
- `checkAuth` і `useMe` вважають 403 від `GET /me` відсутністю входу (як 401): блокування чи IP поза списком ведуть на сторінку входу, а не в зламаний застосунок.

### Виправлено — крок 0.5b5-fix (за аудитом хвилі 0)

- Компанія (№1): `lib/company-scope` — поточна компанія для `X-Company-Id` і ключів кешу (`companyScope`); authProvider вибирає її з профілю, а якщо сервер відмовив у збереженій компанії (403), раз повторює профіль без неї. `hooks/use-company` — `useCompany()` для `CompanySwitcher`: скасовує запити, скидає дані попередньої компанії, перечитує профіль. Запити кіта мають компанію в ключі; форма реквізитів і політик, редактор ролей не переносять правки в іншу компанію.
- Профіль (№6): `useRefreshMe()` з `hooks/use-me` — редактор ролей і «Увійти як…» перечитують права з сервера; при швидкому перемиканні в кеш лягає найсвіжіший профіль.
- Сесія й помилки:
  - `checkAuth` не виходить на збій сервера чи мережі під час відкриття (№5);
  - вихід: спершу `POST /auth/logout` (до 10 с), збій (офлайн, 5xx, тайм-аут) кидається, а не ковтається; 401 — успіх; повторний вихід після виходу чи 401 запиту не надсилає (№7); `SessionGuard` за таймером без мережі однаково ховає дані, а кнопка «Вийти» показує помилку;
  - дія акаунта, що вдалася, не стає помилкою через збій оновлення профілю (№7);
  - `SessionGuard`: 401 у будь-якому запиті кешу веде на вхід (№8); «Увійти як…», повернення і вхід під іншим акаунтом в іншій вкладці скидають кеш попередньої особи (№8); `useResetUserData()` з `hooks/use-me`.
- Форми політик безпеки й налаштувань сповіщень не стирають введене при фоновому оновленні (№15).
- Заголовки екранів входу: «Запрошення недійсне», «Посилання застаріло», «Посилання недійсне», «Вхід не завершено»; збій мережі на запрошенні — помилка з повтором, кнопка під час повтору лишається на місці з фокусом (№20).
- `ui/dialog` прокручується, а не обрізається; `ui/sonner` — 8 с і кнопка «Закрити» (№21).
- Безпека: `next` після SSO — лише шлях застосунку, `safeRedirectPath` з `lib/auth` (№30); CSV журналу аудиту — без формул (№31).
- Нижня панель телефона: довгі підписи (en) обрізаються, «Ще» не виходить за край (UX-1).
- Мок: користувачі з реєстрації й запрошень переживають перезавантаження разом зі змінами (пароль, фактори), зіпсоване сховище ігнорується (№4); `GET /me` з компанією без доступу — 403, як на сервері.
- Демо: якщо профіль не завантажився (мережа, 5xx), у топбарі «Повторити», а не «Увійти».
- e2e на Mac: ІПН і бренд (№2); фільтр статусу в списку рахунків чекає на оновлення рядків.
- CI (№3): доставка — з реєстру цього коміту (`consumer-smoke --local`), з GitHub — один елемент із повторами на 403/429, ще два елементи поодинці; Node 22 і 24; лише коли змінено те, що потрапляє в проекти (збій `git diff` валить крок, а не пропускає перевірку); входить у підсумкову перевірку. `checkout` без збережених облікових даних.

### Додано — аудит хвилі 0

- `docs/audit/2026-10-13-wave-0-audit.md`: базова лінія перевірок на Mac, відповідність SPEC і ADR, 73 знахідки з пріоритетами (4 блокери) і UX-огляд, порядок виправлень. Код не змінювався.

### Додано — крок 0.5b5 (ролі й права, запрошення, центр сповіщень, компанія, ADR-0014)

- `lib/roles` (`provider.roles`):
  - ролі: `list` (ролі й каталог прав), `create`, `update`, `remove`;
  - ролі користувача: `setUserRoles` (з повторним підтвердженням);
  - матриця: `grants`, `togglePermission`, `countGranted`.
- `lib/invitations` (`provider.invitations`): `list`, `create`, `resend`, `revoke`.
- `lib/notifications` (`provider.inbox`): `list`, `unreadCount`, `markRead`, `markAllRead`.
- `lib/company` (`provider.company`):
  - профіль: `get`, `update` (реквізити, підписанти, палітра компанії);
  - зображення: `uploadImage`, `removeImage` (логотип, печатка);
  - філії: `createBranch`, `updateBranch`, `removeBranch`.
- Екрани:
  - `erp/roles-editor` — `RolesEditor`, `RolePicker`, `useRoles`;
  - `erp/permission-gate` — `PermissionGate`;
  - `erp/invitations-section` — `InvitationsSection`;
  - `erp/notification-inbox` — `InboxBell`, `NotificationInbox`, `NotificationPreview`, `useUnreadNotifications`;
  - `erp/company-settings` — `CompanyProfileForm`, `CompanyImages`, `CompanyBranchesSection`;
  - `hooks/use-company-profile` — `useCompanyProfile`.
- Панель доступу користувача — ролі; `useUserAccessSheet({ onChange })`.
- `ui/checkbox` — стан «частково» (`indeterminate`).
- `useBrandAppearance(palette)` — палітра компанії важливіша за бренд.
- `lib/api`: `background: true` — заголовок `X-Background-Request: 1`, фоновий запит не продовжує сесію (мок теж); `BACKGROUND_HEADER` у `lib/session`.
- Мок:
  - `lib/mock-team`: ролі й призначення, права людей із ролей, запрошення з листом і прийняттям; події `users.roles_changed`, `users.joined`;
  - `lib/mock-inbox`: сповіщення кожного користувача; `pushMockNotification` поважає налаштування «У застосунку»;
  - `lib/mock-company`: профіль кожної компанії з перевіркою LC12, зображення, філії;
  - `createPlatformHandlers` — `roles` з правами, `permissionResources`, `inboxSeeds`, `companyProfiles`;
  - запит на відновлення доступу й прийняте запрошення надсилають сповіщення;
  - `subscribeMockEvents` — і з `lib/mocks`.
- Аудит: зміни ролей, ролі користувача, запрошення, реквізити компанії; розділ «Компанія».
- Демо:
  - сторінки «Ролі й права», «Компанія», «Сповіщення»;
  - на «Користувачах» — запрошення, ролі в панелі доступу, назви ролей із каталогу;
  - дзвіник у топбарі показує справжні сповіщення.
- Тести: 13 модульних (`team.test.ts`), 8 e2e (`team.spec.ts`) з axe.

### Змінено — крок 0.5b5

- `NotificationBell` — керована панель (`open`, `onOpenChange`), ширша на великих екранах; статус beta.
- Сторінка демо «Сповіщення» (налаштування) тепер «Налаштування сповіщень»; «Сповіщення» — центр сповіщень.
- Запит на відновлення доступу не сповіщає самого автора, навіть якщо він адміністратор.
- CI: e2e трьома частинами паралельно (раннер приватного репозиторію має 2 ядра, і повний набір зі скриншотами перевищив 20 хвилин); підсумкова перевірка лишилась «typecheck · lint · test · e2e».

### Додано — крок 0.5b4 (журнал аудиту, вебхуки, сповіщення, доступ користувачів, ADR-0013)

- `lib/audit` (`provider.audit`):
  - `getEvents` з плоскими фільтрами (`auditQuery`) і `exportEvents` (CSV);
  - `auditToCsv` — для бекендів на TS.
- `lib/webhooks` (`provider.webhooks`):
  - підписки: `list`, `create` (секрет один раз), `update`, `remove`, `rotateSecret`;
  - доставки: `test`, `getDeliveries`, `redeliver`;
  - перевірка адреси: `webhookUrlIssue`.
- `lib/notification-settings`: контракт подій, каналів і тихих годин; `provider.account.getNotificationSettings` / `updateNotificationSettings`.
- `provider.admin`:
  - доступ і сесії: `getUserAccess`, `getSessions`, `endSession`, `signOutUser`;
  - блокування: `blockUser`, `unblockUser`.
- Екрани:
  - `erp/audit-log` — `AuditLog`, `auditActionLabel`;
  - `erp/webhooks-section` — `WebhooksSection`;
  - `erp/notification-settings-form` — `NotificationSettingsForm`;
  - `erp/user-access` — `useUserAccessSheet`, `useUserAccess`, `UserBlockedBadge`, `ActiveSessionsSection`.
- `lib/api`: `responseType: "blob"`; код `account_blocked`.
- Мок:
  - `lib/mock-audit` пише журнал сам: входи, безпека, доступ, інтеграції, зміни записів із «було → стало»;
  - `lib/mock-webhooks` доставляє події з шини мок-сервера (`emitMockEvent`, `subscribeMockEvents`);
  - `lib/mock-notifications`;
  - блокування в моку входу;
  - `createResourceHandlers` — опції `label`, `titleField`, `fieldLabels`;
  - `createPlatformHandlers` — `auditSeeds`, `webhookEvents`, `webhookSeeds`, `notificationChannels`, `notificationEvents`.
- Демо:
  - сторінки «Журнал аудиту», «Інтеграції» (вебхуки), «Сповіщення»;
  - на «Користувачах» — «Доступ» і активні сесії компанії;
  - Іван має сесію на телефоні.
- Тести: 12 модульних (`operations.test.ts`), 8 e2e (`operations.spec.ts`) з axe.

### Змінено — крок 0.5b4

- На «Користувачах» замість кнопки «Скинути двоетапну перевірку» в рядку — «Доступ»: скидання, сесії й блокування в одній панелі.
- `DeviceIcon` експортовано з `erp/account-devices`; поточна адреса й пристрій мока — у `lib/mock-server`.
- Журнали (аудит, доставки, сесії, доступ) завжди запитуються наново при показі (`refetchOnMount: "always"`).
- Реєстр відхиляє однакові назви файлів у різних шарах (`lib/x` і `erp/x`): shadcn CLI переписує імпорти за назвою й плутає їх.

### Додано — крок 0.5b3 (профіль, політики, відновлення доступу, токени API, ADR-0012)

- Профіль (`provider.account`):
  - `updateProfile` (ім'я, посада, контактний телефон, часовий пояс, підпис);
  - `uploadAvatar` / `removeAvatar`;
  - `/me` повертає `position`, `timezone`, `signature`.
- Токени API: `getApiTokens`, `createApiToken` (права з прав користувача, термін 30/90/365 днів чи без терміну), `revokeApiToken`.
- `lib/security-policy` (`provider.admin`):
  - політика організації: `getSecurityPolicy`, `updateSecurityPolicy`;
  - запити на відновлення: `getRecoveryRequests`, `declineRecoveryRequest`;
  - скидання другого кроку: `resetFactors`;
  - адреси: `isValidCidr`, `ipInCidr`, `ipAllowed`.
- `lib/auth`:
  - обов'язковий другий крок під час входу: `factor_setup_required`, `isFactorSetupRequired`, `completeFactorSetup`;
  - `requestRecovery` на кроці коду;
  - причина зміни пароля: `PasswordChangeRequiredError.reason`;
  - `passwordPolicy.minLength` у `GET /auth/methods`.
- Екрани:
  - `erp/profile-form` — `ProfileForm`, `ProfilePhoto`;
  - `erp/avatar-editor` — обрізання й стиснення фото в браузері;
  - `erp/timezone-select`;
  - `erp/api-tokens` — `ApiTokensSection`;
  - `erp/security-policy-form` — `SecurityPolicyForm`;
  - `erp/reset-factors` — `useResetFactors`, `RecoveryRequestsSection`;
  - `erp/factor-setup` — `FactorSetupStep`, `useFactorSetup`, `BackupCodesDialog`, `PhoneField`.
- Примітиви: `ui/combobox`, `ui/slider` (порти shadcn base-nova).
- `ChallengeForm`: «Немає доступу до жодного способу?» (`onRequestRecovery`).
- `lib/api`: `FormData` — як multipart; коди `factor_setup_required`, `ip_not_allowed`.
- Мок:
  - `lib/mock-admin` — політика, запити, скидання;
  - вхід виконує політику: другий крок, термін і повтор пароля, адреси, дні довіри;
  - `createPlatformHandlers` приймає `securityPolicy`, `roles`, `apiResources`.
- Демо:
  - сторінки «Профіль» і «Політики безпеки»;
  - запити й скидання на «Користувачах»;
  - токени API на «Безпеці акаунта».
- Тести: 18 модульних (`admin.test.ts`), 7 e2e (`admin.spec.ts`) з axe.

### Змінено — крок 0.5b3

- `BackupCodesDialog` і діалоги налаштування факторів переїхали з `erp/account-factors` до `erp/factor-setup`. Сторінка входу не тягне libphonenumber: поле телефону підставляється ззовні (`PhoneField`).
- Індикатор складності пароля враховує мінімальну довжину з політики.
- Опція `createAccountApi` `onMe` → `onMeChange`.
- Мок: історія паролів зберігає й попередній пароль (`passwordChanged` сам міняє пароль).
- `ui/combobox`: кнопки-іконки мають назви для екранного читача.

### Додано — крок 0.5b2 (акаунт: фактори, пристрої, бренд, «Увійти як…», ADR-0011)

- `lib/account` (`provider.account`):
  - фактори: застосунок (QR), SMS/Viber, email, ключ доступу — додати, перейменувати, вимкнути;
  - резервні коди: перший фактор приносить коди, нові коди скасовують старі;
  - сесії (вийти на пристрої й на всіх інших), довірені пристрої, журнал входів зі сторінками;
  - лист про вхід з нового пристрою; `deviceFromUserAgent`.
- `lib/auth`:
  - `branding` у `GET /auth/methods`, `localizedText`;
  - «Увійти як…»: `impersonate`, `stopImpersonation`, `me.impersonator`, `isImpersonationForbidden`.
- Екрани:
  - `erp/account-factors` — `FactorsSection`, `BackupCodesDialog`;
  - `erp/account-devices` — `SessionsSection`, `TrustedDevicesSection`, `SignInHistory`, `SignInAlertsSwitch`;
  - `erp/impersonation` — `useImpersonation`, `ImpersonationBanner`.
- Спільні компоненти: `erp/copy-button` (UI43), `erp/qr-code` (UI32, lean-qr 2.7, MIT), `SectionSkeleton`.
- Бренд сторінки входу в `erp/auth-layout`: логотип (світлий і темний), бічна панель, документи, назва у вкладці; `useAuthMethods`, `useBranding`, `useBrandAppearance`.
- Токени `--scan` / `--scan-foreground` — коди завжди темні на світлому.
- `AppShell`: слот `banner` над топбаром (липне разом із ним).
- `lib/passkey`: `createPasskey`. `lib/api`: `getLanguage` → `Accept-Language`; коди `factor_required`, `impersonation_forbidden`.
- Мок `lib/mock-account` (стан акаунта в localStorage, місця мовою `Accept-Language`); `createPlatformHandlers` приймає `branding`, `accountSeeds`, `availableFactors`, `twoFactorRequired`.
- Демо:
  - «Безпека акаунта» з усіма розділами;
  - сторінка «Користувачі» з «Увійти як…»;
  - перемикач бренду на сторінці входу (Бухгалтерія Плюс, Зоряна логістика).
- Тести: 16 модульних (`account.test.ts`), 3 для бренду у вигляді; 12 e2e (`account.spec.ts`), зокрема ключ доступу через віртуальний автентифікатор і axe.

### Змінено — крок 0.5b2

- `lib/appearance` зберігає лише обране користувачем (`pickAppearance`); бренд — типові значення (`setBrandAppearance`). `syncPreferences` застосовує лише поля, які повернув сервер.
- `useAuthMethods` і `AUTH_METHODS_QUERY_KEY` переїхали з `erp/login-screen` до `erp/auth-layout`.
- Демо: «Безпека акаунта» вантажиться окремим чанком; Олена — ще й адміністратор (`users:*`).
- Реєстр відхиляє `export … from "@/registry/…"`: shadcn CLI переписує такі шляхи хибно.

### Додано — крок 0.5b (вхід і акаунт, ADR-0010)

- `lib/auth`:
  - `GET /auth/methods`;
  - універсальний виклик підтвердження (TOTP, резервний код, SMS/Viber, email, ключ доступу);
  - вхід без пароля, посилання з листа, SSO-повернення;
  - відновлення пароля, запрошення, реєстрація, тимчасовий пароль;
  - повторне підтвердження, зміна email, експорт і видалення акаунта;
  - `refreshMe`, вихід `{ remote: true }`.
- `lib/session` (термін сесії з `X-Session-Expires-At`, активність по вкладках, події між вкладками), `lib/passkey` (WebAuthn JSON, WebOTP), `lib/password` (надійність без словників), `lib/brand-icons` (Google, Apple).
- Екрани (пакунок `auth`):
  - вхід: `erp/login-screen`, `erp/challenge-form`;
  - відновлення: `erp/account-recovery`, `erp/sign-up-screen`;
  - сесія й безпека: `erp/session-guard`, `erp/reauth-dialog`, `erp/account-security`;
  - поля й кнопки: `erp/password-input`, `erp/sso-buttons`, `erp/captcha` (Turnstile).
- `ui/input-otp` (input-otp 1.5, MIT) і анімація курсора в токенах.
- Мок: `lib/mock-auth` (усі способи входу, «не бот», довірений пристрій, GDPR) і `lib/mock-server` (ковзна сесія, «надіслані» SMS і листи).
- Демо:
  - усі екрани входу;
  - демо-провайдер Google/Apple;
  - сторінка «Безпека акаунта»;
  - SMS і листи як сповіщення;
  - попередження про кінець сесії.
- e2e:
  - вхід: пароль і код, SMS, резервний код, тимчасовий пароль, «не бот», без пароля, Google/Apple, ключ доступу (віртуальний автентифікатор);
  - відновлення, запрошення, реєстрація;
  - сесія: кінець сесії (контрольований годинник), вихід у двох вкладках, зміна email, видалення акаунта;
  - axe.
- Аудит проектів студії (`docs/audit/`), SPEC 1.6–1.7: PF15–PF20, UI39–UI47, A7.

### Змінено — крок 0.5b

- Контракт входу: `two_factor_required` → `challenge`, `twoFactorEnabled` → `factors`; `lib/mocks` розділено на `mock-server`, `mock-auth` і ресурси.

### Додано — крок 0.5 (контракти, моки й дані)

- `lib/api` — конвенції REST (ADR-0002) і HTTP-клієнт:
  - плоскі параметри списку, `{ data, total }`;
  - `ApiError` в єдиному форматі, `offline` при мережевому збої;
  - `X-Company-Id`, `credentials: "include"`, необов'язкова zod-схема відповіді.
- `lib/data-provider` — dataProvider ra-core; update надсилає змінені поля + `version`.
- `lib/auth` — authProvider ra-core (ADR-0003): cookie-сесія + 2FA, `/me`, права `<ресурс>:<дія>` з діями ra-core, `ME_QUERY_KEY`.
- `lib/preferences` — вподобання на сервері (PF11); `lib/ra-i18n` — повідомлення ra-core з рядків кіта; `lib/language-names`.
- `lib/mocks` і `lib/mock-scenarios` — MSW-обробники:
  - вхід із 2FA, `/me`, вподобання;
  - CRUD із фільтрами, сортуванням, пагінацією, правами, версіями й компаніями;
  - сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline`.
- `hooks/use-me`, `hooks/use-api-error-message`; рядки кіта `apiErrors.*`, `devPanel.*`, `conflict.*`, `ra.*`, `validation.required`.
- `erp/dev-panel` (кнопка для топбара з позначкою нестандартного сценарію), `erp/conflict-dialog`.
- Пакунки `data` і `mocks`; `msw` ставиться в devDependencies.
- Демо:
  - React Router + ra-core, MSW у браузері;
  - сторінки «Вхід» і «Дані й моки»;
  - перемикач компанії й меню користувача з профілю;
  - вподобання синхронізуються з сервером.
- e2e: вхід і 2FA, вихід, пошук/статус/сортування/сторінки, компанія, права, редагування, усі сценарії, конфлікт, вподобання на чистому браузері, axe на 360/768/1440.
- ADR-0002, ADR-0003; SPEC §17, журнал 1.5.

### Змінено — крок 0.5

- Button і Badge: hover основного варіанту — похідний токен `--color-primary-hover` замість `bg-primary/80` (було 3,74:1 — нижче AA). Перевірка контрасту — 380 пар.
- `SHELL_ICONS.signIn`.

### Додано — крок 0.4 (оболонка застосунку)

- `erp/app-shell`:
  - сайдбар із групами (десктоп), вузька панель з іконками (планшет), нижня панель + «Ще» (телефон);
  - топбар із хлібними крихтами, «Перейти до вмісту»;
  - липкі панелі не перекривають фокус.
- `erp/command-palette` — Cmd/Ctrl+K на Base UI Autocomplete (без cmdk).
- `erp/user-menu` (тема, палітра, щільність, мова, темний сайдбар), `erp/company-switcher`, `erp/notification-bell` (заглушка PF10).
- `erp/page-state`:
  - порожньо вперше, нічого не знайдено, помилка з повтором, немає доступу, офлайн, не знайдено;
  - `PageSkeleton`.
- `lib/icons`:
  - словник іконок для 104 модулів, статусів, дій і оболонки;
  - `HryvniaIcon`;
  - `IconProvider` (лінія 2).
- `lib/appearance` і `hooks/use-appearance` — сховище вигляду в кіті; `hooks/use-breakpoint`.
- Примітиви: sidebar, dropdown-menu, avatar, breadcrumb, kbd, popover, empty, alert (зі статусними варіантами).
- Демо:
  - усі сторінки в оболонці;
  - сторінки «Іконки» й «Стани сторінки»;
  - приклад ERP-навігації з заглушками модулів.
- e2e: оболонка на трьох ширинах, клавіатура, палітра, меню, «без горизонтальної прокрутки», axe нових сторінок.
- ADR-0008; SPEC, журнал 1.4; автономний режим у CLAUDE.md.

### Змінено — крок 0.4

- Перемикач мови — з шапки демо в меню користувача й палітру команд.
- Назви палітр, тем і щільностей — у рядках кіта; назви модулів — `modules.<ID>`.
- Тип перекладу дозволяє мовам різні форми множини (`ErpUiTranslation`).

### Додано — крок 0.3 (мови й формати)

- `lib/i18n`: i18next + react-i18next, `createI18n()`, українська за замовчуванням, англійська з британськими форматами, `<html lang>`, `useLanguage`, `useErpUiT`; рядки кіта — `lib/i18n-uk`, `lib/i18n-en` (простір імен `erp-ui`).
- `lib/format`: числа, відсотки, гроші з мінорних одиниць (₴ після суми, інші валюти кодом), дати явними стилями без «р.», відносний час, тиждень ISO, `useFormat`.
- `lib/ua-ids`: ЄДРПОУ, РНОКПП, ІПН платника ПДВ, IBAN UA — нормалізація й контрольні суми; `lib/phone`: телефони будь-яких країн (google-libphonenumber).
- Шар 3: `erp/ua-id-input` і `erp/phone-input` з масками (react-number-format), без Росії й Білорусі в списку країн за замовчуванням.
- Демо: сторінка «Мови й формати», перемикач мови в шапці; рядки демо — `src/i18n/uk.json` і `en.json`, тест паритету ключів і форм множини.
- ADR-0007; SPEC, журнал 1.3.

### Змінено — крок 0.3

- Підписи «Закрити», «Завантаження», «Таблиця» в dialog, sheet, spinner і table — з рядків кіта мовою інтерфейсу (параметри лишились).
- `registry.json`: 33 елементи, шар `erp/*`, `devDependencies` для пакетів типів; перевірка доставки ставить і `erp/*`.
- Скіл і блок CLAUDE.md для проектів: правила i18n, форматування й полів LC12.

## [0.1.0] — 2026-10-13

Перша версія: основа (теми, токени, стилі), 20 примітивів на Base UI (Nova), реєстр із доставкою в проекти. Встановлення: `npx shadcn add VasulenkoIllia/erp-ui/base#v0.1.0`.

### Додано — крок 0.2b (реєстр і доставка)

- `registry.json` — 25 елементів (`base`, `tokens`, `claude`, `lib/utils`, `hooks/use-resolved-theme`, 20 × `ui/*`), генерується `pnpm registry` з `registry/registry.config.mjs`; `docs/CATALOG.md` — каталог.
- Встановлення в проект: `npx shadcn add VasulenkoIllia/erp-ui/<елемент>[#vX.Y.Z]`; `base` ставить токени, стилі, `cn`, хук, скіл і правила для Claude Code однією командою.
- `pnpm consumer-smoke` і CI-задача «доставка в тестовий проект»: чистий Vite-проект ставить кіт із коміту PR і збирається.
- ADR-0004, посібник `docs/using-erp-ui.md`.
- Демо: textarea, skeleton, separator на сторінці «Примітиви».

### Змінено — крок 0.2b

- Шапка походження в компонентах — після імпортів (CLI shadcn вирізає коментар у першому рядку).
- Блок CLAUDE.md і скіл для проектів: GitHub-адреса реєстру, `docs/erp-ui/CATALOG.md`, оновлення через `--diff`.

### Додано — крок 0.2 (примітиви й стиль)

- Примітиви shadcn/ui на Base UI в `registry/ui` (стиль Nova, ADR-0001), перебудовані за ADR-0006: button, badge, card, checkbox, dialog, field, input, input-group, label, select, separator, sheet, skeleton, sonner, spinner, switch, table, tabs, textarea, tooltip.
- Шар токенів `registry/tokens`: `base.css` (мапінг токенів, шкала радіусів Nova, утиліти `h-control`, `size-control`, `h-row`, `min-h-touch`, `touch-target`, базові стилі) і `no-default-colors.css`.
- `registry/lib/utils.ts` — `cn` (пакет `cn` від shadcn) із підтримкою утиліт щільності; `registry/hooks/use-resolved-theme.ts`.
- Бейдж: статусні варіанти `success`, `warning`, `info`, `destructive` (soft-тло + `*-foreground`).
- Генератор тем `pnpm themes` (`design/generate-themes.mjs`) і перевірка `pnpm check:contrast` (370 пар; входить у `pnpm lint`).
- `scripts/adapt-upstream.mjs` — систематичні правки erp-ui для коду з shadcn та інших реєстрів.
- Сторінка демо «Примітиви»: кнопки, поля в усіх станах SPEC §8.3, вибір, статуси, діалог, шторка, підказка, тости, таблиця; e2e + axe у 5 палітрах × 2 темах × 2 щільностях.
- ADR-0001 (стиль Nova), ADR-0006 (зовнішні компоненти перебудовуємо).

### Змінено — крок 0.2

- Токени: `--input` світла 0,655 → 0,64, темна 0,50 → 0,51 (рамка поля ≥ 3:1 і на фоні сторінки); новий `--overlay`.
- Фокус примітивів — суцільне кільце 2 px `--ring`; текст помилок — `destructive-foreground`.
- Підписи «Закрити», «Завантаження», «Таблиця» в примітивах — українською за замовчуванням (параметри; i18n — крок 0.3).

### Додано — крок 0.1 (каркас)

- Хвиля 0, крок 0.1 — каркас: pnpm workspace, `apps/demo` (Vite 8, React 19, TypeScript 6 strict, Tailwind CSS 4), підключені `design/themes.css` і шрифт Geist.
- Перемикачі вигляду на `<html>` (SPEC §6.2): 5 палітр, тема світла/темна/як у системі, щільність, темний сайдбар; вибір кешується в localStorage.
- Токени щільності як утиліти Tailwind: `h-control`, `min-h-control`, `h-row`, `min-h-touch`.
- Перевірки: ESLint 10 (typescript-eslint, react-hooks, jsx-a11y-x), Prettier з сортуванням класів, `check-tokens` (лише токени), Vitest + Testing Library, Playwright + axe (WCAG 2.2 AA), CI на GitHub Actions.
