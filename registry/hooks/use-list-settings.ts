import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDataProvider } from "ra-core"

import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  LIST_SETTINGS_PATH,
  pickPerPage,
  type ListSettings,
} from "@/registry/lib/list-settings"

/**
 * Запам'ятаний розмір сторінки списку (`mode: "pages"` шаблону List Report) в особистих
 * налаштуваннях `/me/list-settings/<ресурс>` (lib/list-settings, ADR-0024).
 *
 * - Поки налаштування вантажаться, `isReady` — false: список чекає, щоб не просити сторінку двічі
 *   (спершу по 20, потім по 50). Запит без повторів і з межею часу (`LIST_SETTINGS_TIMEOUT_MS`):
 *   помилка чи сервер, що мовчить, — типовий розмір.
 * - Ключ кешу — з `"erp-ui"`: налаштування не залежать від компанії, і зміна компанії їх не скидає
 *   (hooks/use-company).
 * - Вибір одразу діє на цій сторінці (кеш), далі зберігається на сервері. Не вдалося зберегти —
 *   розмір діє до перезавантаження, як і вподобання вигляду (lib/preferences): помилку не
 *   показуємо, бо список працює.
 * - Протягом сесії налаштування не перечитуються: зміна з іншого пристрою діє після
 *   перезавантаження сторінки.
 */
export interface RememberedPerPage {
  perPage: number
  setPerPage: (perPage: number) => void
  isReady: boolean
}

export const listSettingsKey = (resource: string) =>
  ["erp-ui", LIST_SETTINGS_PATH, resource] as const

export function useRememberedPerPage(
  resource: string,
  {
    fallback,
    options,
    enabled = true,
  }: {
    /** Розмір, поки нічого не збережено чи збережене не з `options`. */
    fallback: number
    options: readonly number[]
    /** false — не запам'ятовувати: завжди `fallback`, без запитів. */
    enabled?: boolean
  },
): RememberedPerPage {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const queryClient = useQueryClient()
  // Збереження по черзі: два швидкі вибори інакше могли б дійти до сервера в іншому порядку.
  const saving = React.useRef<Promise<void>>(Promise.resolve())
  const key = listSettingsKey(resource)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => dataProvider.getListSettings(resource, { signal }),
    enabled,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
  return {
    perPage: enabled
      ? pickPerPage(query.data?.perPage, options, fallback)
      : fallback,
    isReady: !enabled || !query.isPending,
    setPerPage: (perPage) => {
      if (!enabled) return
      queryClient.setQueryData<ListSettings>(key, (old) => ({
        ...old,
        perPage,
      }))
      saving.current = saving.current.then(() =>
        dataProvider.saveListSettings(resource, { perPage }).then(
          (saved) => {
            // Поки летів запит, людина могла вибрати інший розмір — свіжіший вибір лишається.
            queryClient.setQueryData<ListSettings>(key, (old) =>
              old?.perPage === perPage ? saved : old,
            )
          },
          () => {
            // Не збереглось — вибір діє до перезавантаження; список від цього не страждає.
          },
        ),
      )
    },
  }
}
