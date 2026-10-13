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
      "i18next + react-i18next: createI18n, українська за замовчуванням, англійська з британськими форматами, <html lang>, useLanguage, useErpUiT.",
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
  "lib/format": {
    title: "Форматери Intl",
    description:
      "Числа, відсотки, гроші з мінорних одиниць (₴ після суми, інші валюти кодом), дати явними стилями без «р.», відносний час, тиждень ISO, useFormat.",
    status: "beta",
    demo: "formats",
    spec: ["§11", "§17"],
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
      "createPlatformHandlers (вхід із 2FA, /me, вподобання) і createResourceHandlers (CRUD, фільтри, сортування, пагінація, права, версії, компанії) за контрактами API.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "hooks/use-me": {
    title: "useMe",
    description:
      "Профіль поточного користувача з кешу TanStack Query: null — гість; useHasPermission.",
    status: "beta",
    demo: "data",
    spec: ["PF01", "A2"],
  },
  "hooks/use-api-error-message": {
    title: "useApiErrorMessage",
    description:
      "Текст помилки API за кодом мовою інтерфейсу; відповідь зовнішнього сервісу — в дужках.",
    status: "beta",
    demo: "data",
    spec: ["§8.3"],
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
      "Cmd/Ctrl+K: пошук розділів і дій за назвою й ключовими словами; на Base UI Autocomplete.",
    status: "beta",
    demo: "appearance",
    spec: ["UI15", "PF06"],
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
    description: "Кнопка з лічильником у підписі й панель; заглушка до PF10.",
    status: "draft",
    demo: "appearance",
    spec: ["UI02", "PF10"],
  },
  "erp/page-state": {
    title: "Стани сторінки",
    description:
      "Порожньо вперше, нічого не знайдено, помилка з повтором, немає доступу, офлайн, не знайдено; PageSkeleton для завантаження.",
    status: "beta",
    demo: "states",
    spec: ["§8.1", "§8.2"],
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
      "Сповіщення sonner; тема з <html>; тости з «Скасувати» не зникають самі.",
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
      "3) У main.tsx до рендеру: initAppearance() з @/lib/appearance і syncLanguage(createI18n({ resources })) з @/lib/i18n.",
      '4) Вигляд задається на <html>: data-palette="sapphire|graphite|…", клас dark, data-density="compact", data-sidebar="dark".',
      "Компоненти: npx shadcn add VasulenkoIllia/erp-ui/ui/<назва>. Каталог: docs/erp-ui/CATALOG.md.",
    ].join("\n"),
  },
  data: {
    title: "Шар даних",
    description:
      "Клієнт API, dataProvider і authProvider для ra-core, вподобання на сервері, повідомлення ra-core, useMe, тексти помилок API.",
    status: "beta",
    demo: "data",
    spec: ["§17", "PF01", "PF11"],
    files: [],
    include: [
      "lib/api",
      "lib/data-provider",
      "lib/auth",
      "lib/preferences",
      "lib/ra-i18n",
      "hooks/use-me",
      "hooks/use-api-error-message",
    ],
    // ra-core бере маршрутизацію з React Router (peer-залежності).
    dependencies: ["react-router", "react-router-dom"],
    docs: [
      "Шар даних erp-ui встановлено (ADR-0002, ADR-0003).",
      "1) Створіть клієнт: createApiClient({ getCompanyId }) з @/lib/api.",
      "2) authProvider = createAuthProvider(client, { onMe: (me) => queryClient.setQueryData(ME_QUERY_KEY, me) }); dataProvider = createDataProvider(client).",
      "3) Обгорніть застосунок у <CoreAdminContext dataProvider authProvider i18nProvider={createRaI18nProvider(i18n)} queryClient>.",
      "4) Після входу: syncPreferences(client) з @/lib/preferences. Докладно — docs/erp-ui/CATALOG.md і SPEC §17.",
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
