/**
 * Рядки майстра UI06 українською (ADR-0043). Окремий модуль, щоб не роздувати `i18n-uk.ts`;
 * підключається туди ж, у простір імен `erp-ui`. Англійська — `i18n-en-wizard.ts`.
 */
export const ukWizard = {
  wizard: {
    stepsLabel: "Кроки",
    stepOf: "Крок {{current}} з {{total}}",
    stepDone: "виконано",
    stepInvalid: "є помилки",
    optional: "Необов'язково",
    next: "Далі",
    back: "Назад",
    skip: "Пропустити",
    edit: "Змінити",
    editStep: "Змінити: {{step}}",
    notSet: "Не вказано",
  },
}
