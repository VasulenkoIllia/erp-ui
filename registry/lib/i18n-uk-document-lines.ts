/**
 * Рядки редактора рядків документа українською (UI05, ADR-0059). Окремий модуль, щоб основний файл
 * рядків не ріс; підключається туди ж, у простір імен `erp-ui`. Англійська — lib/i18n-en-document-lines.
 */
export const ukDocumentLines = {
  documentLines: {
    label: "Рядки документа",
    row: "Рядок {{index}}",
    add: "Додати рядок",
    empty: "Рядків ще немає. Додайте перший.",
    item: "Товар чи послуга",
    itemPlaceholder: "Вибрати з довідника",
    name: "Назва",
    quantity: "Кількість",
    unit: "Одиниця",
    noUnit: "Без одиниці",
    price: "Ціна",
    discount: "Знижка",
    discountKind: "Вид знижки: {{row}}",
    documentDiscountKind: "Вид знижки на документ",
    percent: "у відсотках",
    amount: "сумою",
    tax: "Податок",
    noTax: "Без податку",
    sum: "Сума",
    noSum: "ще не пораховано",
    totals: {
      label: "Підсумки",
      amount: "Сума до знижок",
      lineDiscount: "Знижка в рядках",
      documentDiscount: "Знижка на документ",
      net: "Без податку",
      taxIncluded: "У т. ч. {{name}}",
      total: "Разом",
      skipped_one:
        "Не враховано {{count}} рядок: перевірте кількість, ціну й знижку.",
      skipped_few:
        "Не враховано {{count}} рядки: перевірте кількість, ціну й знижку.",
      skipped_many:
        "Не враховано {{count}} рядків: перевірте кількість, ціну й знижку.",
      skipped_other:
        "Не враховано {{count}} рядка: перевірте кількість, ціну й знижку.",
      documentDiscountSkipped: "Знижку на документ не враховано: перевірте її.",
    },
    errors: {
      invalid: "Введіть число",
      positive: "Має бути більше нуля",
      out_of_range: "Сума документа завелика. Зменште кількість чи ціну.",
      discount_both: "Знижка або відсотком, або сумою",
      discount_exceeds: "Знижка більша за суму",
      percentMax: "Не більше 100 %",
      tooLong: "Не більше {{max}} символів",
    },
  },
}
