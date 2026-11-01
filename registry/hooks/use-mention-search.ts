import { useDataProvider, type RaRecord } from "ra-core"
import { useCallback } from "react"

import { MENTION_FETCHED } from "@/registry/lib/mention-menu"
import type { MentionSearch } from "@/registry/lib/rich-text"

/** Запис довідника людей (ADR-0030); `status` бачить лише той, хто має `users:read`. */
type MentionRecord = RaRecord<string> & {
  name?: string
  email?: string
  status?: string
}

/**
 * Пошук колег для згадки (UI12, ADR-0052) у довіднику `users`: його бачить кожен у компанії, навіть без
 * `users:read`, тож згадувати може кожен, хто бачить запис. Без права сервер уже віддає лише активних.
 * З правом приходять усі, а фільтр `status` тут не підходить, бо без права він дає 403, тому
 * заблокованих прибирає браузер.
 */
export function useMentionSearch(resource = "users"): MentionSearch {
  const dataProvider = useDataProvider()
  return useCallback(
    async (query, signal) => {
      const { data } = await dataProvider.getList<MentionRecord>(resource, {
        pagination: { page: 1, perPage: MENTION_FETCHED },
        sort: { field: "name", order: "ASC" },
        filter: query ? { q: query } : {},
        signal,
      })
      return data
        .filter((person) => !person.status || person.status === "active")
        .map((person) => ({
          id: String(person.id),
          label: person.name ?? String(person.id),
          hint: person.email,
        }))
    },
    [dataProvider, resource],
  )
}
