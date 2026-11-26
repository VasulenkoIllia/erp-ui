import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDataProvider } from "@/registry/lib/ra-core"

import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  LIST_SETTINGS_PATH,
  pickPerPage,
  type ListSettings,
  type ListSettingsPatch,
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
  const { query, save } = useListSettings(resource, enabled)
  return {
    perPage: enabled
      ? pickPerPage(query.data?.perPage, options, fallback)
      : fallback,
    isReady: !enabled || !query.isPending,
    setPerPage: (perPage) => {
      if (enabled) save({ perPage })
    },
  }
}

/**
 * Згорнуті колонки дошки (templates/board, ADR-0100) в тих самих особистих налаштуваннях списку.
 * Нічого не збережено (чи сервер поля не знає) — колонки, які згортає модуль (`defaults`); перший вибір
 * людини зберігає весь набір, тож розгорнута колонка модуля лишається розгорнутою. Збій читання чи
 * збереження — як у розміру сторінки: діє вибір модуля чи свій до перезавантаження.
 */
export interface CollapsedColumns {
  collapsed: ReadonlySet<string>
  setCollapsed: (column: string, collapsed: boolean) => void
  isReady: boolean
}

export function useCollapsedColumns(
  resource: string,
  defaults: readonly string[],
): CollapsedColumns {
  const { query, save } = useListSettings(resource, true)
  const saved = query.data?.collapsedColumns
  const current = saved ?? defaults
  const collapsed = React.useMemo(() => new Set(current), [current])
  return {
    collapsed,
    isReady: !query.isPending,
    setCollapsed: (column, isCollapsed) => {
      if (collapsed.has(column) === isCollapsed) return
      save({
        collapsedColumns: isCollapsed
          ? [...current, column]
          : current.filter((id) => id !== column),
      })
    },
  }
}

/**
 * Налаштування списку з кешу й збереження по черзі: два швидкі вибори інакше могли б дійти до сервера в
 * іншому порядку. Вибір одразу діє (кеш); відповідь сервера лягає в кеш, лише коли людина за цей час не
 * вибрала інше в тих самих полях, і лише в ці поля: таблиця й дошка того самого ресурсу мають кожна свою
 * чергу, і відповідь на розмір сторінки не має затирати щойно згорнуту колонку. Поля, якого сервер не
 * знає (старий сервер без `collapsedColumns`), у відповіді немає — вибір діє до перезавантаження.
 */
function useListSettings(resource: string, enabled: boolean) {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const queryClient = useQueryClient()
  const saving = React.useRef<Promise<void>>(Promise.resolve())
  const key = listSettingsKey(resource)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => dataProvider.getListSettings(resource, { signal }),
    enabled,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const save = (patch: ListSettingsPatch) => {
    queryClient.setQueryData<ListSettings>(key, (old) => ({
      perPage: null,
      ...old,
      ...patch,
    }))
    saving.current = saving.current.then(() =>
      dataProvider.saveListSettings(resource, patch).then(
        (saved) => {
          queryClient.setQueryData<ListSettings>(key, (old) =>
            old && isUnchanged(old, patch)
              ? { ...old, ...savedFields(saved, patch) }
              : old,
          )
        },
        () => {
          // Не збереглось — вибір діє до перезавантаження; список від цього не страждає.
        },
      ),
    )
  }
  return { query, save }
}

/** Із відповіді сервера — лише збережені поля, які він знає. */
const savedFields = (saved: ListSettings, patch: ListSettingsPatch) =>
  Object.fromEntries(
    Object.keys(patch)
      .filter((field) => saved[field as keyof ListSettings] !== undefined)
      .map((field) => [field, saved[field as keyof ListSettings]]),
  ) as ListSettingsPatch

/** Поля `patch` у кеші ті самі, що й під час збереження: людина за цей час не вибрала іншого. */
const isUnchanged = (settings: ListSettings, patch: ListSettingsPatch) =>
  (Object.keys(patch) as (keyof ListSettingsPatch)[]).every(
    (field) => JSON.stringify(settings[field]) === JSON.stringify(patch[field]),
  )
