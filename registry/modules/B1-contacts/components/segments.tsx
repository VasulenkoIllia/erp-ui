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

/**
 * Сегменти компанії за `id`: одна підписка на сторінку чи колонку, мітки рядків отримують їх
 * пропсом (кожна підписка ra-core переписує кеш записів). Поки вантажиться — `undefined`;
 * не завантажились (немає права, збій) — порожній довідник: мітки покажуть ключі.
 */
export function useSegments(): ReadonlyMap<string, Segment> | undefined {
  const companyId = useCompanyId()
  const { data, isError } = useGetList<Segment>(
    SEGMENTS,
    {
      pagination: { page: 1, perPage: SEGMENT_LIMIT },
      sort: SEGMENT_SORT,
      meta: companyScope(companyId),
    },
    { staleTime: SEGMENT_STALE_MS },
  )
  return useMemo(() => {
    if (data) return new Map(data.map((segment) => [segment.id, segment]))
    return isError ? NO_SEGMENTS : undefined
  }, [data, isError])
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
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <Badge key={id} variant="outline">
          {segments.get(id)?.name ?? id}
        </Badge>
      ))}
    </span>
  )
}
