/**
 * Рядки поля тексту українською (UI12, ADR-0052). Окремий модуль, щоб основний файл рядків не ріс;
 * підключається туди ж, у простір імен `erp-ui`. Англійська — lib/i18n-en-rich-text.
 */
export const ukRichText = {
  richText: {
    toolbar: "Оформлення тексту",
    bold: "Жирний",
    italic: "Курсив",
    bulletList: "Маркований список",
    orderedList: "Нумерований список",
    blockquote: "Цитата",
    link: "Посилання",
    mention: "Згадати колегу",
    linkAddress: "Адреса посилання",
    linkApply: "Застосувати",
    linkRemove: "Прибрати посилання",
    linkInvalid: "Вкажіть адресу, наприклад https://example.com",
    loading: "Завантаження редактора",
    failed: "Не вдалося завантажити редактор. Введений текст не втрачено.",
    mentionsFound_one: "Знайдено {{count}} людину",
    mentionsFound_few: "Знайдено {{count}} людини",
    mentionsFound_many: "Знайдено {{count}} людей",
    mentionsFound_other: "Знайдено {{count}} людини",
    mentionsSearching: "Шукаємо колег",
    mentionsEmpty: "Нікого не знайдено",
    mentionsFailed: "Не вдалося знайти колег",
  },
}
