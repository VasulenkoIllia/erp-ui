# Каталог erp-ui

> Генерується з `registry/registry.config.mjs` скриптом `pnpm registry` — руками не правити.

Елементів: 65. Встановлення в проект: `npx shadcn@latest add VasulenkoIllia/erp-ui/<елемент>` (версія — `#vX.Y.Z`). Як підключити кіт — `docs/using-erp-ui.md`.

Статуси: **draft** — у роботі; **beta** — є в демо й тестах, API може змінитися; **stable** — підтверджено стрес-сторінкою.

## Основа

| Елемент | Назва | Що це | Статус | Демо | SPEC |
|---|---|---|---|---|---|
| `base` | Основа erp-ui | Усе для старту проекту однією командою: теми й токени, базові стилі, cn, вподобання вигляду, мови й форматери, словник іконок, скіл і правила для Claude Code. | beta | `appearance` | §3, §6, §19 |

## Шар 1 · токени й теми

| Елемент | Назва | Що це | Статус | Демо | SPEC |
|---|---|---|---|---|---|
| `tokens` | Токени й теми | Лише шар 1: 5 палітр × світла/темна, щільність, мапінг токенів у Tailwind v4, базові стилі. | beta | `appearance` | §6 |

## Правила для Claude Code

| Елемент | Назва | Що це | Статус | Демо | SPEC |
|---|---|---|---|---|---|
| `claude` | Правила для Claude Code | Скіл erp-ui, блок для CLAUDE.md, SPEC і каталог реєстру в docs/erp-ui/. | beta | — | §19 |

## Утиліти

| Елемент | Назва | Що це | Статус | Демо | SPEC |
|---|---|---|---|---|---|
| `lib/api` | Конвенції API | HTTP-клієнт і контракт REST (ADR-0002): плоскі параметри списку, { data, total }, єдиний формат помилок ApiError, version для конфліктів, X-Company-Id, cookie-сесія. | beta | `data` | §17 |
| `lib/appearance` | Вподобання вигляду | Палітра, тема, щільність, сайдбар і мова: атрибути <html>, кеш у localStorage, initAppearance, syncLanguage з i18next. | beta | `appearance` | §6.2, §11, PF11 |
| `lib/auth` | Вхід і права | createAuthProvider (ADR-0003): httpOnly cookie + 2FA (TOTP), /me з ролями, правами й компаніями, hasPermission із діями ra-core. | beta | `data` | PF01, A2 |
| `lib/data-provider` | dataProvider ra-core | createDataProvider: getList/getOne/getMany/create/update/delete за конвенціями API; update надсилає змінені поля + version. | beta | `data` | §17 |
| `lib/format` | Форматери Intl | Числа, відсотки, гроші з мінорних одиниць (₴ після суми, інші валюти кодом), дати явними стилями без «р.», відносний час, тиждень ISO, useFormat. | beta | `formats` | §11, §17 |
| `lib/i18n-en` | Рядки кіта en | Ті самі рядки англійською; паритет ключів перевіряє тест. | beta | `formats` | §11 |
| `lib/i18n-uk` | Рядки кіта uk | Рядки компонентів кіта українською (простір імен erp-ui): підписи, помилки валідації LC12. | beta | `formats` | §11 |
| `lib/i18n` | Мови інтерфейсу | i18next + react-i18next: createI18n, українська за замовчуванням, англійська з британськими форматами, <html lang>, useLanguage, useErpUiT. | beta | `formats` | §11 |
| `lib/icons` | Словник іконок | Поняття → іконка lucide: модулі A1…T1 і LC01…LC12, статуси, дії з документами, оболонка; HryvniaIcon; IconProvider (лінія 2). | beta | `icons` | §6.5 |
| `lib/language-names` | Назви мов | Назви мов інтерфейсу їхніми ж мовами («Українська», «English») для перемикачів. | beta | `appearance` | §11 |
| `lib/mock-scenarios` | Сценарії моків | success, error, empty, slow, conflict, forbidden, offline — для всіх ресурсів або окремо; вибір у localStorage. | beta | `data` | §17 |
| `lib/mocks` | Мок-сервер MSW | createPlatformHandlers (вхід із 2FA, /me, вподобання) і createResourceHandlers (CRUD, фільтри, сортування, пагінація, права, версії, компанії) за контрактами API. | beta | `data` | §17 |
| `lib/phone` | Телефони | Номери будь-яких країн на даних Google (google-libphonenumber): E.164, маска під час введення, перевірка, список країн. | beta | `formats` | LC12 |
| `lib/preferences` | Вподобання на сервері | syncPreferences: після входу застосовує вподобання з /me/preferences і зберігає кожну зміну (PF11). | beta | `data` | PF11, §6.2 |
| `lib/ra-i18n` | i18nProvider ra-core | Повідомлення ra-core з рядків кіта мовою інтерфейсу; i18next лишається єдиним джерелом мови. | beta | `data` | §11 |
| `lib/ua-ids` | Ідентифікатори UA | ЄДРПОУ, РНОКПП, ІПН платника ПДВ, IBAN UA: нормалізація, контрольні суми, групування IBAN, МФО. | beta | `formats` | LC12 |
| `lib/utils` | cn | Злиття класів Tailwind із підтримкою утиліт щільності erp-ui. | beta | — | §6.5 |

