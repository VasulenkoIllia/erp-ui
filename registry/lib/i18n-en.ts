/**
 * Рядки кіта erp-ui англійською — ті самі ключі, що в `i18n-uk.ts`.
 * Форми множини англійською — лише `_one/_other`.
 */
import type { ErpUiMessages } from "@/registry/lib/i18n-uk"

export const en = {
  common: {
    close: "Close",
    loading: "Loading",
    table: "Table",
  },
  phone: {
    country: "Country",
    otherCountries: "Other countries",
  },
  validation: {
    edrpou: {
      length: "EDRPOU code must have 8 digits",
      checksum: "EDRPOU code is invalid: the check digit does not match",
    },
    rnokpp: {
      length: "RNOKPP must have 10 digits",
      checksum: "RNOKPP is invalid: the check digit does not match",
    },
    vatIpn: {
      length: "VAT number must have 12 digits",
      checksum: "VAT number is invalid: the check digit does not match",
    },
    iban: {
      country: "A Ukrainian IBAN starts with UA",
      length: "IBAN must have UA and 27 digits",
      checksum: "IBAN is invalid: check the digits",
    },
    phone: {
      incomplete: "The number is incomplete",
      invalid: "This number does not exist — check the code and digits",
    },
  },
} satisfies ErpUiMessages
