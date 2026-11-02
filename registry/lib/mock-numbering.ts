/**
 * Мок нумерації документів (lib/numbering, ADR-0058): серії — ресурс `numbering-series` на
 * `createResourceHandlers` (права, версія й 409, сценарії, журнал), лічильники — у пам'яті моку,
 * `GET /numbering-counters`.
 *
 * - `forResource` дає мок переходів (`createTransitionHandlers`, опція `numbering`) номер для документа,
 *   що стає проведеним. Видача синхронна: між читанням і записом лічильника немає `await`, тож два
 *   одночасні проведення отримують різні значення, як під блокуванням рядка лічильника на сервері.
 * - Номер, уже зайнятий у компанії (шаблон змінили, а потім повернули), мок пропускає й бере наступне
 *   значення.
 * - Серії немає — помилка налаштування моку, а не відповідь сервера: справжній сервер створює серію
 *   на кожен тип документа сам.
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
import { mockGrantsRecords } from "@/registry/lib/mock-scope"
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
import {
  counterScope,
  formatDocumentNumber,
  NUMBERING_COUNTERS,
  NUMBERING_SERIES,
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

/** Номер для документа, що стає проведеним: поле й значення (`createTransitionHandlers`). */
export interface MockDocumentNumbering {
  readonly field: string
  readonly assign: (
    document: Readonly<Record<string, unknown>>,
    companyId: string | null,
  ) => string
}

export interface MockNumberingResource<T extends MockRecord> {
  readonly resource: string
  readonly db: MockResourceDb<T>
  /** Поле номера; за замовчуванням `number`. */
  readonly field?: string
  /** Поле дати документа (`CalendarDate`); немає — сьогодні. */
  readonly dateField?: string
  /** Поле філії документа; за замовчуванням `branchId`. */
  readonly branchField?: string
}

/** Зайнятих номерів підряд більше — шаблон дає той самий номер для всіх значень. */
const MAX_TAKEN_IN_A_ROW = 10_000

const seriesId = (
  seed: Pick<MockNumberingSeriesSeed, "companyId" | "resource">,
) => `ns-${seed.companyId ?? "app"}-${seed.resource}`
const counterId = (series: string, scope: CounterScope) =>
  `${series}:${scope.branchId ?? "-"}:${String(scope.year ?? "-")}`

const text = (value: unknown) => (typeof value === "string" ? value : null)

export function createNumberingMocks({
  series: seeds,
  counters: counterSeeds = [],
  branchCode,
  label = { uk: "Нумерація документів", en: "Document numbering" },
  baseUrl = API_PREFIX,
}: NumberingMockOptions) {
  const series = createResourceHandlers<NumberingSeries>({
    baseUrl,
    resource: NUMBERING_SERIES,
    schema: validNumberingSeriesSchema,
    data: () =>
      seeds.map((seed) => ({
        id: seriesId(seed),
        version: 1,
        companyId: seed.companyId,
        resource: seed.resource,
        template: seed.template,
        resetYearly: seed.resetYearly ?? true,
        perBranch: seed.perBranch ?? false,
      })),
    searchFields: ["resource"],
    label,
    fieldLabels: {
      template: { uk: "Шаблон номера", en: "Number template" },
      resetYearly: { uk: "Щороку з 1", en: "Restart every year" },
      perBranch: { uk: "Окремо для філій", en: "Separate per branch" },
    },
    unique: [["resource"]],
  })

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

  const seriesOf = (resource: string, companyId: string | null) => {
    const found = series.db
      .all()
      .find(
        (item) =>
          item.resource === resource && (item.companyId ?? null) === companyId,
      )
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
      if (number === null) break
      if (!isTaken(number)) {
        store.set(id, { id, series: found.id, ...scope, value })
        return number
      }
    }
    throw new Error(`erp-ui mock: no free number in series ${found.id}`)
  }

  function forResource<T extends MockRecord>({
    resource,
    db,
    field = "number",
    dateField = "date",
    branchField = "branchId",
  }: MockNumberingResource<T>): MockDocumentNumbering {
    return {
      field,
      assign: (document, companyId) => {
        const date = document[dateField]
        return assign(
          resource,
          companyId,
          {
            date: isCalendarDate(date) ? date : todayIn(),
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
        )
      },
    }
  }

  const counterHandler = http.get(
    `${baseUrl}/${NUMBERING_COUNTERS}`,
    async ({ request }) => {
      const early = await applyScenario(scenarioFor(NUMBERING_SERIES))
      if (early) return early
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const access = mockRequestPermissions(request, user)
      if (access instanceof Response) return access
      if (
        !mockGrantsRecords(series.db.accessOf(user, access.permissions), "read")
      )
        return errorResponse(403, {
          code: "forbidden",
          message: `Missing permission ${NUMBERING_SERIES}:read`,
        })
      const wanted = new URL(request.url).searchParams.get("series")
      const visible = new Set(
        series.db
          .all()
          .filter((item) => (item.companyId ?? null) === access.companyId)
          .map((item) => item.id),
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
    handlers: [counterHandler, ...series.handlers] as HttpHandler[],
    db: series.db,
    forResource,
    reset: () => {
      series.db.reset()
      counters = null
    },
  }
}
