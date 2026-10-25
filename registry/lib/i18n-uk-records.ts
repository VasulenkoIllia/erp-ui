/**
 * Рядки кіта для вибору запису (UI40), значень із «Копіювати» (UI43; ADR-0023), форми запису
 * (ADR-0026) і мультивибору з довідника (ADR-0027) українською.
 * Окремий модуль, щоб не роздувати `i18n-uk.ts`; підключається туди ж, у простір імен `erp-ui`.
 * Англійська — `i18n-en-records.ts`.
 */
export const ukRecords = {
  recordPicker: {
    placeholder: "Виберіть…",
    search: "Пошук: {{label}}",
    searchPlaceholder: "Почніть вводити назву",
    searching: "Шукаємо…",
    found_one: "Знайдено {{count}} запис",
    found_few: "Знайдено {{count}} записи",
    found_many: "Знайдено {{count}} записів",
    found_other: "Знайдено {{count}} запису",
    more: "Показано {{shown}} з {{total}}. Уточніть пошук.",
    empty: "Нічого не знайдено",
    emptyFor: "За «{{query}}» нічого не знайдено",
    create: "Створити «{{query}}»",
    createNew: "Створити новий…",
    createDenied: "Немає права створювати записи",
    loadingValue: "Завантаження…",
    missing: "Запис не знайдено",
    valueError: "Не вдалося завантажити запис",
    valueForbidden: "Немає доступу",
    error: "Не вдалося завантажити варіанти",
    forbidden: "Немає доступу до списку",
    offline: "Немає з'єднання з сервером",
    retry: "Спробувати ще",
    clear: "Очистити: {{label}}",
  },
  multiSelect: {
    placeholder: "Виберіть…",
    search: "Пошук: {{label}}",
    searchPlaceholder: "Почніть вводити",
    loading: "Завантаження…",
    found_one: "Знайдено {{count}} варіант",
    found_few: "Знайдено {{count}} варіанти",
    found_many: "Знайдено {{count}} варіантів",
    found_other: "Знайдено {{count}} варіанта",
    selected: "Вибрано: {{count}}",
    empty: "Довідник порожній",
    emptyFor: "За «{{query}}» нічого не знайдено",
    missing: "Немає в довіднику",
    error: "Не вдалося завантажити варіанти",
    forbidden: "Немає доступу до списку",
    offline: "Немає з'єднання з сервером",
    retry: "Спробувати ще",
    clear: "Очистити: {{label}}",
    done: "Готово",
  },
  copyableValue: {
    copy: "Копіювати: {{label}}",
    empty: "Не вказано",
  },
  recordForm: {
    save: "Зберегти",
    create: "Створити",
    cancel: "Скасувати",
    notSet: "Не вказано",
    discardTitle: "Закрити без збереження?",
    discardDescription: "Введене у формі пропаде.",
    discardConfirm: "Закрити без збереження",
    discardCancel: "Повернутися до форми",
    hiddenFields:
      "Не вдалося зберегти: помилка в полях, яких немає у формі ({{fields}}). Зверніться до адміністратора.",
    reloaded:
      "У формі — значення, збережені зараз. Змініть їх ще раз, якщо потрібно.",
    serverErrors: {
      duplicate: "Таке значення вже є в іншого запису",
      tooLong: "Задовге значення",
      invalid: "Сервер не прийняв це значення. Перевірте його.",
    },
  },
}
