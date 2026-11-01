/**
 * Опис елементів реєстру erp-ui — джерело для registry.json і docs/CATALOG.md (scripts/build-registry.mjs).
 * Кожен файл у registry/{ui,erp,templates,lib,hooks} мусить мати тут запис: так каталог завжди повний.
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
  "lib/i18n-namespaces": {
    title: "Рядки модуля",
    description:
      "Свій простір імен i18next для модуля (ADR-0025): useNamespaceResources (українські разом зі сторінками, інші мови — лінивим чанком із повтором), useNamespaceT, перевизначення з файлу розширення — mergeMessages і MessagesOverride.",
    status: "beta",
    demo: "contacts",
    spec: ["§11", "§17"],
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
  "lib/i18n-uk-lists": {
    title: "Рядки списків uk",
    description:
      "Рядки кіта для вкладок-статусів, FilterBar і збережених видів українською; входять у простір імен erp-ui через lib/i18n-uk.",
    status: "beta",
    demo: "data",
    spec: ["§11"],
  },
  "lib/i18n-en-lists": {
    title: "Рядки списків en",
    description:
      "Ті самі рядки списків англійською; входять у lib/i18n-en, паритет ключів перевіряє тест.",
    status: "beta",
    demo: "data",
    spec: ["§11"],
  },
  "lib/i18n-uk-records": {
    title: "Рядки вибору запису uk",
    description:
      "Рядки кіта для вибору запису (UI40) і значень із «Копіювати» (UI43) українською; входять у простір імен erp-ui через lib/i18n-uk.",
    status: "beta",
    demo: "pickers",
    spec: ["§11"],
  },
  "lib/i18n-uk-shortcuts": {
    title: "Рядки клавіш uk",
    description:
      "Рядки довідки гарячих клавіш українською: групи, підписи, слова для скрінрідера; входять у простір імен erp-ui через lib/i18n-uk.",
    status: "beta",
    demo: "shortcuts",
    spec: ["§11"],
  },
  "lib/i18n-en-shortcuts": {
    title: "Рядки клавіш en",
    description:
      "Ті самі рядки довідки клавіш англійською; паритет ключів перевіряє тест.",
    status: "beta",
    demo: "shortcuts",
    spec: ["§11"],
  },
  "lib/i18n-en-records": {
    title: "Рядки вибору запису en",
    description:
      "Ті самі рядки вибору запису й значень англійською; входять у lib/i18n-en, паритет ключів перевіряє тест.",
    status: "beta",
    demo: "pickers",
    spec: ["§11"],
  },
  "lib/i18n-uk-setup": {
    title: "Рядки чек-листа українською",
    description:
      "Рядки чек-листа «Почніть роботу» (ADR-0044): окремий файл простору імен erp-ui.",
    status: "beta",
    demo: "setup",
    spec: ["PF12", "§11"],
  },
  "lib/i18n-uk-wizard": {
    title: "Рядки майстра uk",
    description:
      "Рядки майстра UI06 українською: кроки, кнопки, огляд; входять у простір імен erp-ui через lib/i18n-uk.",
    status: "beta",
    demo: "wizard",
    spec: ["§11", "UI06"],
  },
  "lib/i18n-en-setup": {
    title: "Рядки чек-листа англійською",
    description:
      "Рядки чек-листа «Почніть роботу» (ADR-0044): окремий файл простору імен erp-ui.",
    status: "beta",
    demo: "setup",
    spec: ["PF12", "§11"],
  },
  "lib/i18n-en-wizard": {
    title: "Рядки майстра en",
    description:
      "Ті самі рядки майстра англійською; паритет ключів перевіряє тест.",
    status: "beta",
    demo: "wizard",
    spec: ["§11", "UI06"],
  },
  "lib/currencies": {
    title: "Коди й назви валют",
    description:
      "Довідник ISO 4217 для поля вибору: коди з браузера, назва мовою інтерфейсу (ADR-0043).",
    status: "beta",
    demo: "companyModule",
    spec: ["PF02", "§11"],
  },
  "lib/key-value": {
    title: "Значення «ключ–значення»",
    description:
      "Рядки форми й об'єкт запиту: keyValueRows, keyValueRecord без порожніх рядків, keyValueSchema (помилка біля клітинки, дублікати ключів без урахування регістру), keyValueText для порівняння при конфлікті (UI42, ADR-0047).",
    status: "beta",
    demo: "forms",
    spec: ["UI42"],
  },
  "lib/wizard-progress": {
    title: "Прогрес майстра",
    description:
      "Прогрес майстра UI06: поточний і найдальший крок, чернетка; збереження в браузері (loadWizardProgress, saveWizardProgress, clearWizardProgress) з ключем компанії й людини (ADR-0043).",
    status: "beta",
    demo: "wizard",
    spec: ["§7", "UI06"],
  },
  "lib/shortcuts": {
    title: "Реєстр клавіш",
    description:
      "Єдиний перелік гарячих клавіш кіта: поєднання, групи, перевірка натискання (з фізичною клавішею на нелатинській розкладці), вимикач символьних клавіш (WCAG 2.1.4), підписи й aria-keyshortcuts (ADR-0042).",
    status: "beta",
    demo: "shortcuts",
    spec: ["PF06", "§10"],
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
  "lib/row-selection": {
    title: "Вибір рядків: логіка",
    description:
      "Без React: вибрані записи (переживають сторінки й прокрутку) або «усі за фільтром, крім знятих», лічильник, вибір для запиту масової дії ({ ids } чи { filter, exclude }) (ADR-0018).",
    status: "beta",
    demo: "data",
    spec: ["§8.1"],
  },
  "lib/list-state": {
    title: "Стан списку",
    description:
      "Без React: вкладка-статус, фільтри й сортування ⇄ параметри адреси тим самим синтаксисом, що й API (ADR-0002), порівняння станів, фільтр запиту з вкладкою (ADR-0017).",
    status: "beta",
    demo: "data",
    spec: ["§7", "UI03"],
  },
  "lib/extensions": {
    title: "Точки розширення модуля",
    description:
      "Без React: зміни списку елементів модуля за ключем — додати з місцем (`place`) чи замінити, сховати й замінити (крім закріплених), переставити (applyKeyedChanges); ключі модуля в змінах і місцях перевіряє TypeScript; зміна властивостей елемента модуля без заміни (change: назва й пріоритет колонки, підпис і підказка поля форми); перетворення доданих даних на елементи шаблону (mapKeyedChanges) (ADR-0020).",
    status: "beta",
    demo: "data",
    spec: ["§17", "PF09"],
  },
  "lib/extension-fields": {
    title: "Поля розширення",
    description:
      "Нові поля запису даними (текст, число, дата, так/ні, список, запис із довідника сервера; підписи uk/en): схема контракту з ними (extendSchema), значення для моків (withMockValues), підписи й значення в журналі моків (extensionAuditOptions, запис — назвою з довідника моків), значення з запису модуля (extensionValue), текст мовою інтерфейсу, колонка списку й поле шапки картки, запис — підписом із сервера (useExtensionFields), фільтр панелі (ADR-0020, ADR-0030).",
    status: "beta",
    demo: "data",
    spec: ["§11", "§17", "PF09"],
  },
  "lib/extension-field-types": {
    title: "Типи полів розширення",
    description:
      "Типи для lib/extension-fields: поле розширення (текст, число, дата, так/ні, список, запис із довідника), колонка, зміна колонки модуля, фільтр, вкладка, поле запису текстом (entry) і для шапки (displayEntry), опції журналу моків; unknownFieldType. Проект імпортує їх з lib/extension-fields (ADR-0020, ADR-0030).",
    status: "beta",
    demo: "data",
    spec: ["§17", "PF09"],
  },
  "lib/extension-form": {
    title: "Поля розширення у формі",
    description:
      "Без React: які поля розширення стоять у формі модуля (form.add; обов'язкове поза формою — помилка розробника), схеми перевірки з текстами мовою інтерфейсу, значення форми з запису й значення для запиту (порожнє — null), зміна підпису й підказки поля модуля без заміни (ADR-0020, ADR-0026).",
    status: "beta",
    demo: "contacts",
    spec: ["§8.3", "§17", "PF09"],
  },
  "lib/filters": {
    title: "Фільтри панелі",
    description:
      "Без React: опис фільтра FilterBar (варіанти, період, діапазон суми, запис із довідника сервера) і перетворення між значенням у формі та плоскими параметрами API, активні фільтри для чипів (ADR-0017, ADR-0030).",
    status: "beta",
    demo: "data",
    spec: ["§7", "UI03"],
  },
  "lib/record-label": {
    title: "Підпис запису з довідника",
    description:
      "RecordLabel: назва запису довідника сервера за id для колонки, шапки й чипа фільтра; підписи сторінки — одним запитом getMany (GET /<ресурс>?id=a&id=b); стани «Завантаження…», «Запис не знайдено», «Немає доступу» (403), «Не вдалося завантажити запис». recordOptionTexts — підпис і другий рядок варіанта вибору з полів запису (ADR-0030).",
    status: "beta",
    demo: "contacts",
    spec: ["§8.2", "§17", "UI40", "PF09"],
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
      "HTTP-клієнт і контракт REST (ADR-0002): плоскі параметри списку, { data, total }, єдиний формат помилок ApiError, version для конфліктів, X-Company-Id, cookie-сесія; межа часу запиту timeoutMs (сервер мовчить — ApiError offline).",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "lib/query-client": {
    title: "QueryClient застосунку",
    description:
      "createQueryClient: один тихий повтор читання через 1 с після збою мережі чи 5xx, без повтору 4xx (401 одразу до SessionGuard) і мутацій, свіжість даних 30 с (ADR-0029).",
    status: "beta",
    demo: "data",
    spec: ["§17", "§8.1"],
  },
  "lib/data-provider": {
    title: "dataProvider ra-core",
    description:
      "createDataProvider: getList/getOne/getMany/create/update/delete за конвенціями API; update надсилає змінені поля + version; масові дії — startBulk, getJob, retryJob (lib/jobs, ADR-0018); закріплення й розмір сторінки — setPinned, getListSettings, saveListSettings (ADR-0024).",
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
      "createPlatformHandlers (вхід, /me, вподобання, безпека, аудит, вебхуки, сповіщення) і createResourceHandlers (CRUD, фільтри, сортування, пагінація, права, версії, компанії, позначка заборон deniedActions на спільних записах — ADR-0037, «свої» записи й свій код проекту responsibleField і deniedActions — ADR-0039; зміни — у журнал аудиту й на шину подій) за контрактами API; db.select і db.patch — для масових дій (lib/mock-jobs); pins: true — закріплення записів (lib/mock-lists); detailFields — вкладені колекції зберігаються з записом, у список не йдуть, auditValue — їх показ у «було → стало» (ADR-0028).",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "lib/mock-records": {
    title: "Записи мок-ресурсу",
    description:
      "Фільтри й сортування списку за ADR-0002, унікальні поля, компанія запису, обгортки доступу до ресурсу (ADR-0037, ADR-0039); чисті функції для createResourceHandlers.",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "hooks/use-palette-actions": {
    title: "usePaletteActions",
    description:
      "Дії відкритого запису в палітрі команд: картка описує їх даними, палітра показує першою групою, неактивні з причиною (ADR-0044).",
    status: "beta",
    demo: "shortcuts",
    spec: ["§7", "PF06", "UI15"],
  },
  "hooks/use-setup-dismissals": {
    title: "useSetupDismissals",
    description:
      "Вибір «Не потрібно» в чек-листі «Почніть роботу»: окремо для кожної компанії, у цьому браузері (ADR-0044).",
    status: "beta",
    demo: "setup",
    spec: ["PF12"],
  },
  "hooks/use-wizard": {
    title: "useWizard",
    description:
      "Стан майстра UI06: крок, найдальший відкритий, далі з перевіркою чи збереженням кроку, пропуск, помилка з повтором, захист від подвійного запиту (ADR-0043).",
    status: "beta",
    demo: "wizard",
    spec: ["§7", "UI06"],
  },
  "hooks/use-shortcut": {
    title: "useShortcut",
    description:
      "Клавіша на весь застосунок із реєстру lib/shortcuts: слухає вікно, поважає поле вводу й вимикач символьних клавіш.",
    status: "beta",
    demo: "shortcuts",
    spec: ["PF06", "§10"],
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
  "hooks/use-list-state": {
    title: "Стан списку в адресі",
    description:
      "useListState: вкладка, фільтри, сортування й вид в адресі сторінки (роутер дає застосунок), вид за замовчуванням при відкритті без параметрів, «змінено», «Стандартний» (ADR-0017).",
    status: "beta",
    demo: "data",
    spec: ["§7", "UI03", "PF06"],
  },
  "hooks/use-row-selection": {
    title: "Вибір рядків",
    description:
      "useRowSelection(scope): вибір для DataTable і масових дій — окремі записи чи всі за фільтром; інший фільтр чи компанія скидають вибір, сортування й сторінка — ні (ADR-0018).",
    status: "beta",
    demo: "data",
    spec: ["§8.1"],
  },
  "hooks/use-job": {
    title: "Стан фонової задачі",
    description:
      "useJob(id): опитування GET /jobs/:id раз на секунду, поки задача йде (і у фоновій вкладці); збій опитування (зокрема немає відповіді за 10 с) не зупиняє його, isJobPollFailing — чи показувати «перевіряємо знову»; після завершення перечитує дані ресурсу (ADR-0018).",
    status: "beta",
    demo: "data",
    spec: ["PF15", "§8.1"],
  },
  "hooks/use-list-counts": {
    title: "Лічильники вкладок",
    description:
      "useListCounts: скільки записів у кожній вкладці-статусі з поточними фільтрами; запит getList з одним рядком на вкладку, ключі як у ra-core, тож лічильники оновлюються після збереження (ADR-0017).",
    status: "beta",
    demo: "data",
    spec: ["§7"],
  },
  "hooks/use-saved-views": {
    title: "Збережені види: дані",
    description:
      "useSavedViews: особисті види ресурсу з /me/views і зміни в них; зміна одразу в кеші, далі перечитування; після помилки (409) список перечитується; запит видів без повторів, щоб список не чекав (PF11, ADR-0017).",
    status: "beta",
    demo: "data",
    spec: ["PF11"],
  },
  "hooks/use-list-settings": {
    title: "Розмір сторінки: дані",
    description:
      "useRememberedPerPage: розмір сторінки списку з особистих налаштувань /me/list-settings/<ресурс>; список чекає на них, щоб не просити сторінку двічі; вибір діє одразу й зберігається на сервері, помилка — типовий розмір без повідомлення (ADR-0024).",
    status: "beta",
    demo: "organizations",
    spec: ["§7", "PF11"],
  },
  "hooks/use-pin": {
    title: "Закріплення: дані",
    description:
      "usePin: закріпити чи відкріпити запис для себе; поки запит іде — вибраний стан і жодного повтору; далі оголошення для скрінрідера й перечитування ресурсу; межа закріплених і інші помилки — сповіщенням (ADR-0024).",
    status: "beta",
    demo: "organizations",
    spec: ["§7", "§10"],
  },
  "hooks/use-tab-in-view": {
    title: "Активна вкладка у видимій частині",
    description:
      "useTabInView: на вузькому контейнері смуга вкладок прокручується вбік, щоб вибрана вкладка була видна (вкладки-статуси, вкладки Object Page).",
    status: "beta",
    demo: "organizations",
    spec: ["§9"],
  },
  "hooks/use-record-search": {
    title: "Вибір запису: дані",
    description:
      "useRecordSearch: перша сторінка getList ресурсу з пошуком q на сервері, пауза 300 мс після останньої літери, попередні варіанти видно під час нового запиту; useRecordById: запис значення для підпису поля (щойно вибраний — без запиту, видалений — 404) (UI40, ADR-0023).",
    status: "beta",
    demo: "pickers",
    spec: ["UI40"],
  },
  "hooks/use-record-form": {
    title: "Збереження форми запису",
    description:
      "useRecordForm: форма на react-hook-form з налаштуваннями кіта й схемою zod, створення (POST) і зміна (PATCH лише змінених полів з version); конфлікт 409 — порівняння змінених полів (current розбирає схема запису), «Зберегти мої зміни» чи «Взяти збережене»; 422 fieldErrors — біля полів; «Змін немає»; офлайн — одразу помилка; захист від повторної відправки; списки ресурсу перечитуються; toPayload отримує запис, до якого застосовують зміну (після конфлікту — збережений зараз), fieldOfServerError — поле форми для помилки елемента колекції (ADR-0002, ADR-0026, ADR-0028).",
    status: "beta",
    demo: "contacts",
    spec: ["§8.2", "§8.3", "§17"],
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
  "hooks/use-focus-heading": {
    title: "Фокус на h1 після переходу",
    description:
      "useFocusHeadingOnNavigation(heading, location, ready): після переходу між сторінками фокус на заголовку (WCAG 2.4.3) — один раз на перехід, не на першому екрані й не забираючи фокус у людини, що пішла деінде; адресу дає роутер застосунку. Для шаблонів List Report і Object Page. useFocusHeadingOnMount(heading): заголовок на місці зниклого вмісту (стан замість сторінки, екран входу після повтору чи виходу) бере фокус, коли фокус загубився.",
    status: "beta",
    demo: "data",
    spec: ["§10"],
  },
  "hooks/use-tab-counter": {
    title: "Лічильник у вкладці",
    description:
      "useTabCounter(count): «(3) Рахунки» в назві вкладки, повертає лічильник, коли сторінка міняє назву сама (ADR-0046).",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19"],
  },
  "hooks/use-push-sync": {
    title: "Web push у вкладці",
    description:
      "usePushSync(onNavigate): звірка підписки під час запуску, оновлення лічильника з push, перехід за натиснутим сповіщенням (ADR-0046).",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19"],
  },
  "hooks/use-page-heading": {
    title: "h1 сторінки модуля",
    description:
      "usePageHeading(title, ready): фокус на h1 після переходу (useFocusHeadingOnNavigation з адресою React Router) і назва вкладки браузера; зміна мови фокус не чіпає (ADR-0025).",
    status: "beta",
    demo: "contacts",
    spec: ["§10"],
  },
  "hooks/use-card-record": {
    title: "Запис картки модуля",
    description:
      "useCardRecord(resource, id): запис картки (GET /<ресурс>/:id) у компанії користувача — одразу з кешу списку, далі з відповіді; 404 — «не знайдено» сторінки, збій при записі з кешу — помилка секції з повтором, немає мережі — «немає з'єднання» (ADR-0019, ADR-0025).",
    status: "beta",
    demo: "contacts",
    spec: ["§7", "§8.1"],
  },
  "hooks/use-tab-param": {
    title: "Вкладка картки в адресі",
    description:
      "useTabParam(): вибрана вкладка картки модуля в адресі (?tab=) на React Router без нового запису історії; стан переходу лишається для «До списку» (ADR-0024); useSearchParamState(name) — те саме для будь-якого вибору на сторінці, напр. ролі (?role=, ADR-0033).",
    status: "beta",
    demo: "contacts",
    spec: ["§7"],
  },
  "hooks/use-role-draft": {
    title: "Чернетка ролі",
    description:
      "useRoleDraft(role, resources): назва, опис і права ролі, які людина змінює, і збережене на сервері; свіжі дані ролі (після 409 чи збереження) — свої зміни поверх них (rebasePermissions), після «Зберегти» збережене — одразу основа (ADR-0033). Частина erp/role-detail.",
    status: "beta",
    demo: "roles",
    spec: ["A2"],
  },
  "hooks/use-record-access": {
    title: "Дія над записом",
    description:
      "useRecordAccess({ resource, action, record }): право ролі (useCanAccess) і позначка сервера на записі (deniedActions) разом — canAccess, isPending і причина заборони запису текстом для неактивної дії (SPEC §8.4); useRecordDenialReason — причина для комірок списку (ADR-0037).",
    status: "beta",
    demo: "contacts",
    spec: ["§8.4", "§17", "A2"],
  },
  "hooks/use-realtime": {
    title: "Стан і події каналу",
    description:
      "useRealtimeStatus: open означає, що опитувати не треба. useRealtimeEvent: слухати події каналу, поки компонент змонтовано (ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19"],
  },
  "hooks/use-edit-lock": {
    title: "«Редагує …»",
    description:
      "useEditLock({ resource, id }): хто редагує запис, причина для неактивної «Редагувати», acquire перед формою, подовження, поки людина працює, release після (SPEC §8.2, ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19", "§8"],
  },
  "hooks/use-history-refresh": {
    title: "Свіжа історія картки",
    description:
      "useHistoryRefresh(version): журнал «Історія» картки перечитується, коли змінюється версія запису; перша версія після завантаження — не зміна (ADR-0019).",
    status: "beta",
    demo: "contacts",
    spec: ["§7"],
  },
  "hooks/use-extended-list": {
    title: "Список модуля з розширенням",
    description:
      "useExtendedList(columns, filters, tabs, extension, locked): колонки, фільтри й вкладки списку модуля зі змінами файлу розширення проекту — нові з полів розширення, сховати, перемістити, змінити колонку модуля; locked — колонки, яких розширення не ховає (ADR-0020, ADR-0025).",
    status: "beta",
    demo: "contacts",
    spec: ["§7", "§17"],
  },
  "hooks/use-email-link-token": {
    title: "Токен із листа поза адресою",
    description:
      "useEmailLinkToken(screen): токен посилання з листа (новий пароль, запрошення, вхід за посиланням) — з ?token= адреси, далі геть із рядка адреси й записів історії вкладки (запис замінюється); поки екран змонтовано, живе в sessionStorage вкладки, тож оновлення сторінки форму не губить; перехід із екрана в застосунку його стирає, а clearEmailLinkTokens — вхід і екран входу, куди веде кожен вихід. Ставиться над межею помилок екрана. Роутер — через ra-core.",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§10"],
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
      "Відповіді з терміном сесії, сценарії, ковзна сесія, користувачі моків, «надіслані» SMS і листи, маскування адрес, пачка змін (стан у localStorage — раз на партію масової дії).",
    status: "beta",
    demo: "data",
    spec: ["§17"],
  },
  "lib/mock-scope": {
    title: "Чиї дані й події в моках",
    description:
      "Компанія запиту бачить свої й спільні записи, події своєї компанії, облікових записів своїх людей і застосунку; підписки й токени — лише свої; спільне в застосунку з компаніями змінює лише адміністратор платформи (ADR-0036); mockDeniedActions і withMockDeniedActions — позначка заборон запису для того, хто питає (ADR-0037); «свої» записи й правила проекту: mockGrantsRecords, mockSeesRecord, mockDeniedAction; mockGrantsService — службове право лише «Усі» (ADR-0038).",
    status: "beta",
    demo: "data",
    spec: ["A2", "§17"],
  },
  "lib/mock-responsible": {
    title: "Відповідальний у моках",
    description:
      "Автор під час створення й перевірка, кому можна передати запис: людина компанії запису, активна, з правом бачити ресурс (ADR-0039).",
    status: "beta",
    demo: "data",
    spec: ["A2", "§17"],
  },
  "lib/mock-catalog-check": {
    title: "Звірка прав моків із каталогом",
    description:
      "Попередження в консолі про право поза каталогом у початкових ролях, MockUser.permissions і ролях із localStorage (ADR-0039).",
    status: "beta",
    demo: "data",
    spec: ["A2", "§17"],
  },
  "lib/mock-auth": {
    title: "Мок входу",
    description:
      "Усі способи входу з контракту lib/auth: коди, без пароля, ключ доступу, SSO, відновлення, запрошення, реєстрація, довірений пристрій, «не бот», GDPR.",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§17"],
  },
  "lib/mock-sign-in-flow": {
    title: "Кроки входу в моках",
    description:
      "Спільне для моків входу: пошук облікового запису, «не бот», коди й посилання з листа, крок коду, другий фактор, довірений пристрій, політика безпеки, заблокований акаунт, повторне підтвердження (частина lib/mock-auth).",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§17"],
  },
  "lib/mock-sign-up": {
    title: "Мок відновлення пароля, запрошень і реєстрації",
    description:
      "Лист зі скиданням пароля, перевірка й прийняття запрошення (токен у тілі, застарілий GET — для сервера без POST), реєстрація з кодом із листа (частина lib/mock-auth).",
    status: "beta",
    demo: "login",
    spec: ["PF01", "§17"],
  },
  "lib/mock-me": {
    title: "Мок профілю /me",
    description:
      "Профіль із правами, ковзна сесія, повторне підтвердження, зміна email і пароля, експорт і видалення даних, вихід, вподобання PF11 (частина lib/mock-auth).",
    status: "beta",
    demo: "login",
    spec: ["PF01", "PF11", "§17"],
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
  "lib/value-diff": {
    title: "Різниця значень",
    description:
      "diffText (за словами, з межею на довжину), diffList (за елементами), diffAuditValues — чистий розрахунок для «було → стало» (ADR-0045).",
    status: "beta",
    demo: "audit",
    spec: ["A5", "PF05"],
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
      "Контракт ролей (назва, опис, вбудована, права <ресурс>:<дія>), каталог прав із сервера, ролі користувача; grants і togglePermission для матриці; «стеля» — canGrant, canChangePermissions, canChangeRoles, impersonationBlock (ADR-0032); «Свої / Усі» — право <ресурс>:<дія>:own, permissionScope, setPermissionScope, canChangeScope, isCatalogPermission (ADR-0038) — provider.roles.",
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
  "lib/invite-check": {
    title: "Перевірка запрошення",
    description:
      "inviteChecker: POST /auth/invite/check з токеном у тілі (не в адресі й журналах); сервер без маршруту — застарілий GET /auth/invite?token= до 2.0, спосіб запам'ятовується (ADR-0032).",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "lib/notifications": {
    title: "Центр сповіщень",
    description:
      "Контракт сповіщень у застосунку: список із фільтром непрочитаних, лічильник для дзвіника, позначки прочитаного, «Прочитати все» — provider.inbox; підписка push — provider.inbox.push.",
    status: "beta",
    demo: "inbox",
    spec: ["PF10", "UI02"],
  },
  "lib/web-push": {
    title: "Web push: контракт",
    description:
      "Контракт підписки пристрою: відкритий ключ, збереження й вилучення підписки, перевірочний push, формат push від сервера, повтори (ADR-0046).",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19"],
  },
  "lib/push-device": {
    title: "Web push у браузері",
    description:
      "Дозвіл браузера лише з натискання, фоновий файл у власній області, підписка, звірка під час запуску, скасування під час явного виходу (ADR-0046).",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19"],
  },
  "lib/mock-push": {
    title: "Мок підписки push",
    description:
      "Підписки кожного користувача в localStorage, відкритий ключ, перевірочний push через реєстрацію фонового файла; сценарії ресурсу notifications (ADR-0046).",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19", "§17"],
  },
  "lib/sse": {
    title: "Розбір потоку SSE",
    description:
      "createSseParser і readSseBody: рядки, поля, коментар-серцебиття, обрив посеред рядка чи літери UTF-8 (WHATWG, ADR-0051). Канал читає потік через fetch, а не EventSource.",
    status: "beta",
    demo: "realtime",
    spec: ["PF19"],
  },
  "lib/realtime": {
    title: "Канал реального часу",
    description:
      "Контракт GET /events, createRealtimeChannel (перепідключення з паузою до 30 с, серцебиття, Last-Event-ID), connectRealtime: одна вкладка на людину й компанію (Web Locks, BroadcastChannel), стан і підписка для застосунку (ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19", "§17"],
  },
  "lib/realtime-cache": {
    title: "Кеш за подіями каналу",
    description:
      "syncRealtimeCache: зміна запису на сервері перечитує відкриті списки й картки ресурсу, не частіше ніж раз на секунду; після обриву — усе видиме (ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19"],
  },
  "lib/edit-lock": {
    title: "Блокування на час редагування",
    description:
      "Контракт GET, PUT, DELETE /<ресурс>/<id>/lock і подія <ресурс>.locked: хто редагує запис, термін дії, подовження (SPEC §8.2, ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19", "§8"],
  },
  "lib/mock-realtime": {
    title: "Мок каналу й блокувань",
    description:
      "createRealtimeHandlers: потік SSE із шини мок-сервера, блокування записів; setMockEditLock і dropMockRealtimeStream для колеги й обриву в демо (ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19", "§17"],
  },
  "lib/i18n-uk-realtime": {
    title: "Рядки реального часу українською",
    description:
      "Рядки «Редагує …» (ADR-0051): окремий файл, простір імен erp-ui той самий.",
    status: "beta",
    demo: "realtime",
    spec: ["PF19", "§11"],
  },
  "lib/i18n-en-realtime": {
    title: "Рядки реального часу англійською",
    description:
      "Ті самі рядки «Редагує …» англійською; парність ключів перевіряє тип.",
    status: "beta",
    demo: "realtime",
    spec: ["PF19", "§11"],
  },
  "lib/i18n-uk-push": {
    title: "Рядки push українською",
    description:
      "Рядки блоку «Push на цьому пристрої» (ADR-0046): окремий файл простору імен erp-ui.",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19", "§11"],
  },
  "lib/i18n-en-push": {
    title: "Рядки push англійською",
    description:
      "Ті самі рядки блоку «Push на цьому пристрої» англійською; паритет ключів перевіряє тест.",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19", "§11"],
  },
  "lib/saved-views": {
    title: "Збережені види: контракт",
    description:
      "Особисті види списків (PF11): CRUD /me/views (ресурс ra-core me/views), схема виду, параметри списку рядком, вид за замовчуванням, унікальна назва (ADR-0017).",
    status: "beta",
    demo: "data",
    spec: ["UI03", "PF06", "PF11", "§17"],
  },
  "lib/record-access": {
    title: "Права на рівні запису: контракт",
    description:
      "Позначка сервера на записі deniedActions { <дія>: <код причини> } у списку, картці, відповідях POST і PATCH і current 409: що з цим записом не можна тому, хто питає; немає поля — діють права ролі. recordDenial(record, action), коди причин зі своїм текстом кіта (shared — спільний запис); сервер однаково перевіряє кожен запит (ADR-0037).",
    status: "beta",
    demo: "contacts",
    spec: ["§8.4", "§17", "A2"],
  },
  "lib/pins": {
    title: "Закріплення записів: контракт",
    description:
      "PUT і DELETE /<ресурс>/:id/pin (ідемпотентні, право на читання), pinned: true у списку й записі, закріплені — першим блоком у порядку закріплення поверх сортування, total не змінюється; межа 50 на ресурс — 422 pin_limit; pinnedFirst для моків і серверів на TypeScript (ADR-0024).",
    status: "beta",
    demo: "organizations",
    spec: ["§7", "§17"],
  },
  "lib/statuses": {
    title: "Статуси запису модуля",
    description:
      "Статуси з точкою розширення (ADR-0020): модуль має свої, розширення проекту додає нові (mockEvery — для фікстур), змінює підпис, тон чи іконку без заміни (change) чи ховає з вибору; схований лишається дійсним у схемі й на бейджі. statusSchema — ключі для zod, useResolvedStatuses — підписи мовою інтерфейсу для вкладок і бейджа; тон — колір і іконка лише з токенів (ADR-0025).",
    status: "beta",
    demo: "contacts",
    spec: ["§6.3", "§17"],
  },
  "lib/list-settings": {
    title: "Налаштування списків: контракт",
    description:
      "GET і PATCH /me/list-settings/<ресурс> → { perPage } (null — нічого не збережено), розміри сторінки на вибір 10, 20, 50, 100; особисті, як і збережені види (ADR-0024).",
    status: "beta",
    demo: "organizations",
    spec: ["§7", "§17", "PF11"],
  },
  "lib/jobs": {
    title: "Масові дії й фонові задачі: контракт",
    description:
      "POST /<ресурс>/bulk/<дія> з вибором → 202 { jobId }, GET /jobs/:id (прогрес, невдачі групами за причиною), POST /jobs/:id/retry для невдач, які можна повторити; zod-схеми, опитування раз на секунду з межею часу відповіді 10 с (основа PF15, ADR-0018).",
    status: "beta",
    demo: "data",
    spec: ["PF15", "§8.1", "§17"],
  },
  "lib/spreadsheet": {
    title: "Читання й запис таблиць",
    description:
      "Єдине місце, де кіт торкається hucre (лінивий чанк, SPEC §20 №2, ADR-0049): readSpreadsheet (.xlsx, .csv, UTF-8, UTF-16, windows-1251, приховані аркуші не читаються, межі файла й рядків, SpreadsheetError з кодом), writeSpreadsheet (типи клітинок, захист від формул, заголовок закріплено), saveFile.",
    status: "beta",
    demo: "importExport",
    spec: ["PF07", "UI11"],
  },
  "lib/imports": {
    title: "Імпорт: контракт",
    description:
      "POST /<ресурс>/import/check (перевірка без запису: що станеться з кожним рядком) і POST /<ресурс>/import → 202 { jobId } (фонова задача ADR-0018), requestId для ідемпотентності, межі рядків і колонок, zod-схеми (ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07", "§17"],
  },
  "lib/import-rows": {
    title: "Імпорт: рядки файла",
    description:
      "Чисті функції імпорту: ImportField і ImportTarget, зіставлення колонок за назвами, розбір клітинок за типом (число, дата, так/ні, перелік, свій parse), рядки контракту, об'єднання перевірки браузера й сервера, файл помилок, шаблон (ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07"],
  },
  "lib/exports": {
    title: "Експорт: збір записів",
    description:
      "collectRecords проходить сторінки GET /<ресурс> послідовно до межі EXPORT_MAX_ROWS (ExportLimitError, а не обрізаний файл), exportRows будує рядки за вибраними колонками ExportColumn (ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07"],
  },
  "lib/mock-imports": {
    title: "Мок імпорту",
    description:
      "createImportHandlers: перевірка без запису й застосування фоновою задачею lib/mock-jobs, збіг за полем, ідемпотентність requestId, сценарії ресурсу, права create і update (ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07", "§17"],
  },
  "lib/i18n-uk-import": {
    title: "Рядки імпорту й експорту uk",
    description:
      "Рядки вибору файла, майстра імпорту й діалогу експорту українською (ADR-0049): окремий файл простору імен erp-ui.",
    status: "beta",
    demo: "importExport",
    spec: ["§11", "PF07", "UI11"],
  },
  "lib/i18n-en-import": {
    title: "Рядки імпорту й експорту en",
    description: "Ті самі рядки англійською; паритет ключів перевіряє тест.",
    status: "beta",
    demo: "importExport",
    spec: ["§11", "PF07", "UI11"],
  },
  "hooks/use-import-downloads": {
    title: "useImportDownloads",
    description:
      "Текст помилки рядка імпорту, файл-шаблон і файл помилок, який людина править і завантажує знову.",
    status: "beta",
    demo: "importExport",
    spec: ["PF07"],
  },
  "hooks/use-import-wizard": {
    title: "useImportWizard",
    description:
      "Стан майстра імпорту: читання файла й аркуші, зіставлення колонок, перевірка сервера, запуск задачі, файл помилок і шаблон; useImportErrorText — текст помилки рядка (ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07"],
  },
  "erp/file-drop": {
    title: "Вибір файла",
    description:
      "FileDrop (частина UI11): перетягування або кнопка, перевірка типу й розміру біля поля, один файл, «Прибрати» з поверненням фокуса; matchesAccept (ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["UI11", "§8.3", "§9", "§10"],
  },
  "erp/import-wizard": {
    title: "Майстер імпорту",
    description:
      "ImportWizard на templates/wizard: файл, колонки, перевірка, перегляд, звіт; поля й дії задає ImportTarget (PF07, ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07", "UI06", "§8.2", "§9", "§10"],
  },
  "erp/import-review": {
    title: "Кроки майстра імпорту після перевірки",
    description:
      "ImportCheckStep (лічильники, рядки з помилками, файл помилок), ImportPreviewStep (перші записи), ImportReportStep (прогрес, підсумок, причини невдач, повтор на частинах erp/job-progress) (ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07", "§8.1"],
  },
  "hooks/use-export-run": {
    title: "useExportRun",
    description:
      "Збір файла експорту зі сторінок списку: прогрес, скасування, причина збою, збереження файла.",
    status: "beta",
    demo: "importExport",
    spec: ["PF07"],
  },
  "erp/export-dialog": {
    title: "Діалог експорту",
    description:
      "ExportDialog: вибрані чи всі за фільтром, .xlsx чи .csv, колонки, прогрес збору, скасування, межа рядків із поясненням (PF07, ADR-0049).",
    status: "beta",
    demo: "importExport",
    spec: ["PF07", "§8.2", "§9", "§10"],
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
      "Ролі й призначення в localStorage, ролі — компанії запиту (лічильник людей і 409 — лише її люди), права користувача — сума прав його ролей у компанії, ролями й запрошеннями керують лише в своїй компанії; сценарії ресурсу roles (conflict — перша зміна ролі компанії 409); обробники запрошень — з lib/mock-invitations.",
    status: "beta",
    demo: "roles",
    spec: ["A2", "§17"],
  },
  "lib/mock-invitations": {
    title: "Мок запрошень колег",
    description:
      "Запрошення лише в компанії запиту: список, надсилання з листом-посиланням, повтор від імені того, хто повторив, відкликання; «стеля» повтору й відкликання (403), сценарії ресурсу invitations (conflict — 409 раз на запрошення); частина lib/mock-team (ADR-0035).",
    status: "beta",
    demo: "users",
    spec: ["A2", "§17"],
  },
  "lib/mock-invitation-store": {
    title: "Сховище запрошень у моках",
    description:
      "Запрошення в localStorage, перевірка й прийняття для мока входу — лише поки той, хто запросив, досі може дати ролі запрошення (інакше 410), сповіщення тому, хто запрошував (ADR-0035).",
    status: "beta",
    demo: "users",
    spec: ["A2", "§17"],
  },
  "lib/mock-membership": {
    title: "Вилучення з компанії в моках",
    description:
      "POST /users/:id/remove-from-company зі сценаріями, стелею лише в компанії запиту й паролем ще раз; canRemoveMember для GET /users/:id/access.",
    status: "beta",
    demo: "users",
    spec: ["A2", "§17"],
  },
  "lib/mock-company-roles": {
    title: "Ролі компанії в моках",
    description:
      "Ролі проекту є в кожній компанії, зміна чи видалення — копією лише в своїй, нова роль — компанії, де її створили; ролі людини свої в кожній її компанії, права — за ролями в компанії (mockPermissionsIn); стан у localStorage з перевіркою прочитаного, люди компанії з роллю, конфлікт сценарію conflict раз на роль компанії (ADR-0033).",
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
  "lib/mock-views": {
    title: "Мок збережених видів",
    description:
      "createSavedViewHandlers: /me/views за контрактом lib/saved-views, види кожного користувача в localStorage, сценарії ресурсу views.",
    status: "beta",
    demo: "data",
    spec: ["PF11", "§17"],
  },
  "lib/mock-lists": {
    title: "Мок закріплення й налаштувань списків",
    description:
      "Закріплення (createResourceHandlers з pins: true) і createListSettingsHandlers за контрактами lib/pins і lib/list-settings; усе — для кожного користувача в localStorage; сценарії ресурсу list-settings (ADR-0024).",
    status: "beta",
    demo: "organizations",
    spec: ["§17"],
  },
  "lib/mock-jobs": {
    title: "Мок масових дій і задач",
    description:
      "createBulkHandlers (дії ресурсу над записами: зміни чи відмова з кодом, повтор) і createJobHandlers (GET /jobs/:id, повтор): задача обробляє записи з часом, зміни йдуть через db.patch; сценарії ресурсу й jobs (ADR-0018).",
    status: "beta",
    demo: "data",
    spec: ["PF15", "§17"],
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
  "lib/mock-account-state": {
    title: "Стан акаунта в моках",
    description:
      "Дані акаунта кожного користувача в localStorage, сесії й журнал входів, лист про новий вхід, перевірка зміни безпеки (частина lib/mock-account).",
    status: "beta",
    demo: "security",
    spec: ["PF01", "§17"],
  },
  "lib/mock-factors": {
    title: "Мок другого кроку акаунта",
    description:
      "/me/security, налаштування застосунку, SMS, email і ключа доступу, перейменування й видалення факторів, резервні коди (частина lib/mock-account).",
    status: "beta",
    demo: "security",
    spec: ["PF01", "§17"],
  },
  "lib/mock-impersonation": {
    title: "Мок «Увійти як…»",
    description:
      "Початок і завершення роботи від імені людини компанії запиту з причиною, повторним підтвердженням, «стелею» прав і записом у журнали (частина lib/mock-account).",
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
      "Сайдбар із групами (десктоп), вузька панель з іконками (планшет), нижня панель + «Ще» (телефон), топбар із хлібними крихтами (остання з href — посилання, напр. список над карткою), «Перейти до вмісту».",
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
  "erp/shortcut-keys": {
    title: "Клавіші поєднання",
    description:
      "Клавіші запису реєстру: символи на екрані, слова для скрінрідера, ⌘ на Mac і Ctrl деінде.",
    status: "beta",
    demo: "shortcuts",
    spec: ["PF06", "§10"],
  },
  "erp/stepper": {
    title: "Степер",
    description:
      "Кроки сценарію: у ряд на широкому контейнері, «Крок 2 з 4» зі смугою на вузькому; виконаний крок, крок із помилкою, перехід на відкритий крок (ADR-0043).",
    status: "beta",
    demo: "wizard",
    spec: ["UI06", "§9", "§10"],
  },
  "erp/shortcuts-help": {
    title: "Довідка гарячих клавіш",
    description:
      "Діалог за клавішею «?» і командою палітри: усі клавіші з реєстру, клавіші проекту окремою групою, перемикач «?». Список вантажиться при відкритті (ADR-0042).",
    status: "beta",
    demo: "shortcuts",
    spec: ["PF06", "§10"],
  },
  "erp/shortcuts-help-list": {
    title: "Перелік гарячих клавіш",
    description:
      "Групи клавіш і перемикач «?»; одна колонка у вузькому контейнері, дві в широкому. Окремий файл, щоб довідка вантажила його лише при відкритті. Ставиться разом з erp/shortcuts-help.",
    status: "beta",
    demo: "shortcuts",
    spec: ["PF06", "§9", "§10"],
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
      "Порожньо вперше, нічого не знайдено, помилка з повтором, немає доступу, офлайн, не знайдено; рівень заголовка (h1 — стан замість сторінки, h3 — секції); стан замість сторінки бере фокус на h1, коли фокус загубився (WCAG 2.4.3); PageStateMain — <main> для стану поза оболонкою; PageSkeleton для завантаження; LoadingFallback для лінивих частин (оголошення через постійний live-регіон після 1 с).",
    status: "beta",
    demo: "states",
    spec: ["§8.1", "§8.2"],
  },
  "erp/data-table": {
    title: "Таблиця даних",
    description:
      "DataTable на TanStack Table 9 + Virtual: 10 000 рядків вікнами з сервера (useWindowedList) або сторінка з пагінацією; колонки з пріоритетом і поведінкою на вузькому контейнері, липкі шапка й колонка, грід W3C APG, картки на телефоні, стани SPEC §8.1, рядок стану з live-регіоном і «Оновлено о…» (ADR-0016); вибір рядків «сторінка / усе» з масовими діями (ADR-0018); закріплені рядки позначені, межа після останнього (ADR-0024).",
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
  "erp/data-table-pager": {
    title: "Пагінація таблиці",
    description:
      "Частина erp/data-table: сторінки малого списку — «1–50 з 240», попередня й наступна, «Рядків на сторінці»; сторінка за межами списку (записи видалили) — перехід на останню. Ставиться разом з erp/data-table.",
    status: "beta",
    demo: "data",
    spec: ["§7", "§8.1"],
  },
  "erp/record-header": {
    title: "Шапка запису",
    description:
      "RecordHeader: назва запису як заголовок сторінки, статус, ключові поля й дії (на вузькому контейнері дії під назвою, поля у дві колонки); RecordStatusBar — етапи життєвого циклу з поточним (SPEC §7 Object Page, ADR-0019).",
    status: "beta",
    demo: "data",
    spec: ["§7", "§9", "§10"],
  },
  "templates/wizard": {
    title: "Майстер (Wizard)",
    description:
      "Шаблон покрокового сценарію: степер, кроки з перевіркою чи збереженням, фокус на заголовку кроку, помилка з повтором, фінальний огляд лише для читання (WizardReview), кнопка з наслідком (ADR-0043).",
    status: "beta",
    demo: "wizard",
    spec: ["§7", "§8.2", "§8.3", "§9", "§10", "UI06"],
  },
  "templates/object-page": {
    title: "Картка запису (Object Page)",
    description:
      "Шаблон картки: «Назад до списку», шапка (назва, статус, ключові поля й дії), етапи, секції й стрічка запису (UI01) праворуч чи вкладкою за шириною контейнера; скелетон, помилка з повтором, офлайн, немає доступу, не знайдено. Поля, дії й секції — списки з ключами; секції й дії розширення — компоненти проекту в слотах (useRecordSlots): запис і ресурс, своя межа помилок, дія з правом; секції одна під одною чи вкладками з вибраною в адресі (templates/object-page-tabs) (SPEC §7, ADR-0019, ADR-0020, ADR-0024).",
    status: "beta",
    demo: "data",
    spec: ["§7", "§8.1", "§9", "§10", "§18.1"],
  },
  "templates/object-page-tabs": {
    title: "Вкладки картки запису",
    description:
      "Частина templates/object-page: секції вкладками за W3C APG Tabs (вибір Enter чи пробілом), вибрана — ззовні (адреса ?tab=), невідомий ключ — перша; змонтована лише вибрана вкладка, лінивий вміст — скелетон секції; на вузькому контейнері стрічка запису — остання вкладка. Ставиться разом із templates/object-page (ADR-0024).",
    status: "beta",
    demo: "organizations",
    spec: ["§7", "§9", "§10"],
  },
  "templates/list-report": {
    title: "Список (List Report)",
    description:
      "Шаблон списку: заголовок і дії, вкладки-статуси з лічильниками, FilterBar із чипами, збережені види, панель масових дій, таблиця з картками на телефоні — прокрутка вікнами по 100 чи сторінки; стан в адресі (useListReport); закріплені записи першим блоком (isPinned), запам'ятаний розмір сторінки. Колонки, фільтри, вкладки й дії — списки з ключами для розширень модуля (SPEC §7, ADR-0020, ADR-0022, ADR-0024).",
    status: "beta",
    demo: "data",
    spec: ["§7", "§8.1", "§9", "§10", "§18.1"],
  },
  "templates/list-report-tables": {
    title: "Таблиці списку",
    description:
      "Частина templates/list-report: джерела рядків — вікнами по 100 з сервера чи сторінками з «Рядків на сторінці»; новий фільтр, сортування, компанія чи розмір — з першої сторінки, поки вантажиться нова сторінка, видно попередню з її номером і діапазоном. Ставиться разом із templates/list-report.",
    status: "beta",
    demo: "organizations",
    spec: ["§7", "§8.1"],
  },
  "erp/status-tabs": {
    title: "Вкладки-статуси",
    description:
      "Вкладки списку з лічильниками (List Report): вкладка — фільтр поверх фільтрів панелі, вибір Enter чи пробілом, прокрутка вбік на вузькому контейнері (ADR-0017).",
    status: "beta",
    demo: "data",
    spec: ["§7", "§9", "§10"],
  },
  "erp/pin-toggle": {
    title: "Закріпити вгорі",
    description:
      "PinToggle: перемикач aria-pressed у рядку списку (іконка з назвою запису) чи в шапці картки (з підписом); фокус іде за записом на нове місце; usePinColumn — колонка для List Report з ключем pin: перша й липка, на телефоні — дія картки (ADR-0024).",
    status: "beta",
    demo: "organizations",
    spec: ["§7", "§9", "§10"],
  },
  "erp/status-badge": {
    title: "Бейдж статусу",
    description:
      "StatusBadge: статус запису модуля (lib/statuses) — іконка, підпис і колір тону (soft-тло, SPEC §6.3); невідомий ключ від сервера — ключ текстом у нейтральному бейджі.",
    status: "beta",
    demo: "contacts",
    spec: ["§6.3", "§10"],
  },
  "erp/filter-bar": {
    title: "Панель фільтрів",
    description:
      "FilterBar: пошук із паузою, «Фільтри» з лічильником (поповер на широкому контейнері, нижня шторка на телефоні), чипи активних фільтрів із «Прибрати» й «Скинути фільтри» (фільтр за записом — назвою з сервера), місце для меню видів (UI03, ADR-0017, ADR-0030).",
    status: "beta",
    demo: "data",
    spec: ["UI03", "UI38", "§7", "§9", "§10"],
  },
  "erp/filter-panel": {
    title: "Форма фільтрів",
    description:
      "Частина erp/filter-bar: поля за описом фільтрів (варіанти, період, діапазон суми, запис із довідника — вибір із пошуком на сервері), «Застосувати» одним запитом, помилка діапазону біля поля. Ставиться разом з erp/filter-bar.",
    status: "beta",
    demo: "data",
    spec: ["UI03", "§8.3"],
  },
  "erp/saved-views-menu": {
    title: "Збережені види",
    description:
      "SavedViewsMenu: особисті види списку (вкладка, фільтри, пошук, сортування), «змінено», зберегти, зберегти як новий, перейменувати, вид за замовчуванням, видалення зі «Скасувати» (UI03, PF11, ADR-0017).",
    status: "beta",
    demo: "data",
    spec: ["UI03", "PF06", "PF11", "§8.2"],
  },
  "erp/saved-view-dialog": {
    title: "Діалог назви виду",
    description:
      "Частина erp/saved-views-menu: новий вид чи перейменування на react-hook-form + zod, «Відкривати за замовчуванням», назва, яка вже є, — помилка біля поля. Ставиться разом з erp/saved-views-menu.",
    status: "beta",
    demo: "data",
    spec: ["UI03", "§8.3"],
  },
  "erp/data-table-selection": {
    title: "Вибір рядків у таблиці",
    description:
      "Частина erp/data-table: липка колонка прапорців (у картках — перед назвою), «вибрати все» — сторінку чи всі за фільтром, панель вибраного в рядку стану з лічильником, «Вибрати всі N», масовими діями й «Зняти вибір» (SPEC §7 BulkActionBar, ADR-0018). Ставиться разом з erp/data-table.",
    status: "beta",
    demo: "data",
    spec: ["§7", "§8.1", "§10"],
  },
  "erp/job-progress": {
    title: "Прогрес масової дії",
    description:
      "showJobProgress: сповіщення з прогрес-баром, що живе поза сторінкою; підсумок, «Подробиці» з причинами невдач групами й «Повторити (N)»; число прогресу не звучить щосекунди (ADR-0018).",
    status: "beta",
    demo: "data",
    spec: ["PF15", "§8.1", "§8.2"],
  },
  "erp/job-failures": {
    title: "Невдачі масової дії",
    description:
      "Частина erp/job-progress: діалог «Подробиці» з причинами невдач групами, кількістю й першими записами та «Повторити (N)»; невдачі повтору й попередніх задач — одна група на причину (ADR-0018). Ставиться разом з erp/job-progress.",
    status: "beta",
    demo: "data",
    spec: ["PF15", "§8.1"],
  },
  "erp/editable-cell": {
    title: "Редагування в комірці",
    description:
      "EditableCell: значення-кнопка, Enter/F2/клік — поле в комірці, Enter зберігає, Escape скасовує; помилка під полем; оптимістично через useOptimistic, відкат із поясненням і «Повторити», конфлікт — своїм обробником (SPEC §8.1 стан 16, ADR-0018).",
    status: "beta",
    demo: "data",
    spec: ["§8.1", "§8.2", "§10"],
  },
  "erp/error-boundary": {
    title: "Межа помилок",
    description:
      "Помилка рендеру чи чанк, що не завантажився, — стан «Не вдалося завантажити» з «Спробувати ще» замість білого екрана; без мережі — «Немає з'єднання»; власний вигляд для тісних місць; рамка навколо стану помилки (`frame`: діалог лінивої форми); після невдалого повтору фокус — на заголовку нового стану (WCAG 2.4.3).",
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
      "«Забули пароль?», новий пароль за посиланням, прийняття запрошення (адреса з обліковим записом — erp/invite-account, ADR-0040), вхід за посиланням із листа, повернення з SSO.",
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
  "erp/realtime-sync": {
    title: "Канал подій застосунку",
    description:
      "RealtimeSync: вмикає канал подій для людини, що увійшла, оновлює кеш за подіями, перемикається разом із компанією; нічого не показує (ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19"],
  },
  "erp/edit-lock-notice": {
    title: "Смуга «Редагує …»",
    description:
      "EditLockNotice: смуга на картці, поки запис редагує інша людина; живий текст для скрінрідера (SPEC §8.2, ADR-0051).",
    status: "beta",
    demo: "realtime",
    spec: ["PF19", "§8"],
  },
  "lib/rich-text": {
    title: "Оформлений текст: формат",
    description:
      "Документ JSON замість HTML (UI12, ADR-0052): toRichText для чужих даних (рядок стає абзацами, невідомий вузол лишає текст, межі глибини й вузлів), safeLinkHref, richTextSchema, richTextToPlain, richTextMentions, isRichTextEmpty. Без редактора й без React.",
    status: "beta",
    demo: "richText",
    spec: ["UI12", "PF05"],
  },
  "lib/i18n-uk-rich-text": {
    title: "Рядки поля тексту українською",
    description:
      "Рядки кнопок, посилання й згадок (ADR-0052): окремий файл, простір імен erp-ui той самий.",
    status: "beta",
    demo: "richText",
    spec: ["UI12", "§11"],
  },
  "lib/i18n-en-rich-text": {
    title: "Рядки поля тексту англійською",
    description:
      "Ті самі рядки поля тексту англійською; парність ключів перевіряє тип.",
    status: "beta",
    demo: "richText",
    spec: ["UI12", "§11"],
  },
  "lib/mention-menu": {
    title: "Список згадок: стан",
    description:
      "Контролер списку під курсором поза React (ADR-0052): запит із паузою й скасуванням, індикатор після 1 с, помилка з повтором, клавіші. Tiptap не потрібен.",
    status: "beta",
    demo: "richText",
    spec: ["UI12"],
  },
  "hooks/use-mention-search": {
    title: "Пошук колег для згадки",
    description:
      "useMentionSearch: довідник users, який бачить кожен у компанії (ADR-0030, ADR-0052); заблокованих прибирає браузер.",
    status: "beta",
    demo: "richText",
    spec: ["UI12"],
  },
  "erp/rich-text-view": {
    title: "Показ оформленого тексту",
    description:
      "RichTextView: збережений текст без редактора й без HTML, лише елементи з дозволених вузлів; простий рядок, порожнє значення, renderMention (UI12, ADR-0052).",
    status: "beta",
    demo: "richText",
    spec: ["UI12", "§8", "§10"],
  },
  "erp/rich-text-styles": {
    title: "Вигляд оформленого тексту",
    description:
      "Спільні класи показу й редактора: текст, згадка, рамка, стани (ADR-0052). Без React і Tiptap.",
    status: "beta",
    demo: "richText",
    spec: ["UI12"],
  },
  "erp/rich-text-mentions": {
    title: "Список згадок під курсором",
    description:
      "RichTextMentions: спливний список Base UI, фокус лишається в тексті, aria-activedescendant, стани пошуку (ADR-0052). Частина лінивого чанка.",
    status: "beta",
    demo: "richText",
    spec: ["UI12", "§10"],
  },
  "erp/rich-text-toolbar": {
    title: "Кнопки оформлення тексту",
    description:
      "RichTextToolbar: Base UI Toolbar, форматування, посилання у спливному вікні, кнопка згадки (ADR-0052). Частина лінивого чанка.",
    status: "beta",
    demo: "richText",
    spec: ["UI12", "§10"],
  },
  "erp/rich-text-editor": {
    title: "Редактор тексту",
    description:
      "RichTextEditor на Tiptap 3: лінивий чанк, напряму його не підключають, лише через erp/rich-text-field (ADR-0052).",
    status: "beta",
    demo: "richText",
    spec: ["UI12"],
  },
  "erp/rich-text-field": {
    title: "Поле оформленого тексту",
    description:
      "RichTextField: лінивий чанк Tiptap 3, кнопки оформлення, посилання, згадки колег, лише читання й вимкнено без редактора, завантаження, збій чанка з повтором, preloadRichTextEditor (UI12, ADR-0052).",
    status: "beta",
    demo: "richText",
    spec: ["UI12", "§8", "§9", "§10"],
  },
  "erp/session-guard": {
    title: "Охорона сесії",
    description:
      "Попередження з відліком перед кінцем сесії чи автовиходом через бездіяльність (політика сервера з GET /auth/methods), «Продовжити роботу», вихід у всіх вкладках.",
    status: "beta",
    demo: "security",
    spec: ["PF01"],
  },
  "erp/app-gate": {
    title: "Брама сесії",
    description:
      "SessionGate — частина застосунку лише для тих, хто увійшов: гість — на вхід із поверненням, спінер, поки сесія перевіряється, помилка профілю з повтором (h1), далі вміст і SessionGuard; useSignOut — вихід із повідомленням «Ви вийшли» чи помилкою (ADR-0029).",
    status: "beta",
    demo: "states",
    spec: ["PF01", "§8.1"],
  },
  "erp/auth-routes": {
    title: "Маршрути екранів входу",
    description:
      "createAuthRoutes — маршрути React Router для входу, відновлення пароля, нового пароля, запрошення, входу за посиланням, реєстрації й повернення з SSO; екрани лінивими чанками, preload за адресою (ADR-0029).",
    status: "beta",
    demo: "login",
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
  "erp/currency-select": {
    title: "Вибір валюти",
    description:
      "Пошук валюти ISO 4217 за кодом і назвою мовою інтерфейсу; перелік з браузера, зайняті коди можна прибрати (ADR-0043).",
    status: "beta",
    demo: "companyModule",
    spec: ["PF02", "§11"],
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
      "AuditLog: пошук, розділ, період, подробиці («було → стало», причина, пристрій), експорт CSV; filter — історія одного запису; expanded, onAllHistory, onRecordHistory — для шухляди історії (ADR-0045).",
    status: "beta",
    demo: "audit",
    spec: ["A5", "PF01"],
  },
  "erp/audit-changes": {
    title: "Що змінилося",
    description:
      "AuditChanges: рядки «Було» і «Стало» одне під одним, змінені слова виділено (ADR-0045).",
    status: "beta",
    demo: "audit",
    spec: ["A5", "PF05"],
  },
  "erp/record-history": {
    title: "Шухляда історії запису",
    description:
      "RecordHistory: блок «Історія» на картці з кнопкою «Уся історія»; useRecordHistorySheet: шухляда з усіма змінами запису й різницею значень, своя кнопка чи рядок журналу (ADR-0045).",
    status: "beta",
    demo: "organizations",
    spec: ["A5", "PF05"],
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
      "NotificationSettingsForm: матриця подій і каналів (на телефоні — картки), обов'язкові сповіщення безпеки, тихі години, push на цьому пристрої.",
    status: "beta",
    demo: "notifications",
    spec: ["PF10"],
  },
  "erp/push-device-section": {
    title: "Push на цьому пристрої",
    description:
      "PushDeviceSection: увімкнути й вимкнути push на пристрої, надіслати перевірку; браузер без push чи із забороною пояснює, що робити, бекенд без адрес push блоку не має; разом іде фоновий файл public/erp-ui-push-sw.js (ADR-0046).",
    status: "beta",
    demo: "notificationsModule",
    spec: ["PF19"],
    // Лише в public/ проекту, інакше браузер його не зареєструє.
    files: [
      {
        path: "registry/public/erp-ui-push-sw.js",
        target: "~/public/erp-ui-push-sw.js",
      },
    ],
  },
  "erp/permission-gate": {
    title: "Перевірка права",
    description:
      "PermissionGate: вміст лише з правом <ресурс>:<дія> (ADR-0003) і коли запис не забороняє дію (record — позначка сервера deniedActions, ADR-0037); fallback і стан, поки профіль вантажиться. DeniedAction: дія без права — неактивна, у фокусі, причина в підказці й для скрінрідера (SPEC §8.4).",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "erp/roles-editor": {
    title: "Ролі й матриця прав",
    description:
      "RolesEditor: ролі, матриця прав за розділами (усе / окремі дії, частково — «−»), нова роль і копія, видалення, незбережені зміни (питання й перед новою роллю чи копією), порожній список; вибрана роль ззовні (адреса сторінки: selectedId, onSelect) — з «Роль не знайдено», фокусом на заголовку ролі після вибору й охороною переходу (ADR-0033); список і діалог нової ролі — erp/role-list; RolePicker і useRoles — тут же для сумісності (живуть в erp/role-picker).",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "erp/role-detail": {
    title: "Права ролі",
    description:
      "RoleDetail: назва, опис, підсумок і матриця прав ролі, «Зберегти», «Скасувати зміни», «Копіювати», «Видалити» з підтвердженням; роль понад «стелю» — лише перегляд (ADR-0032); роль щойно змінив інший (409) — свіжі дані без втрати незбережених галочок (ADR-0033).",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "erp/role-matrix": {
    title: "Матриця прав",
    description:
      "RoleMatrix: ресурси каталогу прав за розділами, «Усе» для ресурсу (частково — «−») і окремі дії; усі дії ресурсу стискаються до <ресурс>:*; галочки, яких не змінити, — лише для перегляду в порядку Tab з причиною (ADR-0033); перемикач «Свої | Усі» поруч з увімкненою дією, яку каталог позначає own (ADR-0038).",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "erp/role-list": {
    title: "Список ролей",
    description:
      "RoleList: ролі компанії з кількістю людей, вбудована — із замком, вибрана — aria-current; shownRole — яку роль показати (вибрана, перша чи «не знайдено» для вибору з адреси); CreateRoleDialog — нова роль чи копія. Частина erp/roles-editor (ADR-0033).",
    status: "beta",
    demo: "roles",
    spec: ["A2", "PF01"],
  },
  "erp/role-picker": {
    title: "Вибір ролей",
    description:
      "RolePicker: позначки ролей з описами для запрошення й ролей людини; ролі, яких не змінити, — лише для перегляду в порядку Tab з причиною (readOnly, readOnlyReason, «стеля»; ADR-0033); useRoles — ролі компанії й каталог прав (право roles:read), rolesQueryKey — ключ їх кешу.",
    status: "beta",
    demo: "users",
    spec: ["A2", "PF01"],
  },
  "erp/invitations-section": {
    title: "Запрошення",
    description:
      "InvitationsSection: хто чекає, «Запросити колегу» з ролями й повідомленням, надіслати ще раз, відкликати; запрошення з ролями понад свої права — дії неактивні з причиною, щойно змінене чи зникле (409, 404) — свіжий список (ADR-0035).",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/invite-dialog": {
    title: "Діалог запрошення",
    description:
      "InviteDialog: адреса, ім'я, ролі й кілька слів у лист; надсилання — із паролем ще раз (ADR-0040), помилки біля полів. Частина erp/invitations-section.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/invite-account": {
    title: "Запрошення наявним обліковим записом",
    description:
      "InviteAccountScreen: адреса вже має обліковий запис, тож вхід прямо на екрані запрошення й прийняття, одна кнопка для того, хто вже ввійшов, вихід для того, хто ввійшов іншим записом (ADR-0040). Частина AcceptInviteScreen.",
    status: "beta",
    demo: "login",
    spec: ["PF01", "A2"],
  },
  "erp/invitation-actions": {
    title: "Дії запрошення",
    description:
      "InvitationActions: «Надіслати ще раз» і «Відкликати» одного запрошення; понад «стелю» — неактивні з причиною, поки «стеля» невідома — неактивні без причини; useInvitationCeiling — «стеля» повтору й відкликання за каталогом ролей. Частина erp/invitations-section (ADR-0035).",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/notification-inbox": {
    title: "Центр сповіщень",
    description:
      "InboxBell (лічильник у дзвінику й у назві вкладки, останні сповіщення, реакція на web push), NotificationInbox (усі / непрочитані, позначки, «Прочитати все», ще), useUnreadNotifications.",
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
  "erp/company-profile-form": {
    title: "Реквізити компанії",
    description:
      "CompanyProfileForm: основне, банк, контакти, підписанти й палітра з перевіркою LC12; без права — лише перегляд.",
    status: "beta",
    demo: "company",
    spec: ["A1", "LC12"],
  },
  "erp/company-profile-values": {
    title: "Значення реквізитів компанії",
    description:
      "Значення форми реквізитів: fieldsOf, перевірка поля checkField і зміни для PATCH /company (patchOf).",
    status: "beta",
    demo: "company",
    spec: ["A1", "LC12"],
  },
  "erp/company-selects": {
    title: "Вибір типу й палітри компанії",
    description:
      "CompanyKindSelect і CompanyPaletteSelect: спільні для форми реквізитів і майстра першого запуску.",
    status: "beta",
    demo: "company",
    spec: ["A1"],
  },
  "erp/setup-checklist": {
    title: "Чек-лист «Почніть роботу»",
    description:
      "SetupChecklist: що лишилось налаштувати, прогрес, «Не потрібно» для необов'язкових пунктів, завантаження й помилка всередині картки (ADR-0044).",
    status: "beta",
    demo: "setup",
    spec: ["PF12", "§8", "§9", "§10"],
  },
  "erp/company-profile-state": {
    title: "Стан профілю компанії",
    description:
      "ProfileState (скелетон, помилка з повтором, немає доступу) і useRefreshCompany для частин налаштувань компанії.",
    status: "beta",
    demo: "company",
    spec: ["A1"],
  },
  "erp/company-images": {
    title: "Логотип і печатка",
    description:
      "CompanyImages: завантажити, замінити й видалити логотип і печатку компанії (без обрізання).",
    status: "beta",
    demo: "company",
    spec: ["A1"],
  },
  "erp/company-branches": {
    title: "Філії компанії",
    description:
      "CompanyBranchesSection: перелік філій, додати, змінити й видалити з підтвердженням.",
    status: "beta",
    demo: "company",
    spec: ["A1"],
  },
  "erp/user-access": {
    title: "Доступ користувачів",
    description:
      "Панель доступу (стан, ролі, двоетапна перевірка, сесії, вийти всюди, скинути другий крок, блокування з причиною) і активні сесії компанії.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/user-access-data": {
    title: "Дані доступу користувача",
    description:
      "useUserAccess (GET /users/:id/access) і оновлення панелі, сесій і бейджів після змін; тип AccessTarget; «стеля» за каталогом ролей — useRolesCeiling (для списку) і useAccessCeiling (для людини, ADR-0034).",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/user-access-actions": {
    title: "Дії над доступом користувача",
    description:
      "useUserAccessActions і UserAccessButtons: вийти на всіх пристроях, скинути другий крок, заблокувати з причиною, розблокувати й вилучити з компанії з підтвердженням і повторним підтвердженням.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/remove-member-dialog": {
    title: "Вилучити людину з компанії",
    description:
      "RemoveMemberDialog: підтвердження з назвою компанії й повторним підтвердженням; людина лишається в інших своїх компаніях.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/user-roles-section": {
    title: "Ролі користувача",
    description:
      "UserRolesSection: ролі людини з «Зберегти ролі» й повторним підтвердженням; свої ролі — лише перегляд, хоча б одна роль.",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/user-sessions": {
    title: "Сесії користувачів",
    description:
      "UserSessionsList — сесії однієї людини з «Завершити»; ActiveSessionsSection — активні сесії компанії з пошуком і «Показати ще».",
    status: "beta",
    demo: "users",
    spec: ["PF01", "A2"],
  },
  "erp/record-link": {
    title: "Посилання між сторінками модуля",
    description:
      "RecordLink — зі списку на картку з адресою списку в стані переходу й прогрівом чанка картки при наведенні чи фокусі; BackToList — «До списку» з тими самими вкладкою, фільтрами й видом (React Router, ADR-0019, ADR-0025).",
    status: "beta",
    demo: "contacts",
    spec: ["§7", "§10"],
  },
  "erp/copy-button": {
    title: "Кнопка «Копіювати»",
    description:
      "Копіює значення в буфер, показує галочку й повідомляє скрінрідеру «Скопійовано».",
    status: "beta",
    demo: "security",
    spec: ["UI43"],
  },
  "erp/copyable-value": {
    title: "Значення з «Копіювати»",
    description:
      "Реквізит у картці з кнопкою «Копіювати»: ЄДРПОУ, РНОКПП, IBAN групами по 4 (у буфер — без пробілів), телефон і email посиланнями, посилання http(s); порожнє — «—» без кнопки; довге переноситься (UI43, ADR-0023).",
    status: "beta",
    demo: "pickers",
    spec: ["UI43", "LC12"],
  },
  "erp/record-picker": {
    title: "Вибір запису",
    description:
      "Поле вибору запису ресурсу з пошуком на сервері: список під полем, на телефоні — нижня шторка; «Показано 20 з N. Уточніть пошук.», «Створити…» з текстом пошуку (без права — неактивне з причиною), очищення; стани поля й списку — завантаження, нічого не знайдено, помилка з повтором, офлайн, немає доступу, запис видалили, лише читання (UI40, UI38, ADR-0023).",
    status: "beta",
    demo: "pickers",
    spec: ["UI40", "UI38", "§8.1", "§8.3", "§9", "§10"],
  },
  "erp/record-picker-parts": {
    title: "Частини вибору запису",
    description:
      "Частина erp/record-picker: стан поля (список, пошук, значення), клавіші (літера на закритому полі відкриває пошук, Enter на застарілих варіантах нічого не вибирає), варіанти й «Створити…», рядок стану для скрінрідера, підпис значення. Ставиться разом з erp/record-picker.",
    status: "beta",
    demo: "pickers",
    spec: ["UI40", "§8.1", "§10"],
  },
  "erp/multi-select": {
    title: "Мультивибір із довідника",
    description:
      "MultiSelect: кілька значень із короткого довідника в пам'яті (сегменти, теги, ролі) — мітки в полі, список із пошуком за підписом, що не закривається після вибору, на телефоні — нижня шторка з «Готово»; «Очистити»; значення, якого вже немає в довіднику, можна зняти; стани — довідник вантажиться, порожній, нічого не знайдено, не завантажився з повтором, помилка поля, лише читання, вимкнено (UI40, UI38, ADR-0027).",
    status: "beta",
    demo: "pickers",
    spec: ["UI40", "UI38", "§8.1", "§8.3", "§9", "§10"],
  },
  "erp/multi-select-parts": {
    title: "Частини мультивибору",
    description:
      "Частина erp/multi-select: варіанти з довідника й вибрані значення, яких у ньому немає, пошук у пам'яті, рядок стану для очей і скрінрідера, мітки в полі. Ставиться разом з erp/multi-select.",
    status: "beta",
    demo: "pickers",
    spec: ["UI40", "§8.1", "§10"],
  },
  "erp/picker-field": {
    title: "Спільне полів вибору",
    description:
      "Спільне erp/record-picker і erp/multi-select: клас кнопки поля, літера на закритому полі відкриває пошук із неї, ref кнопки поля разом із ref ззовні (фокус після «Очистити»). Ставиться разом із ними.",
    status: "beta",
    demo: "pickers",
    spec: ["UI40", "§10"],
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
  "erp/form-select": {
    title: "Вибір у формі",
    description:
      "FormSelect: одне значення з короткого списку для FormField (тип, статус, варіант поля розширення); «покинуто» — коли список закрили, ref — на кнопку поля. Окремо від erp/form, щоб список не їхав у кожну сторінку з формою (ADR-0026).",
    status: "beta",
    demo: "contacts",
    spec: ["§8.2", "§8.3"],
  },
  "erp/record-form": {
    title: "Форма запису в діалозі",
    description:
      "RecordFormDialog: створення й зміна запису модуля — поля списком із ключами (поля модуля й розширення), сітка на @container, зведення помилок, помилка сервера й полів поза формою над полями з фокусом, «Закрити без збереження?», захист незбережених змін (один на вкладені форми), порівняння при конфлікті з текстом полів, вкладені діалоги, фокус на кнопку, що відкрила (ADR-0026).",
    status: "beta",
    demo: "contacts",
    spec: ["§7", "§8.2", "§8.3", "§9", "§10"],
  },
  "erp/record-form-page": {
    title: "Форма запису на сторінці",
    description:
      "RecordFormPage: той самий useRecordForm і ті самі поля, що в RecordFormDialog, на сторінці з липкою панеллю збереження: зведення помилок, помилка над формою, порівняння при конфлікті, захист незбережених змін, режим лише для читання (PF11, ADR-0047).",
    status: "beta",
    demo: "dictionariesModule",
    spec: ["PF11", "§8.2", "§8.3", "§10"],
  },
  "erp/save-bar": {
    title: "Липка панель збереження",
    description:
      "SaveBar: стан форми живим регіоном, «Скасувати зміни» з підтвердженням, «Зберегти», який ніколи не вимикається; липне до низу екрана, на телефоні над нижньою панеллю, не перекриває елемент у фокусі (PF11, ADR-0047).",
    status: "beta",
    demo: "forms",
    spec: ["PF11", "§8.3", "§9", "§10"],
  },
  "erp/repeating-row-actions": {
    title: "Кнопки повторюваного рядка",
    description:
      "RepeatingRowActions: підняти, опустити й вилучити рядок erp/repeating-rows; неактивні лишаються у фокусі, утримана клавіша не вилучає наступні рядки.",
    status: "beta",
    demo: "forms",
    spec: ["UI42", "§8.2", "§10"],
  },
  "erp/repeating-rows": {
    title: "Повторювані рядки",
    description:
      "RepeatingRows: група полів форми на useFieldArray: додати, вилучити з «Повернути», змінити порядок кнопками, межі рядків, помилка всієї групи, фокус після кожної дії, оголошення для скрінрідера, таблиця на широкому контейнері й картки на вузькому, лише для читання (UI42, ADR-0047).",
    status: "beta",
    demo: "forms",
    spec: ["UI42", "§8.2", "§8.3", "§9", "§10"],
  },
  "erp/key-value-field": {
    title: "Поле «ключ–значення»",
    description:
      "KeyValueField на erp/repeating-rows: пари ключ і значення, підписи колонок, порожній стан, межа рядків, лише для читання; перевірка й перетворення на об'єкт запиту — lib/key-value (UI42, ADR-0047).",
    status: "beta",
    demo: "forms",
    spec: ["UI42", "§8.3", "§9", "§10"],
  },
  "erp/extension-field-input": {
    title: "Поле розширення у формі",
    description:
      "Поле вводу кіта за типом поля розширення (текст, число, дата, список, так/ні прапорцем, запис із довідника — erp/record-picker) і useExtensionForm — поля розширення як елементи форми модуля, підписи й підказки мовою інтерфейсу, зміна поля модуля без заміни (ADR-0020, ADR-0026).",
    status: "beta",
    demo: "contacts",
    spec: ["§8.3", "§11", "§17", "PF09"],
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
    description:
      "Checkbox на Base UI зі зоною натиску ≥ 24 px; неактивна приглушена, лише для перегляду (readOnly) — у порядку Tab, рамка пунктиром, позначена сіра (ADR-0033).",
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
  "ui/progress": {
    title: "Прогрес",
    description:
      "Base UI Progress: доріжка й індикатор із плавною шириною (токени руху), невизначений стан (value=null), текст значення для скрінрідера.",
    status: "beta",
    demo: "data",
    spec: ["§8.2"],
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

/** Команда кіта в проекті (ADR-0029): оновлення однією командою й перевірка файлів кіта. */
const KIT_TOOL_FILES = [
  {
    path: "registry/tools/erp-ui-kit.mjs",
    target: "~/scripts/erp-ui-kit.mjs",
  },
  {
    path: "registry/tools/erp-ui-kit-lib.mjs",
    target: "~/scripts/erp-ui-kit-lib.mjs",
  },
  {
    path: "registry/tools/erp-ui-kit-deps.mjs",
    target: "~/scripts/erp-ui-kit-deps.mjs",
  },
]

