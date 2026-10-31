/**
 * Контракт модуля A5 «Аудит та історія» (SPEC §14, §17; ADR-0013, ADR-0036, ADR-0045).
 *
 * Модуль нових адрес не додає: журнал — контракт `lib/audit`, під `/api/v1`, право `audit:read`, у
 * межах компанії запиту (`X-Company-Id`):
 *
 * - `GET /audit-events` → `{ data, total }`, новіші першими; плоскі фільтри `q`, `category` (кілька),
 *   `action`, `actorId`, `targetType`, `targetId`, `at_gte`, `at_lte`, сторінки `page`, `perPage`.
 * - `GET /audit-events/export` з тими самими фільтрами → CSV (UTF-8 з BOM), усі події без сторінок.
 * - Журнал лише читається, пише його сервер: `POST`, `PATCH` і `DELETE` немає.
 * - Шухляда історії запису — ті самі події з `targetType` і `targetId`.
 * - `changes[].from` і `to` — рядок, число, так чи ні, `null` або список рядків чи чисел. Різницю за
 *   словами кіт рахує сам (`lib/value-diff`), сервер лише віддає обидва значення.
 */
export { AUDIT, AUDIT_RESOURCES } from "./resources"
export {
  AUDIT_CATEGORIES,
  auditEventSchema,
  type AuditEvent,
  type AuditFilter,
  type AuditTarget,
  type AuditValue,
} from "@/lib/audit"
