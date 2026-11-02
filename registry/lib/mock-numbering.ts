/**
 * Мок нумерації документів (lib/numbering, ADR-0058): серії — ресурс `numbering-series` на
 * `createResourceHandlers` (права, версія й 409, 422 шаблону, сценарії, журнал), лічильники — у пам'яті
 * моку, `GET /numbering-counters`.
 *
 * - `forResource` дає моку переходів (`createTransitionHandlers`, опція `numbering`) номер для документа,
 *   що стає проведеним. Видача синхронна: між читанням і записом лічильника немає `await`, тож два
 *   одночасні проведення отримують різні значення, як під блокуванням рядка лічильника на сервері.
 * - Номер, уже зайнятий серед документів цього типу в компанії (шаблон змінили, а потім повернули), мок
 *   пропускає й бере наступне значення. Запис документа, який не пройшов схему, лишає пропуск у
 *   лічильнику: сервер відкотив би його разом із транзакцією.
 * - Серії створює сервер: `POST` і `DELETE` серій — 405. Зміну `resource` у `PATCH` мок не відхиляє.
 * - Серії немає, сіди з хибним шаблоном чи лічильник без серії — помилка налаштування моку, а не відповідь
 *   сервера.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import type { LocalizedText } from "@/registry/lib/auth"
import {
  isCalendarDate,
  todayIn,
  type CalendarDate,
} from "@/registry/lib/dates"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import { inMockCompany, mockGrantsRecords } from "@/registry/lib/mock-scope"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
} from "@/registry/lib/mock-server"
import {
  createResourceHandlers,
  type MockRecord,
  type MockResourceDb,
} from "@/registry/lib/mocks"
import type { MockDocumentNumbering } from "@/registry/lib/mock-transitions"
import {
  counterScope,
  formatDocumentNumber,
  NUMBERING_COUNTERS,
  NUMBERING_SERIES,
  numberingTemplateIssue,
  validNumberingSeriesSchema,
  type CounterScope,
  type NumberingCounter,
  type NumberingSeries,
} from "@/registry/lib/numbering"

export interface MockNumberingSeriesSeed {
  readonly companyId: string | null
  readonly resource: string
  readonly template: string
  readonly resetYearly?: boolean
  readonly perBranch?: boolean
}

/** Скільки номерів уже видано: засів документів із номерами. */
export interface MockNumberingCounterSeed extends Partial<CounterScope> {
  readonly companyId: string | null
  readonly resource: string
  readonly value: number
}

export interface NumberingMockOptions {
  readonly series: readonly MockNumberingSeriesSeed[]
  readonly counters?: readonly MockNumberingCounterSeed[]
  /** Код філії для `{BRANCH}`: філії знають моки компанії проекту. */
  readonly branchCode?: (
    companyId: string | null,
    branchId: string,
  ) => string | undefined
  readonly label?: LocalizedText
  readonly baseUrl?: string
}

export interface MockNumberingResource {
  readonly resource: string
  /** Записи документів: у них мок шукає зайняті номери. */
  readonly db: { readonly all: () => readonly MockRecord[] }
  /** Поле номера; за замовчуванням `number`. */
  readonly field?: string
  /** Поле дати документа (`YYYY-MM-DD` чи дата й час ISO); порожнє — сьогодні. */
  readonly dateField?: string
  /** Поле філії документа; за замовчуванням `branchId`. */
  readonly branchField?: string
}

export interface NumberingMocks {
  readonly handlers: HttpHandler[]
  /** Серії: їх стан у тестах. */
  readonly db: MockResourceDb<NumberingSeries>
  /** Номер на проведенні для документів ресурсу: опція `numbering` моку переходів. */
  readonly forResource: (
    options: MockNumberingResource,
  ) => MockDocumentNumbering
  /** Серії й лічильники — до засіву. */
  readonly reset: () => void
}

/** Зайнятих номерів підряд більше — шаблон дає той самий номер для всіх значень. */
const MAX_TAKEN_IN_A_ROW = 10_000

const seriesId = (
  seed: Pick<MockNumberingSeriesSeed, "companyId" | "resource">,
) => `ns-${seed.companyId ?? "app"}-${seed.resource}`
const counterId = (series: string, scope: CounterScope) =>
  `${series}:${scope.branchId ?? "-"}:${String(scope.year ?? "-")}`

const text = (value: unknown) => (typeof value === "string" ? value : null)

/** Дата документа для року й місяця; хибне значення — помилка налаштування моку, а не «сьогодні». */
function documentDate(value: unknown, field: string): CalendarDate {
  if (value === undefined || value === null || value === "") return todayIn()
  const date = typeof value === "string" ? value.slice(0, 10) : ""
  if (!isCalendarDate(date))
    throw new Error(
      `erp-ui mock: ${field} is not a date: ${JSON.stringify(value)}`,
    )
  return date
}

function seriesRecords(
  seeds: readonly MockNumberingSeriesSeed[],
): NumberingSeries[] {
  return seeds.map((seed) => {
    const record = {
      id: seriesId(seed),
      version: 1,
      companyId: seed.companyId,
      resource: seed.resource,
      template: seed.template,
      resetYearly: seed.resetYearly ?? true,
      perBranch: seed.perBranch ?? false,
    }
    const issue = numberingTemplateIssue(record.template, record)
    if (issue)
      throw new Error(
        `erp-ui mock: numbering series ${record.id}: template ${issue}`,
      )
    return record
  })
}

