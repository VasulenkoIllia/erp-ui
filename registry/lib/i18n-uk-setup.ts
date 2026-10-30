/**
 * Рядки чек-листа «Почніть роботу» українською (PF12, ADR-0044). Окремий модуль, щоб не роздувати
 * `i18n-uk.ts`; підключається туди ж, у простір імен `erp-ui`. Англійська — `i18n-en-setup.ts`.
 */
export const ukSetup = {
  setup: {
    title: "Почніть роботу",
    progress: "Зроблено {{done}} з {{total}}",
    progressLabel: "Скільки зроблено",
    done: "Зроблено",
    notNeeded: "Не потрібно",
    dismissFor: "Не потрібно: {{item}}",
    restore: "Повернути",
    restoreFor: "Повернути: {{item}}",
    finished: "Усе налаштовано",
  },
}
