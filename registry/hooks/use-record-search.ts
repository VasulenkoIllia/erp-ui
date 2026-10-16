"use client"

import * as React from "react"
import { keepPreviousData } from "@tanstack/react-query"
import { useGetList, useGetOne, type RaRecord, type SortPayload } from "ra-core"

import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import type { ListFilter } from "@/registry/lib/list-state"

/**
 * Дані вибору запису (UI40, ADR-0023): пошук на сервері й запис поточного значення.
 *
 * - `useRecordSearch` — перша сторінка `getList` ресурсу з пошуком `q` (SPEC §17), поки список
 *   відкрито; запит чекає паузу після останньої літери, попередні варіанти лишаються видимими.
 * - `useRecordById` — запис значення для підпису поля: щойно вибраний — без запиту, інакше `getOne`.
 */

/** Пауза після останньої літери — як у пошуку FilterBar. */
export const RECORD_SEARCH_DEBOUNCE_MS = 300
/** Скільки варіантів показує список; решту знаходить уточнений пошук. */
export const RECORD_SEARCH_LIMIT = 20

export interface RecordSearchOptions {
  resource: string
  /** Текст поля пошуку як є: пробіли з країв не йдуть у запит. */
  query: string
  /** Постійні умови списку: лише активні, лише клієнти. */
  filter?: ListFilter
  sort?: SortPayload
  perPage?: number
  /** Шукати лише тоді, коли список відкрито. */
  enabled: boolean
}

export interface RecordSearch<T> {
  records: readonly T[]
  /** Скільки всього збігів на сервері: більше за `records` — підказка уточнити пошук. */
  total: number
  /** Перших варіантів ще немає. */
  isPending: boolean
  /** Чекаємо паузу чи відповідь, а на екрані — попередні варіанти. */
  isSearching: boolean
  /** Показані варіанти — не для тексту поля пошуку: пауза ще йде чи відповідь на новий текст не прийшла. */
  isStale: boolean
  error: unknown
  retry: () => void
  /** Текст, за яким шукали; варіанти — його, коли `isStale` немає. */
  query: string
}

const NO_FILTER: ListFilter = {}
const NO_RECORDS: readonly never[] = []

export function useRecordSearch<T extends RaRecord>({
  resource,
  query,
  filter = NO_FILTER,
  sort,
  perPage = RECORD_SEARCH_LIMIT,
  enabled,
}: RecordSearchOptions): RecordSearch<T> {
  const companyId = useCompanyId()
  const typed = query.trim()
  const debounced = useDebouncedValue(typed, RECORD_SEARCH_DEBOUNCE_MS)
  // Порожній пошук (стерли текст, список відкрили знову) — одразу, без паузи.
  const q = typed ? debounced : ""
  const {
    data,
    total,
    isPending,
    isFetching,
    isPlaceholderData,
    error,
    refetch,
  } = useGetList<T>(
    resource,
    {
      pagination: { page: 1, perPage },
      sort,
      filter: q ? { ...filter, q } : filter,
      meta: companyScope(companyId),
    },
    { enabled, placeholderData: keepPreviousData },
  )
  return {
    records: data ?? NO_RECORDS,
    total: total ?? data?.length ?? 0,
    isPending: enabled && isPending,
    isSearching: enabled && (isFetching || q !== typed),
    isStale: enabled && (q !== typed || isPlaceholderData),
    error,
    retry: () => {
      void refetch()
    },
    query: q,
  }
}

export interface RecordById<T> {
  record: T | null
  isPending: boolean
  /** Запису немає (видалили) — 404. */
  isMissing: boolean
  error: unknown
}

/**
 * Запис значення поля; `known` — щойно вибраний чи створений запис, тоді без запиту. Порожній рядок
 * (типове значення форми) — так само, як `null`: значення немає.
 */
export function useRecordById<T extends RaRecord>(
  resource: string,
  id: string | null,
  known: T | null,
): RecordById<T> {
  const companyId = useCompanyId()
  const isKnown = known !== null && String(known.id) === id
  const { data, isPending, error } = useGetOne<T>(
    resource,
    { id: id ?? "", meta: companyScope(companyId) },
    { enabled: Boolean(id) && !isKnown },
  )
  if (!id)
    return { record: null, isPending: false, isMissing: false, error: null }
  if (isKnown)
    return { record: known, isPending: false, isMissing: false, error: null }
  return {
    record: data ?? null,
    isPending: isPending && !error,
    isMissing: isApiError(error) && error.status === 404,
    error,
  }
}

/** Значення, що змінилось `delayMs` тому й більше не змінювалось. */
function useDebouncedValue(value: string, delayMs: number): string {
  const [settled, setSettled] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  return settled
}
