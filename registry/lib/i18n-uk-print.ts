/**
 * Рядки друку українською (PF08, ADR-0062). Окремий модуль, щоб основний файл рядків не ріс;
 * підключається туди ж, у простір імен `erp-ui`. Англійська — lib/i18n-en-print.
 *
 * `print.sheet` — текст аркуша мовою документа, а не інтерфейсу (SPEC §11): його бере
 * `usePrintLanguage`; решта — інтерфейс перегляду.
 */
export const ukPrint = {
  print: {
    action: "Друкувати",
    notReady: "Аркуш ще завантажується",
    preview: "Перегляд друку",
    sheetLabel: "Аркуш для друку",
    actualSize: "Справжній розмір",
    loading: "Завантажуємо аркуш",
    sheet: {
      watermark: {
        draft: "Чернетка",
        cancelled: "Скасовано",
      },
      state: {
        draft: "Чернетка: документ ще не проведено",
        cancelled: "Документ скасовано",
      },
      number: "№ {{number}}",
      noNumber: "(без номера)",
      date: "від {{date}}",
      dueDate: "Сплатити до {{date}}",
      supplier: "Постачальник",
      buyer: "Покупець",
      logo: "Логотип: {{name}}",
      stamp: "Печатка: {{name}}",
      edrpou: "ЄДРПОУ",
      rnokpp: "РНОКПП",
      vatIpn: "ІПН",
      iban: "IBAN",
      phone: "Тел.",
      vatPayer: "Платник ПДВ",
      notVatPayer: "Не є платником ПДВ",
      position: "№",
      name: "Товари (роботи, послуги)",
      quantity: "К-сть",
      unit: "Од.",
      price: "Ціна",
      discount: "Знижка",
      tax: "Податок",
      sum: "Сума",
      empty: "У документі немає рядків",
      inWords: "Всього на суму: {{amount}}",
      accountant: "Головний бухгалтер",
      signature: "Підпис",
    },
  },
}
