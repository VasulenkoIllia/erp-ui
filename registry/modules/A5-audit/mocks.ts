/**
 * Моки модуля A5 (ADR-0013, ADR-0036, ADR-0045). Журнал віддають моки платформи (`lib/mock-audit`),
 * модуль їх не дублює: він дає лише початкові події для `auditSeeds`.
 *
 *   const audit = createAuditMocks({ companies: ["zoriana"] })
 *   setupWorker(...createPlatformHandlers({ auditSeeds: audit.seeds }))
 *
 * Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурс `audit`
 * (`lib/mock-scenarios`, панель розробника) на обох адресах журналу. `empty` дає порожній список і CSV
 * із самою шапкою. Журнал лише читається, тож `conflict` працює як `success`.
 */
import { createAuditFixtures, type AuditFixtureOptions } from "./fixtures"

export type AuditMocksOptions = AuditFixtureOptions

export function createAuditMocks({ companies }: AuditMocksOptions = {}) {
  return { seeds: createAuditFixtures({ companies }) }
}