/**
 * Модулі (шар 5, ADR-0025): ключ — `modules/<ID>-<назва>`, файли — уся тека
 * `registry/modules/<ID>-<назва>/` (у проекті — `src/modules/…`), спільні елементи — з імпортів.
 */
export const MODULE_ITEMS = {
  "modules/A1-company": {
    title: "Компанія й валюти (A1)",
    description:
      "Модуль: картка компанії на Object Page з вкладками «Реквізити», «Логотип і печатка», «Філії», «Локалізація» (базова валюта, мова, часовий пояс, початок фінансового року) й історією; валюти компанії й таблиця курсів на List Report (фільтри за валютою, датою й джерелом, форми в діалозі, один курс на дату, курс із зовнішнього джерела лише для перегляду); контракт, моки зі сценаріями, фікстури, рядки uk/en; фабрика createCompanyModule з маршрутами, навігацією й правами, тип розширення CompanyExtension (ADR-0020, ADR-0025, ADR-0043).",
    status: "beta",
    demo: "companyModule",
    spec: ["§7", "§14", "§17", "A1", "PF02"],
    docs: [
      "Модуль A1 встановлено в src/modules/A1-company. Файли модуля не правте: зміни під клієнта — у src/extensions/A1-company.ts (тип CompanyExtension).",
      "1) createCompanyModule({ basePath, extension }) з @/modules/A1-company: routes — у роутер, nav — у навігацію (пункт з access — лише тому, хто має це право).",
      "2) Моки: createCompanyMocks({ extension, companies }) з @/modules/A1-company/mocks — handlers у setupWorker після createPlatformHandlers.",
      "3) Права ролей: company (update), currencies (read, create, update), exchange-rates (read, create, update, delete). Докладно — src/modules/A1-company/README.md.",
    ].join("\n"),
  },
  "modules/N5-notifications": {
    title: "Сповіщення (N5)",
    description:
      "Модуль: сторінка «Сповіщення» (усі й непрочитані, позначки, «Прочитати все», «Показати ще») і «Налаштування сповіщень» (події й канали, тихі години, push на цьому пристрої); контракт lib/notifications, lib/notification-settings і підписки lib/web-push, фоновий файл public/erp-ui-push-sw.js, моки платформи зі сценаріями ресурсу notifications, фікстури, рядки uk/en; фабрика createNotificationsModule з маршрутами й навігацією, тип розширення NotificationsExtension (ADR-0013, ADR-0014, ADR-0020, ADR-0025, ADR-0046).",
    status: "beta",
    demo: "notificationsModule",
    spec: ["§7", "§14", "§17", "N5", "PF10", "PF19", "UI02"],
    docs: [
      "Модуль N5 встановлено в src/modules/N5-notifications, фоновий файл web push — у public/erp-ui-push-sw.js. Файли модуля не правте: зміни під клієнта — у src/extensions/N5-notifications.ts (тип NotificationsExtension).",
      "1) createNotificationsModule({ basePath, extension }) з @/modules/N5-notifications: routes — у роутер, nav — у навігацію.",
      "2) У топбарі — <InboxBell onNavigate onShowAll /> з @/components/erp/notification-inbox: дзвіник, лічильник у вкладці, реакція на push.",
      "3) Моки: createNotificationsMocks({ users }) з @/modules/N5-notifications/mocks — seeds в inboxSeeds createPlatformHandlers. Докладно — src/modules/N5-notifications/README.md.",
    ].join("\n"),
  },
  "modules/A6-dictionaries": {
    title: "Довідники (A6)",
    description:
      "Модуль: п'ять довідників на List Report (податки, одиниці виміру, умови оплати з частинами оплати, теги, причини з видами), форми в діалозі, вимкнення в рядку з «Скасувати», зовнішні коди значення; сторінка «Типові значення» з липкою панеллю збереження; контракт, моки зі сценаріями, фікстури, рядки uk/en; фабрика createDictionariesModule з маршрутами, навігацією й правами, тип розширення DictionariesExtension (ADR-0020, ADR-0025, ADR-0047).",
    status: "beta",
    demo: "dictionariesModule",
    spec: ["§7", "§14", "§17", "A6", "PF11", "UI42"],
    docs: [
      "Модуль A6 встановлено в src/modules/A6-dictionaries. Файли модуля не правте: зміни під клієнта — у src/extensions/A6-dictionaries.ts (тип DictionariesExtension).",
      "1) createDictionariesModule({ basePath, extension }) з @/modules/A6-dictionaries: routes — у роутер, nav — у навігацію (пункт з access — лише тому, хто має це право).",
      "2) Моки: createDictionariesMocks({ extension, companies }) з @/modules/A6-dictionaries/mocks — handlers у setupWorker після createPlatformHandlers.",
      "3) Права ролей: taxes, units, payment-terms, tags, reasons (read, create, update), dictionary-defaults (read, update). Докладно — src/modules/A6-dictionaries/README.md.",
    ].join("\n"),
  },
  "modules/A4-import-export": {
    title: "Імпорт і експорт (A4)",
    description:
      "Модуль: цілі імпорту й експорту (контакти й організації B1, довідники A6, свої цілі проекту) з діями за правами, майстер імпорту на адресі цілі, експорт у файл із тими самими назвами колонок, історія запусків на List Report (фільтри цілі й стану, подробиці з причинами невдач); контракт import-runs, моки зі сценаріями, фікстури, рядки uk/en; фабрика createImportExportModule з маршрутами, навігацією й правами, тип розширення ImportExportExtension (ADR-0020, ADR-0025, ADR-0049, ADR-0050).",
    status: "beta",
    demo: "importExportModule",
    spec: ["§7", "§14", "§17", "A4", "PF07", "UI11"],
    docs: [
      "Модуль A4 встановлено в src/modules/A4-import-export. Файли модуля не правте: зміни під клієнта — у src/extensions/A4-import-export.ts (тип ImportExportExtension).",
      "1) createImportExportModule({ basePath, extension }) з @/modules/A4-import-export: routes — у роутер, nav — у навігацію (пункт з access — лише тому, хто має це право).",
      "2) Цілі без модуля в проекті сховайте: extension.targets.hide. Свої цілі: extension.targets.add.",
      "3) Моки: createImportExportMocks({ companies, targets }) з @/modules/A4-import-export/mocks, ціль — importTargetMock({ resource, db }): handlers у setupWorker після createPlatformHandlers.",
      "4) Права ролей: import-runs (read, read:own). Імпорт цілі — <ресурс>:create і для оновлення <ресурс>:update, експорт — <ресурс>:read. Докладно — src/modules/A4-import-export/README.md.",
    ].join("\n"),
  },
  "modules/A5-audit": {
    title: "Аудит та історія (A5)",
    description:
      "Модуль: журнал аудиту компанії (пошук, розділ, період, подробиці з різницею значень, експорт CSV) і перехід із рядка події до шухляди історії запису; контракт журналу lib/audit, моки платформи зі сценаріями ресурсу audit, фікстури, рядки uk/en; фабрика createAuditModule з маршрутом, навігацією й правом, тип розширення AuditExtension (ADR-0013, ADR-0020, ADR-0025, ADR-0045).",
    status: "beta",
    demo: "auditModule",
    spec: ["§7", "§14", "§17", "A5"],
    docs: [
      "Модуль A5 встановлено в src/modules/A5-audit. Файли модуля не правте: зміни під клієнта — у src/extensions/A5-audit.ts (тип AuditExtension).",
      "1) createAuditModule({ basePath, extension }) з @/modules/A5-audit: routes — у роутер, nav — у навігацію (пункт із access — лише тому, хто має це право).",
      "2) Моки: createAuditMocks({ companies }) з @/modules/A5-audit/mocks — seeds в auditSeeds createPlatformHandlers.",
      "3) Право ролей: audit (read). Докладно — src/modules/A5-audit/README.md.",
    ].join("\n"),
  },
  "modules/A2-users": {
    title: "Користувачі й ролі (A2)",
    description:
      "Модуль: люди компанії на List Report (вкладки за статусом з лічильниками, фільтри «Роль» і «Другий крок», пошук за ім'ям чи email, розмір сторінки) і картка на Object Page з вкладками «Доступ» (стан, другий крок, вийти всюди, скинути другий крок, заблокувати й розблокувати), «Ролі», «Сесії» й «Історія»; «Увійти як…» у шапці; «Ролі й права» — список ролей і права вибраної поруч, роль в адресі (?role=), нова, копія, видалення зі «стелею», пункт навігації з правом roles:read (ADR-0033); контракт users з довідником для полів-записів інших модулів (ім'я та email для кожного в компанії), моки поверх користувачів мок-сервера входу, фікстури колег uk/en, рядки uk/en; фабрика createUsersModule з маршрутами, навігацією й правами, тип розширення UsersExtension (ADR-0020, ADR-0025, ADR-0031, ADR-0033).",
    status: "beta",
    demo: "usersModule",
    spec: ["§7", "§14", "§17", "A2", "PF01"],
    docs: [
      "Модуль A2 встановлено в src/modules/A2-users. Файли модуля не правте: зміни під клієнта — у src/extensions/A2-users.ts (тип UsersExtension).",
      "1) createUsersModule({ basePath, extension, homePath }) з @/modules/A2-users: routes — у роутер, nav — у навігацію (пункт з access — лише тому, хто має це право).",
      "2) Моки: createUsersMocks({ extension }) з @/modules/A2-users/mocks — handlers у setupWorker після createPlatformHandlers; колеги для демо — createUsersFixtures({ company, roles }) з @/modules/A2-users/fixtures у users і accountSeeds createPlatformHandlers.",
      "3) Права ролей: users (read, create, update, impersonate), roles (read, update). Докладно — src/modules/A2-users/README.md.",
    ].join("\n"),
  },
  "modules/B1-contacts": {
    title: "Контакти й компанії (B1)",
    description:
      "Модуль: організації (юрособа, ФОП) з реквізитами, адресами й рахунками, контакти — представники й приватні особи, сегменти. Списки на List Report (вкладки, фільтри, закріплення, розмір сторінки), картки на Object Page (вкладки в адресі, історія), вибір організації контакту з пошуком на сервері; форми створення й зміни організації й контакту в діалозі з полями розширення, «Створити…» організацію з форми контакту, конфлікт 409 з порівнянням; сегменти мультивибором у формах і довідник сегментів (назва не повторюється); адреси й банківські рахунки в картці організації (додати, змінити, зробити основним, видалити; PATCH колекції з version, IBAN з контрольними цифрами); контракт, моки зі сценаріями, фікстури uk/en, рядки uk/en; фабрика createContactsModule з маршрутами, навігацією й правами, тип розширення ContactsExtension (зокрема сховати рядки «Подробиць» і журнал картки для бекенду без них) (ADR-0020, ADR-0025, ADR-0027, ADR-0028).",
    status: "beta",
    demo: "contacts",
    spec: ["§7", "§14", "§17"],
    docs: [
      "Модуль B1 встановлено в src/modules/B1-contacts. Файли модуля не правте: зміни під клієнта — у src/extensions/B1-contacts.ts (тип ContactsExtension).",
      "1) createContactsModule({ basePath, extension }) з @/modules/B1-contacts: routes — у роутер, nav — у навігацію.",
      "2) Моки: createContactsMocks({ extension }) з @/modules/B1-contacts/mocks — handlers у setupWorker.",
      "3) Права ролей: contacts, organizations, segments (read, create, update, delete). Докладно — src/modules/B1-contacts/README.md.",
    ].join("\n"),
  },
}

