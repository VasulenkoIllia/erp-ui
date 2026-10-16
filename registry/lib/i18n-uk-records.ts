/**
 * Рядки кіта для вибору запису (UI40) і значень із «Копіювати» (UI43; ADR-0023) українською.
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
    error: "Не вдалося завантажити варіанти",
    forbidden: "Немає доступу до списку",
    offline: "Немає з'єднання з сервером",
    retry: "Спробувати ще",
    clear: "Очистити: {{label}}",
  },
  copyableValue: {
    copy: "Копіювати: {{label}}",
    empty: "Не вказано",
  },
}
