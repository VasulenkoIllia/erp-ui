import { useGetList } from "ra-core"
import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"
import type { FilterDefinition } from "@/lib/filters"

import { SEGMENTS, type Segment } from "../contract"

/** Довідник сегментів невеликий: увесь однією сторінкою. */
const SEGMENT_LIMIT = 100
const SEGMENT_SORT = { field: "name", order: "ASC" } as const
/** Сегменти міняються рідко: не перечитувати на кожну картку й список. */
const SEGMENT_STALE_MS = 5 * 60_000

const NO_SEGMENTS: ReadonlyMap<string, Segment> = new Map()

/** Довідник сегментів компанії: той самий запит у списках, картках і формах. */
function useSegmentList() {
  const companyId = useCompanyId()
  return useGetList<Segment>(
    SEGMENTS,
    {
      pagination: { page: 1, perPage: SEGMENT_LIMIT },
      sort: SEGMENT_SORT,
      meta: companyScope(companyId),
    },
    { staleTime: SEGMENT_STALE_MS },
  )
}

/**
 * Сегменти компанії за `id`: одна підписка на сторінку чи колонку, мітки рядків отримують їх
 * пропсом (кожна підписка ra-core переписує кеш записів). Поки вантажиться — `undefined`;
 * не завантажились (немає права, збій) — порожній довідник: мітки покажуть ключі.
 */
export function useSegments(): ReadonlyMap<string, Segment> | undefined {
  const { data, isError } = useSegmentList()
  return useMemo(() => {
    if (data) return new Map(data.map((segment) => [segment.id, segment]))
    return isError ? NO_SEGMENTS : undefined
  }, [data, isError])
}

/**
 * Варіанти сегментів для мультивибору у формі (ADR-0027): поки вантажиться — `undefined`; не
 * завантажились — причина й повтор у списку поля.
 */
export function useSegmentOptions() {
  const { data, error, refetch } = useSegmentList()
  const options = useMemo(
    () => data?.map((segment) => ({ value: segment.id, label: segment.name })),
    [data],
  )
  // Збій фонового перечитування не ховає довідник, який уже є: стан помилки — лише без даних.
  return {
    options,
    error: data ? undefined : (error ?? undefined),
    retry: () => {
      void refetch()
    },
  }
}

/** Фільтр «Сегменти» — «хоч один із» вибраних; варіанти — з довідника. */
export function useSegmentFilter(label: string) {
  const segments = useSegments()
  return useMemo(
    () =>
      ({
        kind: "options",
        id: "segments",
        field: "segments",
        label,
        options: [...(segments?.values() ?? [])].map((segment) => ({
          value: segment.id,
          label: segment.name,
        })),
      }) satisfies FilterDefinition,
    [segments, label],
  )
}

/**
 * Сегменти запису в картці під реквізитами: підпис і мітки; без сегментів — нічого. Поки довідник
 * вантажиться — теж нічого: підпис без міток виглядав би як порожнє поле.
 */
export function RecordSegments({
  label,
  ids,
}: {
  label: string
  ids: readonly string[]
}) {
  const segments = useSegments()
  if (!ids.length || !segments) return null
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <SegmentBadges ids={ids} segments={segments} />
    </div>
  )
}

/**
 * Сегменти запису мітками; без сегментів — «—» (SPEC §8.1). Поки довідник вантажиться — нічого
 * (без миготіння ключів); сегмента немає в довіднику (видалили, не завантажився) — ключ як є.
 */
export function SegmentBadges({
  ids,
  segments,
}: {
  ids: readonly string[]
  segments: ReadonlyMap<string, Segment> | undefined
}) {
  if (!ids.length) return <span className="text-muted-foreground">—</span>
  if (!segments) return null
  // Довга назва в колонці таблиці обрізається трикрапкою, а не налазить на сусідню колонку.
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {ids.map((id) => {
        const name = segments.get(id)?.name ?? id
        return (
          <Badge
            key={id}
            variant="outline"
            className="max-w-full min-w-0 shrink"
            title={name}
          >
            <span className="truncate">{name}</span>
          </Badge>
        )
      })}
    </span>
  )
}
