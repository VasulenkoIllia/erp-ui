/**
 * Ресурси мок-сервера демо: їх показує панель розробника (журнал і вебхуки — теж зі сценаріями).
 * Окремий модуль без MSW: оболонка імпортує список, не тягнучи мок-сервер у перший екран (ADR-0009).
 */
export const MOCK_RESOURCES = [
  "invoices",
  "documents",
  "quotes",
  "orders",
  "sales-invoices",
  "sales-credit-notes",
  "sales-payments",
  "sales-refunds",
  "numbering-series",
  "period-lock",
  "period-lock-exceptions",
  "trash",
  "organizations",
  "contacts",
  "segments",
  "views",
  "list-settings",
  "jobs",
  "users",
  "roles",
  "invitations",
  "audit",
  "notifications",
  "webhooks",
  "company",
  "currencies",
  "exchange-rates",
  "taxes",
  "units",
  "payment-terms",
  "tags",
  "reasons",
  "dictionary-defaults",
  "import-runs",
  "products",
  "pipeline",
  "realtime",
  "timeline",
]

/**
 * Ресурс «сервера без кошика» на сторінці кошика демо (PF16, ADR-0095): `GET /trash` для нього відповідає
 * 404, як бекенд без кошика.
 */
export const NO_TRASH_RESOURCE = "legacy-records"

/**
 * Товар компанії для картки сторінки «Кошик» (`data/products`): спільні товари змінює лише адміністратор
 * платформи (ADR-0036), а цей бухгалтер може видалити.
 */
export const TRASH_CARD_SKU = "SKU-006"
