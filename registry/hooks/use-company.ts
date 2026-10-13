/**
 * Поточна компанія і її перемикання (PF02, див. lib/company-scope).
 *
 *   const [companyId, switchCompany] = useCompany()
 *   <CompanySwitcher companies={me.companies} value={companyId ?? ""} onValueChange={switchCompany} />
 *
 * Перемикання скасовує запити, що летять, перечитує профіль (права в іншій компанії можуть бути
 * інші) і скидає дані без компанії в ключі (ресурси ra-core, права ra-core, запити проекту). Запити
 * кіта мають компанію в ключі (`companyScope`), тож їхні дані просто беруться з іншого ключа.
 * Поки новий профіль летить, `useMe` віддає права попередньої компанії; сервер однаково перевіряє
 * кожен запит.
 * Потребує `CoreAdminContext` (authProvider із lib/auth і QueryClient).
 */
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useSyncExternalStore } from "react"

import { useRefreshMe } from "@/registry/hooks/use-me"
import { ME_QUERY_KEY } from "@/registry/lib/auth"
import {
  getCompanyId,
  setCompanyId,
  subscribeCompany,
} from "@/registry/lib/company-scope"

// На сервері вибору ще немає: той самий null, що й до читання localStorage, без розбіжності гідрації.
const serverSnapshot = () => null

export function useCompanyId(): string | null {
  return useSyncExternalStore(subscribeCompany, getCompanyId, serverSnapshot)
}

export function useCompany(): [string | null, (id: string) => void] {
  const companyId = useCompanyId()
  const queryClient = useQueryClient()
  const refreshMe = useRefreshMe()
  const switchCompany = useCallback(
    (id: string) => {
      if (id === getCompanyId()) return
      void queryClient.cancelQueries()
      setCompanyId(id)
      // Профіль — до скидання (refreshMe синхронно забуває кеш authProvider): скинуті запити прав
      // ra-core перечитують його через getMe, і старий профіль дав би їм права попередньої компанії.
      const refreshed = refreshMe()
      // Ключі кіта починаються з "erp-ui" і мають компанію (або належать користувачу); решта —
      // дані попередньої компанії: скидаємо, щоб не показати їх як дані нової.
      void queryClient.resetQueries({
        predicate: (query) => query.queryKey[0] !== "erp-ui",
      })
      // Збій оновлення профілю не заважає перемиканню: useMe перезапитає профіль сам, і помилка
      // (зокрема 401) піде звичним шляхом.
      void refreshed.catch(() =>
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      )
    },
    [queryClient, refreshMe],
  )
  return [companyId, switchCompany]
}
