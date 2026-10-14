/**
 * Опис елементів реєстру erp-ui — джерело для registry.json і docs/CATALOG.md (scripts/build-registry.mjs).
 * Кожен файл у registry/{ui,erp,lib,hooks} мусить мати тут запис: так каталог завжди повний.
 *
 * status: draft — у роботі; beta — є в демо й тестах, API може змінитися; stable — після стрес-сторінки (крок 0.6).
 * demo: сторінка демо-застосунку (ключ ROUTES в apps/demo/src/router.ts), де елемент показано в усіх станах.
 * spec: розділи SPEC або ID (UI…, PF…, LC…), які елемент реалізує.
 */

export const REPO = "VasulenkoIllia/erp-ui"

/** Елементи з кодом: ключ — `<тека>/<файл без розширення>`. */
export const CODE_ITEMS = {
  "lib/utils": {
    title: "cn",
    description:
      "Злиття класів Tailwind із підтримкою утиліт щільності erp-ui.",
    status: "beta",
    spec: ["§6.5"],
  },
  "lib/i18n": {
    title: "Мови інтерфейсу",
    description:
      "i18next + react-i18next: createI18n, українська за замовчуванням, англійська з британськими форматами, <html lang>, useLanguage, useErpUiT; у пам'яті лише мова інтерфейсу, інші довантажуються (whenI18nReady, ADR-0009).",
    status: "beta",
    demo: "formats",
    spec: ["§11"],
  },
  "lib/i18n-uk": {
    title: "Рядки кіта uk",
    description:
      "Рядки компонентів кіта українською (простір імен erp-ui): підписи, помилки валідації LC12.",
    status: "beta",
    demo: "formats",
    spec: ["§11"],
  },
  "lib/i18n-en": {
    title: "Рядки кіта en",
    description: "Ті самі рядки англійською; паритет ключів перевіряє тест.",
    status: "beta",
    demo: "formats",
    spec: ["§11"],
  },
  "lib/lazy": {
    title: "Ліниві компоненти",
    description:
      "lazyWithPreload: сторінка чи важка частина окремим чанком із preload (наведення, старт, вільний браузер); збій завантаження — ChunkLoadError з повтором для erp/error-boundary; whenIdle (ADR-0009).",
    status: "beta",
    demo: "appearance",
    spec: ["§18.5"],
  },
  "lib/announce": {
    title: "Оголошення для скрінрідера",
    description:
      'announce: текст у постійному прихованому live-регіоні (WCAG 4.1.3), бо новий role="status" скрінрідер часто не озвучує; для fallback — LoadingFallback з erp/page-state.',
    status: "beta",
    demo: "data",
    spec: ["§10"],
  },
  "lib/data-table-core": {
    title: "Логіка таблиці даних",
    description:
      "Для erp/data-table без React: опис колонки DataTableColumn (пріоритет, «лишити / перенести / сховати», липка колонка, місце в картці), вікна по 100 рядків, розкладка колонок за шириною контейнера, навігація гріда W3C APG, можливості TanStack Table 9 (ADR-0016).",
    status: "beta",
    demo: "data",
    spec: ["§9", "§10"],
  },
  "lib/format": {
    title: "Форматери Intl",
    description:
      "Числа, відсотки, гроші з мінорних одиниць (₴ після суми, інші валюти кодом), дати явними стилями без «р.», періоди, відносний час, тиждень ISO, useFormat (мітки часу — у поясі користувача з lib/user-timezone).",
    status: "beta",
    demo: "formats",
    spec: ["§11", "§17"],
  },
  "lib/user-timezone": {
    title: "Пояс користувача",
    description:
      "Часовий пояс із профілю для показу міток часу: setUserTimeZone (викликає useMe), useUserTimeZone, перевірка поясу IANA.",
    status: "beta",
    demo: "formats",
    spec: ["§11"],
  },
  "lib/dates": {
    title: "Календарні дати й періоди",
    description:
      'Календарні дати "YYYY-MM-DD" без поясу: перевірка, арифметика, «сьогодні» в поясі користувача, пресети періодів (тиждень з понеділка, квартали), введення дат із клавіатури у форматі мови, час 24 години.',
    status: "beta",
    demo: "fields",
    spec: ["UI39", "§11"],
  },
  "lib/amount-in-words": {
    title: "Сума прописом",
    description:
      "Сума словами для документів (uk, en-GB): гривня, долар США, євро у всіх формах числа, копійки цифрами чи словами, bigint без втрати копійок; інші валюти — словами з параметра.",
    status: "beta",
    demo: "formats",
    spec: ["§11"],
  },
  "lib/ua-ids": {
    title: "Ідентифікатори UA",
    description:
      "ЄДРПОУ, РНОКПП, ІПН платника ПДВ, IBAN UA: нормалізація, контрольні суми, групування IBAN, МФО.",
    status: "beta",
    demo: "formats",
    spec: ["LC12"],
  },
  "lib/phone": {
    title: "Телефони",
    description:
      "Номери будь-яких країн на даних Google (google-libphonenumber): E.164, маска під час введення, перевірка, список країн.",
    status: "beta",
    demo: "formats",
    spec: ["LC12"],
  },
  "lib/appearance": {
    title: "Вподобання вигляду",
    description:
      "Палітра, тема, щільність, сайдбар і мова: атрибути <html>, кеш у localStorage, initAppearance, syncLanguage з i18next.",
    status: "beta",
    demo: "appearance",
    spec: ["§6.2", "§11", "PF11"],
  },
  "lib/icons": {
    title: "Словник іконок",
    description:
      "Поняття → іконка lucide: модулі A1…T1 і LC01…LC12, статуси, дії з документами, оболонка; HryvniaIcon; IconProvider (лінія 2).",
    status: "beta",
    demo: "icons",
    spec: ["§6.5"],
  },
  "lib/language-names": {
    title: "Назви мов",
    description:
      "Назви мов інтерфейсу їхніми ж мовами («Українська», «English») для перемикачів.",
    status: "beta",
    demo: "appearance",
    spec: ["§11"],
  },
  "lib/api": {
    title: "Конвенції API",
    description:
      "HTTP-клієнт і контракт REST (ADR-0002): плоскі параметри списку, { data, total }, єдиний формат помилок ApiError, version для конфліктів, X-Company-Id, cookie-сесія.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "lib/data-provider": {
    title: "dataProvider ra-core",
    description:
      "createDataProvider: getList/getOne/getMany/create/update/delete за конвенціями API; update надсилає змінені поля + version.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "lib/auth": {
    title: "Вхід і права",
    description:
      "createAuthProvider (ADR-0003): httpOnly cookie + 2FA (TOTP), /me з ролями, правами й компаніями, hasPermission із діями ra-core.",
    status: "beta",
    demo: "data",
    spec: ["PF01", "A2"],
  },
  "lib/company-scope": {
    title: "Поточна компанія",
    description:
      "Вибрана компанія для X-Company-Id і ключів кешу: getCompanyId/setCompanyId/subscribeCompany, syncCompany з профілю, companyScope для ключів запитів.",
    status: "beta",
    demo: "company",
    spec: ["PF02"],
  },
  "lib/preferences": {
    title: "Вподобання на сервері",
    description:
      "syncPreferences: після входу застосовує вподобання з /me/preferences і зберігає кожну зміну (PF11).",
    status: "beta",
    demo: "data",
    spec: ["PF11", "§6.2"],
  },
  "lib/ra-i18n": {
    title: "i18nProvider ra-core",
    description:
      "Повідомлення ra-core з рядків кіта мовою інтерфейсу; i18next лишається єдиним джерелом мови.",
    status: "beta",
    demo: "data",
    spec: ["§11"],
  },
  "lib/mock-scenarios": {
    title: "Сценарії моків",
    description:
      "success, error, empty, slow, conflict, forbidden, offline — для всіх ресурсів або окремо; вибір у localStorage.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "lib/mocks": {
    title: "Мок-сервер MSW",
    description:
      "createPlatformHandlers (вхід, /me, вподобання, безпека, аудит, вебхуки, сповіщення) і createResourceHandlers (CRUD, фільтри, сортування, пагінація, права, версії, компанії; зміни — у журнал аудиту й на шину подій) за контрактами API.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "hooks/use-me": {
    title: "useMe",
    description:
      "Профіль поточного користувача з кешу TanStack Query: null — гість; useHasPermission; useRefreshMe — перечитати профіль із сервера.",
    status: "beta",
    demo: "data",
    spec: ["PF01", "A2"],
  },
  "hooks/use-company": {
    title: "useCompany",
    description:
      "Поточна компанія і перемикання для CompanySwitcher: скасовує запити, скидає дані попередньої компанії, перечитує профіль.",
    status: "beta",
    demo: "company",
    spec: ["PF02"],
  },
  "hooks/use-windowed-list": {
    title: "useWindowedList",
    description:
      "Великий список із сервера вікнами по 100 через dataProvider ra-core: лише видимі вікна плюс запас, ключі як у useGetList (збереження оновлює рядки), компанія в ключі, попередні рядки під час нового фільтра, повтор вікна, що не завантажилось (ADR-0016).",
    status: "beta",
    demo: "data",
    spec: ["§8.1", "§17", "§18.1"],
  },
  "hooks/use-virtual-rows": {
    title: "useVirtualRows",
    description:
      "Віртуальні рядки erp/data-table на TanStack Virtual (грід і картки): рядок у фокусі лишається в DOM на своєму місці й на екрані, коли рядки над ним змінюють висоту; видимі рядки → вікна джерела, новий список — з початку; повтор невдалого вікна в першому його рядку (ADR-0016).",
    status: "beta",
    demo: "data",
    spec: ["§10", "§18.1"],
  },
  "hooks/use-element-size": {
    title: "useElementSize",
    description:
      "Ширина чи висота елемента за ResizeObserver і висота області прокрутки «до низу екрана» (100dvh мінус відступ) для erp/data-table.",
    status: "beta",
    demo: "data",
    spec: ["§9"],
  },
  "hooks/use-grid-keyboard": {
    title: "useGridKeyboard",
    description:
      "Клавіатура гріда за W3C APG: одна зупинка Tab, стрілки, Home/End, Ctrl+Home/End, PageUp/PageDown, Enter/F2 у клітинку з кількома елементами (Tab між ними) і Esc назад; клітинки фокусуються кліком; рядок у фокусі рендериться одразу. Для erp/data-table.",
    status: "beta",
    demo: "data",
    spec: ["§10"],
  },
  "hooks/use-company-profile": {
    title: "useCompanyProfile",
    description:
      "Профіль поточної компанії (реквізити, зображення, філії, палітра) зі спільного кешу; у корені — палітра компанії типовою.",
    status: "beta",
    demo: "company",
    spec: ["A1", "§6.2"],
  },
  "hooks/use-api-error-message": {
    title: "useApiErrorMessage",
    description:
      "Текст помилки API за кодом мовою інтерфейсу; відповідь зовнішнього сервісу — в дужках.",
    status: "beta",
    demo: "data",
    spec: ["§8.3"],
  },
  "lib/session": {
    title: "Стан сесії",
    description:
      "Термін сесії з заголовка X-Session-Expires-At, активність користувача по всіх вкладках, події входу й виходу між вкладками.",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "lib/account": {
    title: "Контракт безпеки акаунта",
    description:
      "Фактори (застосунок, SMS, email, ключі доступу), резервні коди, сесії, довірені пристрої, журнал входів, листи про новий вхід — provider.account.",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "lib/passkey": {
    title: "Ключі доступу й WebOTP",
    description:
      "Обгортки WebAuthn (passkeys) у JSON-формі й автозаповнення коду з SMS (WebOTP); скасування — PasskeyCancelledError.",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
  },
  "lib/password": {
    title: "Надійність пароля",
    description:
      "Легка оцінка надійності без словників: довжина, різноманітність, послідовності, збіг з email чи ім'ям.",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
  },
  "lib/brand-icons": {
    title: "Логотипи провайдерів входу",
    description:
      "Google «G» (офіційні кольори) і Apple (CC0, currentColor) — лише для кнопок «Увійти через …».",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§20"],
  },
  "lib/mock-server": {
    title: "Основа мок-сервера",
    description:
      "Відповіді з терміном сесії, сценарії, ковзна сесія, користувачі моків, «надіслані» SMS і листи, маскування адрес.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "lib/mock-auth": {
    title: "Мок входу",
    description:
      "Усі способи входу з контракту lib/auth: коди, без пароля, ключ доступу, SSO, відновлення, запрошення, реєстрація, довірений пристрій, «не бот», GDPR.",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§17"],
  },
  "lib/security-policy": {
    title: "Політики безпеки й відновлення доступу",
    description:
      "Контракт політики організації (другий крок, способи входу, пароль, сесія, адреси), запити на відновлення, скидання факторів; перевірка IP/CIDR — provider.admin.",
    status: "beta",
    demo: "securityPolicy",
    spec: ["PF01"],
  },
  "lib/mock-admin": {
    title: "Мок адміністрування безпеки",
    description:
      "Політика безпеки в localStorage, її дія на вхід, запити «втратив доступ» і скидання факторів користувача.",
    status: "beta",
    demo: "securityPolicy",
    spec: ["PF01", "§17"],
  },
  "lib/audit": {
    title: "Журнал аудиту",
    description:
      "Контракт журналу (хто, що, коли, звідки; «було → стало»; причина), плоскі фільтри, експорт CSV — provider.audit.",
    status: "beta",
    demo: "audit",
    spec: ["A5", "PF01"],
  },
  "lib/webhooks": {
    title: "Вебхуки",
    description:
      "Контракт підписок на події: адреса https, події, секрет підпису (HMAC), тестова подія, журнал доставок і повтор — provider.webhooks.",
    status: "beta",
    demo: "integrations",
    spec: ["PF11", "PF17"],
  },
  "lib/notification-settings": {
    title: "Налаштування сповіщень",
    description:
      "Контракт: події проекту × канали (у застосунку, email, push, месенджери), обов'язкові сповіщення безпеки, тихі години.",
    status: "beta",
    demo: "notifications",
    spec: ["PF10"],
  },
  "lib/mock-audit": {
    title: "Мок журналу аудиту",
    description:
      "Журнал у localStorage: мок сам записує входи, безпеку, доступ, інтеграції й зміни записів (createResourceHandlers) з «було → стало».",
    status: "beta",
    demo: "audit",
    spec: ["A5", "§17"],
  },
  "lib/mock-webhooks": {
    title: "Мок вебхуків",
    description:
      "Підписки й доставки в localStorage; події записів із шини мок-сервера; результат доставки за адресою (*.invalid, /fail).",
    status: "beta",
    demo: "integrations",
    spec: ["PF17", "§17"],
  },
  "lib/mock-notifications": {
    title: "Мок налаштувань сповіщень",
    description:
      "Події й канали проекту мовами, вибір користувача й тихі години в localStorage, перевірка обов'язкових каналів.",
    status: "beta",
    demo: "notifications",
    spec: ["PF10", "§17"],
  },
  "lib/roles": {
    title: "Ролі й права",
    description:
      "Контракт ролей (назва, опис, вбудована, права <ресурс>:<дія>), каталог прав із сервера, ролі користувача; grants і togglePermission для матриці — provider.roles.",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "lib/invitations": {
    title: "Запрошення колег",
    description:
      "Контракт: запросити за email із ролями, надіслати ще раз (не частіше ніж раз на хвилину), відкликати; прийняття — AcceptInviteScreen — provider.invitations.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "lib/notifications": {
    title: "Центр сповіщень",
    description:
      "Контракт сповіщень у застосунку: список із фільтром непрочитаних, лічильник для дзвіника, позначки прочитаного, «Прочитати все» — provider.inbox.",
    status: "beta",
    demo: "inbox",
    spec: ["PF10", "UI02"],
  },
  "lib/company": {
    title: "Налаштування компанії",
    description:
      "Контракт реквізитів (юрособа чи ФОП, ЄДРПОУ / РНОКПП, ПДВ, IBAN, контакти, підписанти), логотип і печатка, філії — provider.company.",
    status: "beta",
    demo: "company",
    spec: ["A1", "LC12"],
  },
  "lib/mock-team": {
    title: "Мок ролей і запрошень",
    description:
      "Ролі й призначення в localStorage, права користувача — сума прав його ролей; запрошення з листом-посиланням і прийняттям через мок входу.",
    status: "beta",
    demo: "roles",
    spec: ["A2", "§17"],
  },
  "lib/mock-inbox": {
    title: "Мок центру сповіщень",
    description:
      "Сповіщення кожного користувача в localStorage, мовами; pushMockNotification поважає налаштування «У застосунку».",
    status: "beta",
    demo: "inbox",
    spec: ["PF10", "§17"],
  },
  "lib/mock-company": {
    title: "Мок налаштувань компанії",
    description:
      "Профіль кожної компанії в localStorage, перевірка реквізитів контрольними сумами LC12, логотип, печатка й філії.",
    status: "beta",
    demo: "company",
    spec: ["A1", "§17"],
  },
  "lib/mock-account": {
    title: "Мок безпеки акаунта",
    description:
      "Налаштування факторів, резервні коди, сесії, довірені пристрої, журнал входів, «Увійти як…»; стан акаунта в localStorage.",
    status: "beta",
    demo: "security",
    spec: ["PF01", "§17"],
  },
  "hooks/use-appearance": {
    title: "useAppearance",
    description:
      "Поточні вподобання вигляду й функція зміни; перемальовує при будь-якій зміні.",
    status: "beta",
    demo: "appearance",
    spec: ["§6.2"],
  },
  "hooks/use-breakpoint": {
    title: "useBreakpoint",
    description:
      "Брейкпоінт оболонки: телефон < 768 px, планшет до 1279 px, десктоп ≥ 1280 px.",
    status: "beta",
    demo: "appearance",
    spec: ["§7", "§9"],
  },
  "hooks/use-resolved-theme": {
    title: "useResolvedTheme",
    description:
      "Поточна тема з класу dark на <html> — для компонентів, яким потрібна тема.",
    status: "beta",
    spec: ["§6.2"],
  },
  "erp/app-shell": {
    title: "Оболонка застосунку",
    description:
      "Сайдбар із групами (десктоп), вузька панель з іконками (планшет), нижня панель + «Ще» (телефон), топбар із хлібними крихтами, «Перейти до вмісту».",
    status: "beta",
    demo: "appearance",
    spec: ["§7", "§9", "§10"],
  },
  "erp/command-palette": {
    title: "Палітра команд",
    description:
      "Cmd/Ctrl+K: пошук розділів і дій за назвою й ключовими словами; на Base UI Autocomplete. Список вантажиться при першому відкритті (ADR-0009).",
    status: "beta",
    demo: "appearance",
    spec: ["UI15", "PF06"],
  },
  "erp/command-palette-list": {
    title: "Список палітри команд",
    description:
      "Пошук і групи команд на Base UI Autocomplete; окремий файл, щоб палітра вантажила його лише при відкритті. Ставиться разом з erp/command-palette.",
    status: "beta",
    demo: "appearance",
    spec: ["UI15"],
  },
  "erp/user-menu": {
    title: "Меню користувача",
    description:
      "Профіль, тема, палітра, щільність, мова, темний сайдбар, вихід; пункти проекту — дочірніми елементами.",
    status: "beta",
    demo: "appearance",
    spec: ["§6.2", "PF11"],
  },
  "erp/company-switcher": {
    title: "Перемикач компанії",
    description:
      "Компанія чи робочий простір у шапці сайдбара; одна компанія — без меню.",
    status: "beta",
    demo: "appearance",
    spec: ["PF02"],
  },
  "erp/notification-bell": {
    title: "Дзвіник сповіщень",
    description:
      "Кнопка з лічильником у підписі й панель (керована чи ні); підключений до центру сповіщень — InboxBell з erp/notification-inbox.",
    status: "beta",
    demo: "inbox",
    spec: ["UI02", "PF10"],
  },
  "erp/page-state": {
    title: "Стани сторінки",
    description:
      "Порожньо вперше, нічого не знайдено, помилка з повтором, немає доступу, офлайн, не знайдено; PageSkeleton для завантаження; LoadingFallback для лінивих частин (оголошення через постійний live-регіон після 1 с).",
    status: "beta",
    demo: "states",
    spec: ["§8.1", "§8.2"],
  },
  "erp/data-table": {
    title: "Таблиця даних",
    description:
      "DataTable на TanStack Table 9 + Virtual: 10 000 рядків вікнами з сервера (useWindowedList) або сторінка з пагінацією; колонки з пріоритетом і поведінкою на вузькому контейнері, липкі шапка й колонка, грід W3C APG, картки на телефоні, стани SPEC §8.1, рядок стану з live-регіоном і «Оновлено о…» (ADR-0016).",
    status: "beta",
    demo: "data",
    spec: ["§7", "§8.1", "§9", "§10", "§18.1"],
  },
  "erp/data-table-grid": {
    title: "Табличний вигляд",
    description:
      "Частина erp/data-table: грід на рядках CSS Grid, віртуальні рядки у власній області прокрутки, сортування на сервері через TanStack Table, scroll-padding під липкі шапку й колонку. Ставиться разом з erp/data-table.",
    status: "beta",
    demo: "data",
    spec: ["§9", "§10"],
  },
  "erp/data-table-cells": {
    title: "Клітинки таблиці",
    description:
      "Частина erp/data-table: заголовок із сортуванням і aria-sort, перенесені під рядок колонки, рядок вікна, що вантажиться чи не завантажилось (повтор). Ставиться разом з erp/data-table.",
    status: "beta",
    demo: "data",
    spec: ["§8.1", "§10"],
  },
  "erp/data-table-cards": {
    title: "Картки таблиці",
    description:
      "Частина erp/data-table: на вузькому контейнері — картки за W3C APG Feed (PageUp/PageDown, aria-setsize на весь список), назва, позначка, дії й поля з тих самих колонок. Ставиться разом з erp/data-table.",
    status: "beta",
    demo: "data",
    spec: ["§9", "§10"],
  },
  "erp/error-boundary": {
    title: "Межа помилок",
    description:
      "Помилка рендеру чи чанк, що не завантажився, — стан «Не вдалося завантажити» з «Спробувати ще» замість білого екрана; без мережі — «Немає з'єднання»; власний вигляд для тісних місць.",
    status: "beta",
    demo: "states",
    spec: ["§8.1", "§18.5"],
  },
  "erp/conflict-dialog": {
    title: "Діалог конфлікту",
    description:
      "«Запис змінив інший користувач»: порівняння ваших і збережених значень, «Зберегти мої зміни» або «Взяти збережене».",
    status: "beta",
    demo: "data",
    spec: ["§8.2", "§17"],
  },
  "erp/dev-panel": {
    title: "Панель розробника",
    description:
      "Перемикач сценаріїв моків для всіх ресурсів чи окремо; кнопка для топбара з позначкою нестандартного сценарію.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "erp/auth-layout": {
    title: "Основа екранів входу",
    description:
      "Картка екрана входу з фокусом на заголовку кроку; бренд (логотип, палітра, бічна панель, документи); useAuthMethods, AUTH_PATHS, перехід після входу, тексти помилок полів.",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
  },
  "erp/login-screen": {
    title: "Екран входу",
    description:
      "Способи з конфігу сервера: пароль, код на email чи в SMS, ключ доступу, Google/Apple/OIDC; далі — код підтвердження або новий пароль замість тимчасового; «не бот».",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
  },
  "erp/challenge-form": {
    title: "Код підтвердження",
    description:
      "Застосунок, резервний код, SMS/Viber, email, ключ доступу; клітинки коду, повтор із відліком, інший спосіб, «Запам'ятати пристрій».",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
  },
  "erp/account-recovery": {
    title: "Відновлення доступу",
    description:
      "«Забули пароль?», новий пароль за посиланням, прийняття запрошення, вхід за посиланням із листа, повернення з SSO.",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
  },
  "erp/sign-up-screen": {
    title: "Реєстрація",
    description:
      "Самостійна реєстрація SaaS: людина, email, пароль, компанія (ЄДРПОУ чи РНОКПП) і підтвердження email кодом.",
    status: "beta",
    demo: "login",
    spec: ["PF01", "PF18"],
  },
  "erp/password-input": {
    title: "Поле пароля",
    description:
      "Кнопка «Показати пароль» замість повторного введення (WCAG 3.3.7) і підказка надійності текстом.",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§10"],
  },
  "erp/sso-buttons": {
    title: "Кнопки SSO",
    description:
      "«Увійти через Google», «Увійти з Apple» за правилами брендів і нейтральна кнопка для будь-якого OIDC.",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
  },
  "erp/captcha": {
    title: "Перевірка «не бот»",
    description:
      "Cloudflare Turnstile у режимі interaction-only лише після кількох невдалих спроб; можна замінити своїм віджетом.",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§10"],
  },
  "erp/session-guard": {
    title: "Охорона сесії",
    description:
      "Попередження з відліком перед кінцем сесії чи автовиходом через бездіяльність, «Продовжити роботу», вихід у всіх вкладках.",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "erp/reauth-dialog": {
    title: "Повторне підтвердження",
    description:
      "useReauth: перед чутливою дією — пароль або код застосунку, після підтвердження дія повторюється сама.",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "erp/account-security": {
    title: "Безпека акаунта",
    description:
      "Зміна пароля, зміна email із кодом на нову адресу, експорт даних і видалення акаунта з введенням слова (GDPR).",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "erp/account-factors": {
    title: "Способи підтвердження входу",
    description:
      "Список факторів, налаштування застосунку з QR, телефону, email і ключа доступу, перейменування й вимкнення, резервні коди (показ один раз, копіювання, файл).",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "erp/account-devices": {
    title: "Сесії й пристрої",
    description:
      "Де користувач увійшов і вихід на інших пристроях, довірені пристрої, журнал входів із довантаженням, лист про вхід з нового пристрою.",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "erp/impersonation": {
    title: "«Увійти як…»",
    description:
      "Адміністратор працює від імені користувача: діалог із причиною для аудиту, повторне підтвердження, смуга з поверненням до свого акаунта.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2", "A5"],
  },
  "erp/factor-setup": {
    title: "Налаштування факторів",
    description:
      "Діалоги застосунку з QR, SMS, email і ключа доступу, резервні коди, useFactorSetup; FactorSetupStep — крок входу, коли політика вимагає другий крок.",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "erp/profile-form": {
    title: "Профіль користувача",
    description:
      "ProfilePhoto (фото з обрізанням) і ProfileForm: ім'я, посада, контактний телефон, часовий пояс, підпис для листів.",
    status: "beta",
    demo: "profile",
    spec: ["PF01", "§11"],
  },
  "erp/avatar-editor": {
    title: "Редактор фото",
    description:
      "Вибір і перевірка файла, обрізання квадрата (перетягування, масштаб, клавіатура), стиснення 256×256 WebP на клієнті; аватар чи логотип.",
    status: "beta",
    demo: "profile",
    spec: ["PF01"],
  },
  "erp/timezone-select": {
    title: "Часовий пояс",
    description:
      "Пошук поясу IANA зі зсувом UTC на сьогодні; застарілі назви (Europe/Kiev) — сучасними.",
    status: "beta",
    demo: "profile",
    spec: ["§11"],
  },
  "erp/api-tokens": {
    title: "Токени API",
    description:
      "Персональні токени для інтеграцій: права не ширші за користувача, термін дії, показ один раз, відкликання.",
    status: "beta",
    demo: "security",
    spec: ["PF01", "PF17"],
  },
  "erp/security-policy-form": {
    title: "Політики безпеки",
    description:
      "Форма адміністратора: обов'язковий другий крок (усі чи ролі), дозволені способи, пароль, сесія й автовихід, дозволені адреси без ризику відрізати себе.",
    status: "beta",
    demo: "securityPolicy",
    spec: ["PF01"],
  },
  "erp/reset-factors": {
    title: "Відновлення доступу",
    description:
      "Запити «немає доступу до другого кроку» й useResetFactors: адміністратор скидає фактори з причиною для аудиту.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2", "A5"],
  },
  "erp/audit-log": {
    title: "Журнал аудиту",
    description:
      "AuditLog: пошук, розділ, період, подробиці («було → стало», причина, пристрій), експорт CSV; filter — історія одного запису.",
    status: "beta",
    demo: "audit",
    spec: ["A5", "PF01"],
  },
  "erp/webhooks-section": {
    title: "Вебхуки",
    description:
      "WebhooksSection: підписки, увімкнення, тестова подія, новий секрет (показ один раз), журнал доставок із повтором.",
    status: "beta",
    demo: "integrations",
    spec: ["PF11", "PF17"],
  },
  "erp/notification-settings-form": {
    title: "Налаштування сповіщень",
    description:
      "NotificationSettingsForm: матриця подій і каналів (на телефоні — картки), обов'язкові сповіщення безпеки, тихі години, дозвіл push у браузері.",
    status: "beta",
    demo: "notifications",
    spec: ["PF10"],
  },
  "erp/permission-gate": {
    title: "Перевірка права",
    description:
      "PermissionGate: вміст лише з правом <ресурс>:<дія> (ADR-0003); fallback і стан, поки профіль вантажиться.",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "erp/roles-editor": {
    title: "Ролі й матриця прав",
    description:
      "RolesEditor: ролі, матриця прав за розділами (усе / окремі дії, частково — «−»), нова роль і копія, видалення, незбережені зміни; RolePicker і useRoles.",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "erp/invitations-section": {
    title: "Запрошення",
    description:
      "InvitationsSection: хто чекає, «Запросити колегу» з ролями й повідомленням, надіслати ще раз, відкликати.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/notification-inbox": {
    title: "Центр сповіщень",
    description:
      "InboxBell (лічильник і останні сповіщення), NotificationInbox (усі / непрочитані, позначки, «Прочитати все», ще), useUnreadNotifications.",
    status: "beta",
    demo: "inbox",
    spec: ["PF10", "UI02"],
  },
  "erp/company-settings": {
    title: "Налаштування компанії",
    description:
      "CompanyProfileForm (реквізити з перевіркою LC12; без права — лише перегляд), CompanyImages (логотип і печатка), CompanyBranchesSection (філії).",
    status: "beta",
    demo: "company",
    spec: ["A1", "LC12"],
  },
  "erp/user-access": {
    title: "Доступ користувачів",
    description:
      "Панель доступу (стан, ролі, двоетапна перевірка, сесії, вийти всюди, скинути другий крок, блокування з причиною) і активні сесії компанії.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/copy-button": {
    title: "Кнопка «Копіювати»",
    description:
      "Копіює значення в буфер, показує галочку й повідомляє скрінрідеру «Скопійовано».",
    status: "beta",
    demo: "security",
    spec: ["UI43"],
  },
  "erp/qr-code": {
    title: "QR-код",
    description:
      "QR у SVG (lean-qr): завжди темний на світлому (токени scan), тиха зона, підпис для скрінрідера.",
    status: "beta",
    demo: "security",
    spec: ["UI32", "PF01"],
  },
  "erp/date-input": {
    title: "Поле дати й часу",
    description:
      "DateInput: дата з клавіатури («13.10.2026», роздільники самі) і календар поруч, min/max, read-only; TimeInput: час 24 години. Значення — календарна дата або неповне введення як є для перевірки форми.",
    status: "beta",
    demo: "fields",
    spec: ["UI39", "§8.3", "§11"],
  },
  "erp/date-range-input": {
    title: "Період",
    description:
      "DateRangeInput: пресети («Цей місяць», «Минулий квартал»…), календар діапазону й поля «Від/До» з клавіатури; пресет застосовується одразу, решта — «Готово»; read-only.",
    status: "beta",
    demo: "fields",
    spec: ["UI39", "§11"],
  },
  "erp/number-group": {
    title: "Група поля числа",
    description:
      "Частина erp/number-input: група поля й захист поля без дробу (кома й дріб не вводяться, не зливають цифри); підказка «Лише ціле число» спливає під полем, не зсуваючи розкладку, і озвучується.",
    status: "beta",
    demo: "fields",
    spec: ["UI21", "§10", "§11"],
  },
  "erp/number-input": {
    title: "Поля числа й суми",
    description:
      "MoneyInput (Money у мінорних одиницях, знаки після коми за валютою, «₴» чи код) і NumberInput (кількість, відсоток, одиниця); розряди й кома — за мовою інтерфейсу; у полі без дробу кома не вводиться, спливає підказка «Лише ціле число».",
    status: "beta",
    demo: "fields",
    spec: ["UI21", "§11", "§17"],
  },
  "erp/confirm-dialog": {
    title: "Діалог підтвердження",
    description:
      "Три рівні видалення (SPEC §8.2): useUndoToast для зворотних дій, ConfirmDialog з кнопкою-наслідком, confirmWord для критичних дій; кнопка зайнята, поки триває дія.",
    status: "beta",
    demo: "forms",
    spec: ["§8.2"],
  },
  "erp/form": {
    title: "Форми",
    description:
      "Форми на react-hook-form + zod (ADR-0015): FormField (підпис, підказка, помилка, aria, read-only), FormErrorSummary для довгих форм, UnsavedChangesGuard (діалог у застосунку + beforeunload).",
    status: "beta",
    demo: "forms",
    spec: ["§8.2", "§8.3"],
  },
  "erp/ua-id-input": {
    title: "Поле ідентифікатора UA",
    description:
      "ЄДРПОУ, РНОКПП, ІПН ПДВ, IBAN з маскою (react-number-format); значення без пробілів; тексти помилок — uaIdIssueKey.",
    status: "beta",
    demo: "formats",
    spec: ["LC12", "§8.3"],
  },
  "erp/phone-input": {
    title: "Поле телефону",
    description:
      "Вибір країни (без РФ і РБ за замовчуванням) + маска; значення в E.164; номер без «+» — український.",
    status: "beta",
    demo: "formats",
    spec: ["LC12", "§8.3"],
  },
  "ui/alert-dialog": {
    title: "Діалог-попередження",
    description:
      "Base UI AlertDialog: не закривається кліком поза ним; основа ConfirmDialog. Довгий вміст прокручується.",
    status: "beta",
    demo: "forms",
  },
  "ui/alert": {
    title: "Повідомлення",
    description:
      "Банер у потоці сторінки; варіанти статусів — soft-тло + *-foreground.",
    status: "beta",
    demo: "states",
    spec: ["§6.3"],
  },
  "ui/avatar": {
    title: "Аватар",
    description: "Фото або ініціали; групи аватарів.",
    status: "beta",
    demo: "appearance",
  },
  "ui/badge": {
    title: "Бейдж",
    description:
      "Мітки й статуси: soft-тло + *-foreground (success, warning, info, destructive).",
    status: "beta",
    demo: "primitives",
    spec: ["§6.3"],
  },
  "ui/breadcrumb": {
    title: "Хлібні крихти",
    description: "Шлях до сторінки; підписи для скрінрідера мовою інтерфейсу.",
    status: "beta",
    demo: "appearance",
    spec: ["§7"],
  },
  "ui/button": {
    title: "Кнопка",
    description:
      "Усі варіанти; висота з токенів щільності; зона натиску ≥ 44 px; «недоступно з поясненням».",
    status: "beta",
    demo: "primitives",
    spec: ["§6.5", "§8.4"],
  },
  "ui/calendar": {
    title: "Календар",
    description:
      "react-day-picker 10 на токенах erp-ui: локаль за мовою інтерфейсу, тиждень з понеділка й номери ISO, один день чи діапазон, вибір у forced-colors.",
    status: "beta",
    demo: "fields",
    spec: ["UI39", "§11"],
  },
  "ui/card": {
    title: "Картка",
    description: "Контейнер секції з заголовком, описом, діями й підвалом.",
    status: "beta",
    demo: "primitives",
  },
  "ui/checkbox": {
    title: "Прапорець",
    description: "Checkbox на Base UI зі зоною натиску ≥ 24 px.",
    status: "beta",
    demo: "primitives",
  },
  "ui/dialog": {
    title: "Діалог",
    description: "Модальне вікно; кнопки називають наслідок (SPEC §8.2).",
    status: "beta",
    demo: "primitives",
    spec: ["§8.2"],
  },
  "ui/dropdown-menu": {
    title: "Меню",
    description:
      "Випадне меню на Base UI: пункти, перемикачі, прапорці, підменю.",
    status: "beta",
    demo: "appearance",
  },
  "ui/empty": {
    title: "Порожній блок",
    description: "Основа станів сторінки: іконка, заголовок, опис, дії.",
    status: "beta",
    demo: "states",
    spec: ["§8.1"],
  },
  "ui/field": {
    title: "Поле форми",
    description: "Підпис, опис і помилка поля; групи й набори полів.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.3"],
  },
  "ui/input": {
    title: "Поле вводу",
    description:
      "Висота з токена щільності; read-only відрізняється від disabled.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.3"],
  },
  "ui/combobox": {
    title: "Комбобокс",
    description:
      "Поле з пошуком по списку (Base UI Combobox): довідники, часові пояси; чипи для кількох значень.",
    status: "beta",
    demo: "profile",
  },
  "ui/slider": {
    title: "Повзунок",
    description:
      "Base UI Slider: доріжка з контрастом 3:1, доступна назва й текст значення для скрінрідера.",
    status: "beta",
    demo: "profile",
  },
  "ui/input-otp": {
    title: "Поле коду",
    description:
      "Клітинки одноразового коду на input-otp: одне справжнє поле, автозаповнення з SMS, вставка, висота з токена щільності.",
    status: "beta",
    demo: "login",
  },
  "ui/input-group": {
    title: "Група поля",
    description:
      "Поле з адонами: іконка, спінер перевірки, замок «редагує інший».",
    status: "beta",
    demo: "primitives",
    spec: ["§8.3"],
  },
  "ui/kbd": {
    title: "Клавіша",
    description: "Позначення клавіш і поєднань (Ctrl K).",
    status: "beta",
    demo: "appearance",
  },
  "ui/label": {
    title: "Підпис",
    description: "Підпис поля над контролом.",
    status: "beta",
    demo: "primitives",
  },
  "ui/popover": {
    title: "Спливна панель",
    description: "Popover на Base UI з заголовком і описом.",
    status: "beta",
    demo: "appearance",
  },
  "ui/select": {
    title: "Список вибору",
    description: "Select на Base UI; висота з токена щільності.",
    status: "beta",
    demo: "primitives",
  },
  "ui/separator": {
    title: "Розділювач",
    description: "Горизонтальна чи вертикальна лінія.",
    status: "beta",
    demo: "primitives",
  },
  "ui/sheet": {
    title: "Шторка",
    description: "Бічна чи нижня панель (фільтри, редактори на телефоні).",
    status: "beta",
    demo: "primitives",
    spec: ["§9", "UI38"],
  },
  "ui/sidebar": {
    title: "Сайдбар",
    description:
      "Основа оболонки: розгорнутий, вузька панель з іконками, шторка на телефоні; пункти з токенів щільності, Ctrl+B поза полями вводу.",
    status: "beta",
    demo: "appearance",
    spec: ["§7", "§9"],
  },
  "ui/skeleton": {
    title: "Скелетон",
    description:
      "Заглушка контенту під час першого завантаження (лише в контейнерах).",
    status: "beta",
    demo: "primitives",
    spec: ["§8.1", "§8.2"],
  },
  "ui/sonner": {
    title: "Тости",
    description:
      "Сповіщення sonner; тема з <html>; 8 с і кнопка закриття; тостам із «Скасувати» задавайте duration: Infinity, щоб не зникали самі.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.2", "PF10"],
  },
  "ui/spinner": {
    title: "Спінер",
    description: "Індикатор очікування з підписом для скрінрідера.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.2"],
  },
  "ui/switch": {
    title: "Перемикач",
    description: "Switch на Base UI зі зоною натиску ≥ 24 px.",
    status: "beta",
    demo: "primitives",
  },
  "ui/table": {
    title: "Таблиця",
    description:
      "Проста таблиця; рядки з токена щільності; прокрутка доступна з клавіатури.",
    status: "beta",
    demo: "primitives",
    spec: ["§9", "§10"],
  },
  "ui/tabs": {
    title: "Вкладки",
    description: "Вкладки на Base UI (вкладки-статуси списків).",
    status: "beta",
    demo: "primitives",
  },
  "ui/textarea": {
    title: "Багаторядкове поле",
    description: "Textarea з автовисотою.",
    status: "beta",
    demo: "primitives",
  },
  "ui/tooltip": {
    title: "Підказка",
    description: "Tooltip; пояснює недоступні дії (SPEC §8.4).",
    status: "beta",
    demo: "primitives",
    spec: ["§8.4"],
  },
}

/** Файли шару токенів у проекті. */
const TOKEN_FILES = [
  { path: "registry/tokens/app.css", target: "~/src/index.css" },
  { path: "design/themes.css", target: "~/src/styles/erp-ui/themes.css" },
  { path: "registry/tokens/base.css", target: "~/src/styles/erp-ui/base.css" },
  {
    path: "registry/tokens/no-default-colors.css",
    target: "~/src/styles/erp-ui/no-default-colors.css",
  },
]

const CLAUDE_FILES = [
  {
    path: "registry/claude/skills/erp-ui/SKILL.md",
    target: "~/.claude/skills/erp-ui/SKILL.md",
  },
  {
    path: "registry/claude/CLAUDE.project.md",
    target: "~/docs/erp-ui/CLAUDE.project.md",
  },
  { path: "docs/SPEC.md", target: "~/docs/erp-ui/SPEC.md" },
  { path: "docs/CATALOG.md", target: "~/docs/erp-ui/CATALOG.md" },
]

/** Елементи без власного коду: файли задано явно; `include` — елементи з кодом, які входять повністю. */
export const BUNDLE_ITEMS = {
  base: {
    title: "Основа erp-ui",
    description:
      "Усе для старту проекту однією командою: теми й токени, базові стилі, cn, вподобання вигляду, мови й форматери, словник іконок, скіл і правила для Claude Code.",
    status: "beta",
    demo: "appearance",
    spec: ["§3", "§6", "§19"],
    files: [...TOKEN_FILES, ...CLAUDE_FILES],
    include: [
      "lib/utils",
      "hooks/use-resolved-theme",
      "lib/i18n",
      "lib/lazy",
      "lib/format",
      "lib/appearance",
      "hooks/use-appearance",
      "lib/icons",
    ],
    dependencies: ["@fontsource/geist", "tw-animate-css", "shadcn"],
    docs: [
      "erp-ui встановлено.",
      "1) src/index.css тепер — точка входу стилів erp-ui; власні стилі проекту додавайте нижче імпортів.",
      "2) Додайте в CLAUDE.md проекту рядок: @docs/erp-ui/CLAUDE.project.md",
      "3) У main.tsx до рендеру: initAppearance() з @/lib/appearance, const i18n = createI18n({ language: getAppearance().language, resources }) з @/lib/i18n, syncLanguage(i18n) і await whenI18nReady(i18n).",
      '4) Вигляд задається на <html>: data-palette="sapphire|graphite|…", клас dark, data-density="compact", data-sidebar="dark".',
      "Компоненти: npx shadcn add VasulenkoIllia/erp-ui/ui/<назва>. Каталог: docs/erp-ui/CATALOG.md.",
    ].join("\n"),
  },
  data: {
    title: "Шар даних",
    description:
      "Клієнт API, dataProvider і authProvider для ra-core, поточна компанія, вподобання на сервері, повідомлення ra-core, useMe, useCompany, тексти помилок API.",
    status: "beta",
    demo: "data",
    spec: ["§17", "PF01", "PF02", "PF11"],
    files: [],
    include: [
      "lib/api",
      "lib/data-provider",
      "lib/auth",
      "lib/company-scope",
      "lib/preferences",
      "lib/ra-i18n",
      "hooks/use-me",
      "hooks/use-company",
      "hooks/use-api-error-message",
    ],
    // ra-core бере маршрутизацію з React Router (peer-залежності).
    dependencies: ["react-router", "react-router-dom"],
    docs: [
      "Шар даних erp-ui встановлено (ADR-0002, ADR-0003).",
      "1) Створіть клієнт: createApiClient() з @/lib/api; компанію для X-Company-Id веде @/lib/company-scope, перемикання — useCompany() з @/hooks/use-company.",
      "2) authProvider = createAuthProvider(client, { onMe: (me) => queryClient.setQueryData(ME_QUERY_KEY, me) }); dataProvider = createDataProvider(client).",
      "3) Обгорніть застосунок у <CoreAdminContext dataProvider authProvider i18nProvider={createRaI18nProvider(i18n)} queryClient>.",
      "4) Після входу: syncPreferences(client) з @/lib/preferences. Докладно — docs/erp-ui/CATALOG.md і SPEC §17.",
    ].join("\n"),
  },
  auth: {
    title: "Вхід і акаунт",
    description:
      "Усі екрани входу, акаунта й адміністрування доступу (ADR-0010–0014): вхід, коди, ключі доступу, SSO, відновлення, запрошення, реєстрація, охорона сесії, повторне підтвердження, налаштування факторів, сесії й пристрої, журнал входів, «Увійти як…», бренд сторінки входу, профіль, політики, токени API, сповіщення, журнал аудиту, вебхуки, доступ користувачів, ролі й права, запрошення, центр сповіщень, налаштування компанії.",
    status: "beta",
    demo: "login",
    spec: ["PF01"],
    files: [],
    include: [
      "erp/login-screen",
      "erp/account-recovery",
      "erp/sign-up-screen",
      "erp/session-guard",
      "erp/account-security",
      "erp/account-factors",
      "erp/account-devices",
      "erp/impersonation",
      "erp/factor-setup",
      "erp/profile-form",
      "erp/api-tokens",
      "erp/security-policy-form",
      "erp/reset-factors",
      "erp/user-access",
      "erp/audit-log",
      "erp/webhooks-section",
      "erp/notification-settings-form",
      "erp/permission-gate",
      "erp/roles-editor",
      "erp/invitations-section",
      "erp/notification-inbox",
      "erp/company-settings",
    ],
    docs: [
      "Екрани входу erp-ui встановлено (ADR-0010). Потрібен пакунок data (authProvider із lib/auth).",
      "1) Маршрути поза оболонкою: /login → LoginScreen, /login/forgot, /login/reset, /login/invite, /login/link → екрани з erp/account-recovery, /signup → SignUpScreen, /auth/callback → SsoCallbackScreen (адреси змінюються пропсом paths).",
      "2) У оболонці, коли користувач увійшов: <SessionGuard idleMinutes={methods.idleTimeoutMinutes} />.",
      "3) Налаштування безпеки: FactorsSection (erp/account-factors); ChangePasswordForm, ChangeEmailForm, AccountDataSection (erp/account-security); SessionsSection, TrustedDevicesSection, SignInAlertsSwitch, SignInHistory (erp/account-devices).",
      "4) «Увійти як…» (ADR-0011): useImpersonation() у списку користувачів; <AppShell banner={<ImpersonationBanner />}>.",
      "5) Бренд сторінки входу приходить із GET /auth/methods (branding); у корені застосунку — useBrandAppearance() з erp/auth-layout.",
      "6) Профіль: ProfilePhoto і ProfileForm (erp/profile-form); токени API: ApiTokensSection (erp/api-tokens).",
      "7) Адміністратор (ADR-0012): SecurityPolicyForm (erp/security-policy-form); у списку користувачів — useResetFactors і RecoveryRequestsSection (erp/reset-factors).",
      "8) Сповіщення: NotificationSettingsForm (erp/notification-settings-form). Адміністратор (ADR-0013): useUserAccessSheet і ActiveSessionsSection (erp/user-access), AuditLog (erp/audit-log), WebhooksSection (erp/webhooks-section).",
      "9) Команда й компанія (ADR-0014): RolesEditor (erp/roles-editor), InvitationsSection (erp/invitations-section), PermissionGate (erp/permission-gate); у топбарі — <InboxBell onNavigate onShowAll />, сторінка — NotificationInbox (erp/notification-inbox); CompanyProfileForm, CompanyImages, CompanyBranchesSection (erp/company-settings).",
    ].join("\n"),
  },
  mocks: {
    title: "Моки й панель розробника",
    description:
      "MSW-обробники за контрактами API, сценарії success/error/empty/slow/conflict/forbidden/offline і панель їх перемикання.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
    files: [],
    include: ["lib/mock-scenarios", "lib/mocks", "erp/dev-panel"],
    docs: [
      "Моки erp-ui встановлено. msw — у devDependencies.",
      "1) npx msw init public — файл service worker.",
      "2) Обробники: createPlatformHandlers({ users }) і createResourceHandlers({ resource, schema, data }) з @/lib/mocks; setupWorker(...handlers).start() до рендеру — лише в розробці.",
      "3) <DevPanel resources={[…]} compact onChange={() => queryClient.invalidateQueries()} /> — у топбар.",
    ].join("\n"),
  },
  tokens: {
    title: "Токени й теми",
    description:
      "Лише шар 1: 5 палітр × світла/темна, щільність, мапінг токенів у Tailwind v4, базові стилі.",
    status: "beta",
    demo: "appearance",
    spec: ["§6"],
    files: TOKEN_FILES,
    dependencies: ["@fontsource/geist", "tw-animate-css", "shadcn"],
  },
  claude: {
    title: "Правила для Claude Code",
    description:
      "Скіл erp-ui, блок для CLAUDE.md, SPEC і каталог реєстру в docs/erp-ui/.",
    status: "beta",
    spec: ["§19"],
    files: CLAUDE_FILES,
    docs: "Додайте в CLAUDE.md проекту рядок: @docs/erp-ui/CLAUDE.project.md",
  },
}
