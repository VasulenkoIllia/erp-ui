import "i18next"

import type { ErpUiMessages } from "@/registry/lib/i18n-uk"

import type uk from "./uk.json"

// Типізовані ключі t() у демо: простір `demo` за замовчуванням і `erp-ui` кіта.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "demo"
    resources: {
      demo: typeof uk
      "erp-ui": ErpUiMessages
    }
  }
}