export function createNumberingMocks({
  series: seeds,
  counters: counterSeeds = [],
  branchCode,
  label = { uk: "Нумерація документів", en: "Document numbering" },
  baseUrl = API_PREFIX,
}: NumberingMockOptions): NumberingMocks {
  // Хибний засів видно одразу, а не на першому запиті.
  const initial = seriesRecords(seeds)
  const series = createResourceHandlers<NumberingSeries>({
    baseUrl,
    resource: NUMBERING_SERIES,
    schema: validNumberingSeriesSchema,
    data: () => structuredClone(initial),
    searchFields: ["resource"],
    label,
    fieldLabels: {
      template: { uk: "Шаблон номера", en: "Number template" },
      resetYearly: { uk: "Щороку з 1", en: "Restart every year" },
      perBranch: { uk: "Окремо для філій", en: "Separate per branch" },
    },
    unique: [["resource"]],
  })

  const seeded = new Set(initial.map((item) => item.id))
  for (const seed of counterSeeds)
    if (!seeded.has(seriesId(seed)))
      throw new Error(
        `erp-ui mock: counter seed for ${seed.resource} has no numbering series`,
      )
  const seedCounters = () =>
    new Map(
      counterSeeds.map((seed): [string, NumberingCounter] => {
        const scope = {
          branchId: seed.branchId ?? null,
          year: seed.year ?? null,
        }
        const id = counterId(seriesId(seed), scope)
        return [id, { id, series: seriesId(seed), ...scope, value: seed.value }]
      }),
    )
  let counters: Map<string, NumberingCounter> | null = null
  const counterStore = () => (counters ??= seedCounters())

  /** Серія типу документа: своя компанії, інакше спільна (ADR-0036). */
  const seriesOf = (resource: string, companyId: string | null) => {
    const candidates = series.db
      .all()
      .filter(
        (item) =>
          item.resource === resource &&
          inMockCompany(item.companyId, companyId),
      )
    const found =
      candidates.find((item) => item.companyId === companyId) ?? candidates[0]
    if (!found)
      throw new Error(`erp-ui mock: no numbering series for ${resource}`)
    return found
  }

  /** Наступний вільний номер серії; лічильник зростає одразу, без `await` між читанням і записом. */
  function assign(
    resource: string,
    companyId: string | null,
    document: { date: CalendarDate; branchId: string | null },
    isTaken: (number: string) => boolean,
  ): string {
    const found = seriesOf(resource, companyId)
    const scope = counterScope(found, document)
    const id = counterId(found.id, scope)
    const store = counterStore()
    let value = store.get(id)?.value ?? 0
    const branch =
      document.branchId && branchCode?.(companyId, document.branchId)
    for (let skipped = 0; skipped < MAX_TAKEN_IN_A_ROW; skipped += 1) {
      value += 1
      const number = formatDocumentNumber(found.template, {
        date: document.date,
        branchCode: branch,
        value,
      })
      if (number === null)
        throw new Error(`erp-ui mock: series ${found.id} has a broken template`)
      if (!isTaken(number)) {
        store.set(id, { id, series: found.id, ...scope, value })
        return number
      }
    }
    throw new Error(`erp-ui mock: no free number in series ${found.id}`)
  }

  const forResource = ({
    resource,
    db,
    field = "number",
    dateField = "date",
    branchField = "branchId",
  }: MockNumberingResource): MockDocumentNumbering => ({
    field,
    assign: (document, companyId) =>
      assign(
        resource,
        companyId,
        {
          date: documentDate(document[dateField], dateField),
          branchId: text(document[branchField]),
        },
        (number) =>
          db
            .all()
            .some(
              (record) =>
                (record.companyId ?? null) === companyId &&
                record[field] === number,
            ),
      ),
  })

  const url = `${baseUrl}/${NUMBERING_SERIES}`
  const notAllowed = () =>
    errorResponse(405, {
      code: "method_not_allowed",
      message: "Numbering series are created by the server",
    })

  const counterHandler = http.get(
    `${baseUrl}/${NUMBERING_COUNTERS}`,
    async ({ request }) => {
      const early = await applyScenario(scenarioFor(NUMBERING_SERIES))
      if (early) return early
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const access = mockRequestPermissions(request, user)
      if (access instanceof Response) return access
      const rules = series.db.accessOf(user, access.permissions)
      if (!mockGrantsRecords(rules, "read"))
        return errorResponse(403, {
          code: "forbidden",
          message: `Missing permission ${NUMBERING_SERIES}:read`,
        })
      const wanted = new URL(request.url).searchParams.get("series")
      const visible = new Set(
        series.db.select({}, access.companyId, rules).map((item) => item.id),
      )
      const data = [...counterStore().values()].filter(
        (counter) =>
          visible.has(counter.series) &&
          (wanted === null || counter.series === wanted),
      )
      return json({ data, total: data.length })
    },
  )

  return {
    handlers: [
      counterHandler,
      http.post(url, notAllowed),
      http.delete(`${url}/:id`, notAllowed),
      ...series.handlers,
    ],
    db: series.db,
    forResource,
    reset: () => {
      series.db.reset()
      counters = null
    },
  }
}
