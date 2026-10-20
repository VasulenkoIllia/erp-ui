import { useQueryClient } from "@tanstack/react-query"
import { useDataProvider, useGetList, type GetListResult } from "ra-core"

import {
  SAVED_VIEWS_PER_PAGE,
  SAVED_VIEWS_RESOURCE,
  upsertView,
  type SavedView,
  type SavedViewInput,
} from "@/registry/lib/saved-views"

/**
 * Особисті збережені види ресурсу з `/me/views` і зміни в них (PF11, ADR-0017).
 *
 * - Зміна одразу потрапляє в кеш (вид, на який переходять після збереження, уже в списку), далі
 *   список перечитується з сервера; не вдалося перечитати — лишається кеш.
 * - Будь-яка помилка зміни (зокрема 409: вид змінили в іншій вкладці) перечитує список: наступна
 *   спроба — з новою версією. Помилка йде далі, до форми чи сповіщення.
 * - Запит видів не повторюється: список, що чекає на вид за замовчуванням, не стоїть на скелетоні,
 *   поки йдуть повтори; меню пропонує «Спробувати ще».
 */
export interface SavedViewsApi {
  views: readonly SavedView[] | undefined
  isPending: boolean
  error: unknown
  refetch: () => void
  create: (input: SavedViewInput) => Promise<SavedView>
  update: (
    view: SavedView,
    changes: Partial<SavedViewInput>,
  ) => Promise<SavedView>
  remove: (view: SavedView) => Promise<void>
}

export function useSavedViews(resource: string): SavedViewsApi {
  const dataProvider = useDataProvider()
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = useGetList<SavedView>(
    SAVED_VIEWS_RESOURCE,
    {
      filter: { resource },
      pagination: { page: 1, perPage: SAVED_VIEWS_PER_PAGE },
      sort: { field: "name", order: "ASC" },
    },
    { retry: false },
  )
  const listKey = [SAVED_VIEWS_RESOURCE, "getList", { filter: { resource } }]
  const sync = async (change: (views: SavedView[]) => SavedView[]) => {
    queryClient.setQueriesData<GetListResult<SavedView>>(
      { queryKey: listKey },
      (old) => {
        if (!old) return old
        const next = change(old.data)
        const total =
          (old.total ?? old.data.length) + next.length - old.data.length
        return { ...old, data: next, total }
      },
    )
    await queryClient.refetchQueries({ queryKey: listKey })
  }
  const failed = (cause: unknown): never => {
    void refetch()
    throw cause
  }
  return {
    views: data,
    isPending,
    error,
    refetch: () => {
      void refetch()
    },
    create: async (input) => {
      const { data: view } = await dataProvider
        .create<SavedView>(SAVED_VIEWS_RESOURCE, { data: input })
        .catch(failed)
      await sync((views) => upsertView(views, view))
      return view
    },
    update: async (view, changes) => {
      const { data: updated } = await dataProvider
        .update<SavedView>(SAVED_VIEWS_RESOURCE, {
          id: view.id,
          data: { ...view, ...changes },
          previousData: view,
        })
        .catch(failed)
      await sync((views) => upsertView(views, updated))
      return updated
    },
    remove: async (view) => {
      await dataProvider
        .delete<SavedView>(SAVED_VIEWS_RESOURCE, {
          id: view.id,
          previousData: view,
        })
        .catch(failed)
      await sync((views) => views.filter((other) => other.id !== view.id))
    },
  }
}