## Хуки

| Елемент | Назва | Що це | Статус | Демо | SPEC |
|---|---|---|---|---|---|
| `hooks/use-api-error-message` | useApiErrorMessage | Текст помилки API за кодом мовою інтерфейсу; відповідь зовнішнього сервісу — в дужках. | beta | `data` | §8.3 |
| `hooks/use-appearance` | useAppearance | Поточні вподобання вигляду й функція зміни; перемальовує при будь-якій зміні. | beta | `appearance` | §6.2 |
| `hooks/use-breakpoint` | useBreakpoint | Брейкпоінт оболонки: телефон < 768 px, планшет до 1279 px, десктоп ≥ 1280 px. | beta | `appearance` | §7, §9 |
| `hooks/use-me` | useMe | Профіль поточного користувача з кешу TanStack Query: null — гість; useHasPermission. | beta | `data` | PF01, A2 |
| `hooks/use-resolved-theme` | useResolvedTheme | Поточна тема з класу dark на <html> — для компонентів, яким потрібна тема. | beta | — | §6.2 |

## Шар 2 · примітиви

| Елемент | Назва | Що це | Статус | Демо | SPEC |
|---|---|---|---|---|---|
| `ui/alert` | Повідомлення | Банер у потоці сторінки; варіанти статусів — soft-тло + *-foreground. | beta | `states` | §6.3 |
| `ui/avatar` | Аватар | Фото або ініціали; групи аватарів. | beta | `appearance` | — |
| `ui/badge` | Бейдж | Мітки й статуси: soft-тло + *-foreground (success, warning, info, destructive). | beta | `primitives` | §6.3 |
| `ui/breadcrumb` | Хлібні крихти | Шлях до сторінки; підписи для скрінрідера мовою інтерфейсу. | beta | `appearance` | §7 |
| `ui/button` | Кнопка | Усі варіанти; висота з токенів щільності; зона натиску ≥ 44 px; «недоступно з поясненням». | beta | `primitives` | §6.5, §8.4 |
| `ui/card` | Картка | Контейнер секції з заголовком, описом, діями й підвалом. | beta | `primitives` | — |
| `ui/checkbox` | Прапорець | Checkbox на Base UI зі зоною натиску ≥ 24 px. | beta | `primitives` | — |
| `ui/dialog` | Діалог | Модальне вікно; кнопки називають наслідок (SPEC §8.2). | beta | `primitives` | §8.2 |
| `ui/dropdown-menu` | Меню | Випадне меню на Base UI: пункти, перемикачі, прапорці, підменю. | beta | `appearance` | — |
| `ui/empty` | Порожній блок | Основа станів сторінки: іконка, заголовок, опис, дії. | beta | `states` | §8.1 |
| `ui/field` | Поле форми | Підпис, опис і помилка поля; групи й набори полів. | beta | `primitives` | §8.3 |
| `ui/input-group` | Група поля | Поле з адонами: іконка, спінер перевірки, замок «редагує інший». | beta | `primitives` | §8.3 |
| `ui/input` | Поле вводу | Висота з токена щільності; read-only відрізняється від disabled. | beta | `primitives` | §8.3 |
| `ui/kbd` | Клавіша | Позначення клавіш і поєднань (Ctrl K). | beta | `appearance` | — |
| `ui/label` | Підпис | Підпис поля над контролом. | beta | `primitives` | — |
| `ui/popover` | Спливна панель | Popover на Base UI з заголовком і описом. | beta | `appearance` | — |
| `ui/select` | Список вибору | Select на Base UI; висота з токена щільності. | beta | `primitives` | — |
| `ui/separator` | Розділювач | Горизонтальна чи вертикальна лінія. | beta | `primitives` | — |
| `ui/sheet` | Шторка | Бічна чи нижня панель (фільтри, редактори на телефоні). | beta | `primitives` | §9, UI38 |
| `ui/sidebar` | Сайдбар | Основа оболонки: розгорнутий, вузька панель з іконками, шторка на телефоні; пункти з токенів щільності, Ctrl+B поза полями вводу. | beta | `appearance` | §7, §9 |
| `ui/skeleton` | Скелетон | Заглушка контенту під час першого завантаження (лише в контейнерах). | beta | `primitives` | §8.1, §8.2 |
| `ui/sonner` | Тости | Сповіщення sonner; тема з <html>; тости з «Скасувати» не зникають самі. | beta | `primitives` | §8.2, PF10 |
| `ui/spinner` | Спінер | Індикатор очікування з підписом для скрінрідера. | beta | `primitives` | §8.2 |
| `ui/switch` | Перемикач | Switch на Base UI зі зоною натиску ≥ 24 px. | beta | `primitives` | — |
| `ui/table` | Таблиця | Проста таблиця; рядки з токена щільності; прокрутка доступна з клавіатури. | beta | `primitives` | §9, §10 |
| `ui/tabs` | Вкладки | Вкладки на Base UI (вкладки-статуси списків). | beta | `primitives` | — |
| `ui/textarea` | Багаторядкове поле | Textarea з автовисотою. | beta | `primitives` | — |
| `ui/tooltip` | Підказка | Tooltip; пояснює недоступні дії (SPEC §8.4). | beta | `primitives` | §8.4 |

