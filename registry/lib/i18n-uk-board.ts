/**
 * Рядки дошки українською (UI07, ADR-0100, ADR-0103): колонки, доріжки, згортання, швидке створення,
 * «Перемістити в…», перенесення кількох карток. Вантажаться разом із дошкою (ADR-0094). Англійська — lib/i18n-en-board.
 */
export const ukBoard = {
  board: {
    cards_one: "{{value}} картка",
    cards_few: "{{value}} картки",
    cards_many: "{{value}} карток",
    cards_other: "{{value}} картки",
    collapse: "Згорнути колонку «{{column}}»",
    // Назва починається з видимого тексту смужки (назва й кількість), WCAG 2.5.3.
    expand_one: "{{column}}, {{value}} картка, розгорнути колонку",
    expand_few: "{{column}}, {{value}} картки, розгорнути колонку",
    expand_many: "{{column}}, {{value}} карток, розгорнути колонку",
    expand_other: "{{column}}, {{value}} картки, розгорнути колонку",
    column: "Колонка",
    columnOption: "{{column}}: {{value}}",
    cell: "{{column}}, {{lane}}",
    otherLane: "Інше",
    noCards: "Карток немає",
    loadMore: "Показати ще",
    shown: "Показано {{shown}} з {{total}}",
    limit:
      "Показано {{shown}} з {{total}}. Щоб побачити решту, уточніть фільтр.",
    columnFailed: "Не вдалося завантажити колонку «{{column}}»",
    retry: "Спробувати ще",
    quickCreate: {
      open: "Додати картку",
      openIn: "Додати картку в колонку «{{column}}»",
      label: "Назва",
      submit: "Додати",
      cancel: "Скасувати",
      created: "Створено «{{name}}» у колонці «{{column}}»",
      failed: "Не вдалося створити картку: {{message}}",
    },
    card: {
      actions: "Дії: {{label}}",
      moveTo: "Перемістити в…",
      moved: "«{{label}}» тепер у колонці «{{column}}»",
      moveFailed: "Не вдалося перемістити «{{label}}»: {{message}}",
      conflict:
        "Картку «{{label}}» щойно змінив інший користувач, тому її повернуто на місце. Дошку оновлено, спробуйте ще раз.",
      lockedBy: "Редагує {{name}}",
      lockedReason: "Картку зараз редагує {{name}}",
      noRight: "Немає права переносити картки",
    },
    bulk: {
      moved_one: "Перенесено {{count}} картку в колонку «{{column}}»",
      moved_few: "Перенесено {{count}} картки в колонку «{{column}}»",
      moved_many: "Перенесено {{count}} карток у колонку «{{column}}»",
      moved_other: "Перенесено {{count}} картки в колонку «{{column}}»",
      partial:
        "Перенесено {{done}} з {{total}} у колонку «{{column}}». Решту не перенесено. «{{label}}»: {{message}}",
      none: "Картки не перенесено. «{{label}}»: {{message}}",
      changed: "картку щойно змінив інший користувач",
      allMode:
        "Переносити можна лише картки, вибрані на дошці, а не всі за фільтром",
    },
  },
}
