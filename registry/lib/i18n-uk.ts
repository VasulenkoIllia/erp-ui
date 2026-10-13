/**
 * Рядки кіта erp-ui українською — простір імен `erp-ui` (SPEC §11).
 * Англійський переклад — `i18n-en.ts` з тими самими ключами; паритет перевіряє тест.
 * Множина — ключі `_one/_few/_many/_other` (i18next + Intl.PluralRules).
 */
export const uk = {
  common: {
    close: "Закрити",
    loading: "Завантаження",
    table: "Таблиця",
  },
  phone: {
    country: "Країна",
    otherCountries: "Інші країни",
  },
  validation: {
    edrpou: {
      length: "ЄДРПОУ має містити 8 цифр",
      checksum: "Помилка в ЄДРПОУ: не збігається контрольна цифра",
    },
    rnokpp: {
      length: "РНОКПП має містити 10 цифр",
      checksum: "Помилка в РНОКПП: не збігається контрольна цифра",
    },
    vatIpn: {
      length: "ІПН платника ПДВ має містити 12 цифр",
      checksum: "Помилка в ІПН: не збігається контрольна цифра",
    },
    iban: {
      country: "Український IBAN починається з UA",
      length: "IBAN має містити UA і 27 цифр",
      checksum: "Помилка в IBAN: перевірте цифри",
    },
    phone: {
      incomplete: "Номер неповний",
      invalid: "Такого номера не існує — перевірте код і цифри",
    },
  },
}

export type ErpUiMessages = typeof uk
