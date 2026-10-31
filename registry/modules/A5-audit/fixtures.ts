/**
 * Демо-дані модуля A5 (SPEC §17): історія одного договору для кожної компанії, щоб журнал і шухляда
 * показували різницю тексту, числа й списку без дій у застосунку. Час — відносно зараз.
 */
import type { MockAuditEvent } from "@/lib/mock-audit"

export interface AuditFixtureOptions {
  /** Компанії застосунку; за замовчуванням — один спільний набір (`null`, застосунок без компаній). */
  readonly companies?: readonly (string | null)[]
}

const HOUR_MS = 60 * 60 * 1000

const CONTRACTS = "contracts"
const UPDATED = { uk: "Договори: зміна", en: "Contracts: updated" }
const CREATED = { uk: "Договори: створення", en: "Contracts: created" }
const ACTOR = {
  type: "user",
  id: "fixture-manager",
  name: "Олена Коваль",
} as const

const SUBJECT = { uk: "Предмет договору", en: "Subject" }
const AMOUNT = { uk: "Сума, грн", en: "Amount, UAH" }
const TAGS = { uk: "Мітки", en: "Tags" }
const STATUS = { uk: "Статус", en: "Status" }
const SIGNED = { uk: "Підписано", en: "Signed" }

/** Події договору: від нових до старих. */
function contractEvents(company: string | null, now: number): MockAuditEvent[] {
  const key = company ?? "shared"
  const target = {
    type: CONTRACTS,
    id: `${key}-contract-12`,
    name: "Договір 12/2026",
  }
  const event = (
    suffix: string,
    hoursAgo: number,
    rest: Pick<MockAuditEvent, "action" | "actionLabel"> &
      Partial<MockAuditEvent>,
  ): MockAuditEvent => ({
    id: `aud-${key}-contract-${suffix}`,
    at: new Date(now - hoursAgo * HOUR_MS).toISOString(),
    category: "data",
    actor: ACTOR,
    target,
    ...(company ? { companyId: company } : {}),
    ...rest,
  })
  return [
    event("terms", 5, {
      action: "contracts.updated",
      actionLabel: UPDATED,
      reason: "Уточнили обсяг із клієнтом",
      changes: [
        {
          field: "subject",
          label: SUBJECT,
          from: "Постачання стелажів для складу у Львові",
          to: "Постачання стелажів і візків для складу у Львові та Києві",
        },
        { field: "amount", label: AMOUNT, from: 120000, to: 148500 },
        {
          field: "tags",
          label: TAGS,
          from: ["склад", "опт"],
          to: ["склад", "опт", "пріоритет"],
        },
      ],
    }),
    event("signed", 30, {
      action: "contracts.updated",
      actionLabel: UPDATED,
      changes: [
        { field: "status", label: STATUS, from: "Чернетка", to: "Підписано" },
        { field: "signed", label: SIGNED, from: false, to: true },
      ],
    }),
    event("created", 54, {
      action: "contracts.created",
      actionLabel: CREATED,
      changes: [
        {
          field: "subject",
          label: SUBJECT,
          from: null,
          to: "Постачання стелажів для складу у Львові",
        },
      ],
    }),
  ]
}

export function createAuditFixtures({
  companies = [null],
}: AuditFixtureOptions = {}): MockAuditEvent[] {
  const now = Date.now()
  return companies.flatMap((company) => contractEvents(company, now))
}
