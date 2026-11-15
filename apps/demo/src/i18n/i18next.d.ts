import "i18next"

import type { ErpUiMessages } from "@/registry/lib/i18n-uk"

import type * as pages from "./pages"
import type uk from "./uk.json"

type UnionToIntersection<U> = (
  U extends unknown ? (part: U) => void : never
) extends (part: infer I) => void
  ? I
  : never

/** Усі рядки демо: шапка (`uk.json`) і сторінки (`pages.ts`, ADR-0094) — ключі ті самі, що без поділу. */
type DemoMessages = typeof uk &
  UnionToIntersection<(typeof pages)[keyof typeof pages]>

// Типізовані ключі t() у демо: простір `demo` за замовчуванням і `erp-ui` кіта.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "demo"
    resources: {
      demo: DemoMessages
      "erp-ui": ErpUiMessages
    }
  }
}