/** Елементи без власного коду: файли задано явно; `include` — елементи з кодом, які входять повністю. */
export const BUNDLE_ITEMS = {
  base: {
    title: "Основа erp-ui",
    description:
      "Усе для старту проекту однією командою: теми й токени, базові стилі, cn, вподобання вигляду, мови й форматери, словник іконок, скіл і правила для Claude Code, команда оновлення кіта scripts/erp-ui-kit.mjs.",
    status: "beta",
    demo: "appearance",
    spec: ["§3", "§6", "§19"],
    files: [...TOKEN_FILES, ...CLAUDE_FILES, ...KIT_TOOL_FILES],
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
    // shadcn/tailwind.css у src/index.css — з пакета shadcn, який проект має після `shadcn init`
    // і закріплює сам: залежність тут зняла б закріплення при кожному оновленні (ADR-0029).
    dependencies: ["@fontsource/geist", "tw-animate-css"],
    docs: [
      "erp-ui встановлено.",
      "1) src/index.css тепер — точка входу стилів erp-ui; власні стилі проекту додавайте нижче імпортів.",
      "2) Додайте в CLAUDE.md проекту рядок: @docs/erp-ui/CLAUDE.project.md",
      "3) У main.tsx до рендеру: initAppearance() з @/lib/appearance, const i18n = createI18n({ language: getAppearance().language, resources }) з @/lib/i18n, syncLanguage(i18n) і await whenI18nReady(i18n).",
      '4) Вигляд задається на <html>: data-palette="sapphire|graphite|…", клас dark, data-density="compact", data-sidebar="dark".',
      "Компоненти: node scripts/erp-ui-kit.mjs update vX.Y.Z --add ui/<назва>. Каталог: docs/erp-ui/CATALOG.md.",
      "5) Оновлення кіта однією командою: node scripts/erp-ui-kit.mjs update vX.Y.Z (перший раз — з --items base,…, список встановлених елементів); файли кіта не правлені — node scripts/erp-ui-kit.mjs check у lint проекту.",
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
      "3) Обгорніть застосунок у <CoreAdminContext dataProvider authProvider i18nProvider={createRaI18nProvider(i18n)} queryClient>; queryClient = createQueryClient() з @/lib/query-client (елемент lib/query-client).",
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
      "1) Маршрути екранів входу — createAuthRoutes({ afterLogin, title }) з @/components/erp/auth-routes (елемент erp/auth-routes): auth.routes — поруч із брамою сесії, не всередині; прогрів екрана входу — whenIdle(() => auth.preload()) з @/lib/lazy; адреси, крім /login, — опцією paths.",
      "2) Оболонку для тих, хто увійшов, обгорніть у <SessionGate> з @/components/erp/app-gate (елемент erp/app-gate): гість — на /login, охорона сесії й автовихід за політикою сервера — усередині (свій термін — idleMinutes={30}); вихід у меню — useSignOut().",
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
    // Без shadcn: пакет є в проекті після `shadcn init` (як у base).
    dependencies: ["@fontsource/geist", "tw-animate-css"],
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
  "tools/kit": {
    layer: "tools",
    title: "Команда кіта",
    description:
      "scripts/erp-ui-kit.mjs: update <версія> — тег архівом одним запитом (тайм-аут, повтори), реєстр, звіт add --dry-run, add --overwrite (лише файли), файли, які проект доповнює сам, лишаються його, залежності: відсутні в проекті — з діапазоном кіта, наявні — без змін, відбитки kit-files.json; check — файли кіта не правлені (ADR-0029). Входить у base.",
    status: "beta",
    spec: ["§3"],
    files: KIT_TOOL_FILES,
    docs: "Оновлення: node scripts/erp-ui-kit.mjs update vX.Y.Z (перший раз — --items base,…); перевірка: node scripts/erp-ui-kit.mjs check.",
  },
  "tools/e2e": {
    layer: "tools",
    title: "Помічники e2e",
    description:
      "e2e/erp-ui.ts для Playwright: openAs (користувач моків і вигляд до першого кадру), expectNoA11yViolations (axe, WCAG 2.2 AA), expectNoHorizontalScroll, cellOf (комірка за назвою колонки), меню клавіатурою; ключі сховища кіта (ADR-0029).",
    status: "beta",
    spec: ["§10", "§18"],
    files: [{ path: "registry/tools/e2e.ts", target: "~/e2e/erp-ui.ts" }],
    dependencies: ["@playwright/test", "@axe-core/playwright"],
    docs: "Помічники e2e — e2e/erp-ui.ts (не правте); свої (користувачі моків, ширини) — у своєму файлі поруч.",
  },
}