## Шар 3 · ERP-компоненти

| Елемент | Назва | Що це | Статус | Демо | SPEC |
|---|---|---|---|---|---|
| `erp/app-shell` | Оболонка застосунку | Сайдбар із групами (десктоп), вузька панель з іконками (планшет), нижня панель + «Ще» (телефон), топбар із хлібними крихтами, «Перейти до вмісту». | beta | `appearance` | §7, §9, §10 |
| `erp/command-palette` | Палітра команд | Cmd/Ctrl+K: пошук розділів і дій за назвою й ключовими словами; на Base UI Autocomplete. | beta | `appearance` | UI15, PF06 |
| `erp/company-switcher` | Перемикач компанії | Компанія чи робочий простір у шапці сайдбара; одна компанія — без меню. | beta | `appearance` | PF02 |
| `erp/conflict-dialog` | Діалог конфлікту | «Запис змінив інший користувач»: порівняння ваших і збережених значень, «Зберегти мої зміни» або «Взяти збережене». | beta | `data` | §8.2, §17 |
| `erp/dev-panel` | Панель розробника | Перемикач сценаріїв моків для всіх ресурсів чи окремо; кнопка для топбара з позначкою нестандартного сценарію. | beta | `data` | §17 |
| `erp/notification-bell` | Дзвіник сповіщень | Кнопка з лічильником у підписі й панель; заглушка до PF10. | draft | `appearance` | UI02, PF10 |
| `erp/page-state` | Стани сторінки | Порожньо вперше, нічого не знайдено, помилка з повтором, немає доступу, офлайн, не знайдено; PageSkeleton для завантаження. | beta | `states` | §8.1, §8.2 |
| `erp/phone-input` | Поле телефону | Вибір країни (без РФ і РБ за замовчуванням) + маска; значення в E.164; номер без «+» — український. | beta | `formats` | LC12, §8.3 |
| `erp/ua-id-input` | Поле ідентифікатора UA | ЄДРПОУ, РНОКПП, ІПН ПДВ, IBAN з маскою (react-number-format); значення без пробілів; тексти помилок — uaIdIssueKey. | beta | `formats` | LC12, §8.3 |
| `erp/user-menu` | Меню користувача | Профіль, тема, палітра, щільність, мова, темний сайдбар, вихід; пункти проекту — дочірніми елементами. | beta | `appearance` | §6.2, PF11 |
