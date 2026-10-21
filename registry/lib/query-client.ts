/**
 * QueryClient застосунку з політикою кіта (крок 1.9, ADR-0029): один для ra-core, `useMe` і
 * запитів сторінок.
 *
 * - Читання, що впало через мережу (`offline`, тайм-аут) чи 5xx, повторюється один раз через
 *   секунду: короткий збій не показує людині помилку. Далі — стан помилки з «Спробувати ще».
 * - Браузер уже знає, що мережі немає, — без повтору: повтор TanStack Query став би на паузу до
 *   повернення мережі, і людина бачила б спінер замість стану «Немає з'єднання».
 * - 4xx не повторюється ніколи: 401 одразу доходить до `SessionGuard` (вихід без затримки), а 403,
 *   404, 409, 422 і 429 повтор не виправить.
 * - Зміни (мутації) не повторюються: без ключа ідемпотентності повтор може записати двічі. І не
 *   стають на паузу без мережі (`networkMode: "always"`): одразу помилка, а не «Зберегти», що
 *   крутиться, і запис пізніше без відома людини.
 *
 *   export const queryClient = createQueryClient()
 *   <CoreAdminContext queryClient={queryClient} …>
 */
import { onlineManager, QueryClient } from "@tanstack/react-query"

import { isApiError } from "@/registry/lib/api"

/** Скільки разів повторити читання після тимчасового збою. */
const QUERY_RETRIES = 1
/** Пауза перед повтором читання. */
const QUERY_RETRY_DELAY_MS = 1000
/** Скільки дані вважаються свіжими: повторний візит на сторінку не смикає сервер. */
const QUERY_STALE_TIME_MS = 30_000

/** Тимчасовий збій, який має сенс повторити: мережа, тайм-аут чи помилка сервера. */
function isTransientError(error: unknown): boolean {
  return isApiError(error) && (error.code === "offline" || error.status >= 500)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          failureCount < QUERY_RETRIES &&
          isTransientError(error) &&
          onlineManager.isOnline(),
        retryDelay: QUERY_RETRY_DELAY_MS,
        staleTime: QUERY_STALE_TIME_MS,
      },
      mutations: { retry: false, networkMode: "always" },
    },
  })
}
