# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/uk/1.1.0/), версії — `vX.Y.Z` (CLAUDE.md, правило 8).

## [Unreleased]

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
