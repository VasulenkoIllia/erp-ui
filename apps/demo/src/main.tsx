import { CoreAdminContext } from "ra-core"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { isApiError } from "@/registry/lib/api"
import {
  getAppearance,
  initAppearance,
  syncLanguage,
} from "@/registry/lib/appearance"
import { ME_QUERY_KEY } from "@/registry/lib/auth"
import { whenI18nReady } from "@/registry/lib/i18n"

import { App } from "@/App"
import {
  authProvider,
  createI18nProvider,
  dataProvider,
  queryClient,
} from "@/data/providers"
import { createDemoI18n } from "@/i18n"
import { DevPanel, ImpersonationBanner, preloadPage } from "@/pages/lazy-pages"

import "@/styles/globals.css"

/** Скільки найдовше чекати чанк смуги «Увійти як…» перед першим кадром. */
const BANNER_WAIT_MS = 3000

async function bootstrap() {
  initAppearance()
  const i18n = createDemoI18n(getAppearance().language)
  syncLanguage(i18n)

  // Чанк сторінки за адресою (HashRouter: #/settings/users) — паралельно з мок-сервером, а не після.
  preloadPage(window.location.hash.slice(1) || "/")
  void DevPanel.preload()
  // Демо без бекенду: MSW (окремим чанком) має перехоплювати запити ще до першого з них.
  const { startMocks } = await import("@/mocks/browser")
  // Рядки мови користувача (не української) довантажуються паралельно з мок-сервером.
  await Promise.all([startMocks(), whenI18nReady(i18n)])
  // Сесію перевіряємо до першого кадру — топбар одразу показує користувача або «Увійти».
  // Гість — 401 (немає сесії) чи 403 (входу немає, як у checkAuth); збій сервера чи мережі useMe
  // покаже як помилку з повтором.
  const me = await authProvider.getMe().catch((error: unknown) => {
    if (isApiError(error) && (error.status === 401 || error.status === 403))
      queryClient.setQueryData(ME_QUERY_KEY, null)
    return null
  })
  // Смуга «Увійти як…» — уже в першому кадрі: індикатор режиму не з'являється із запізненням.
  // Зависла мережа не тримає порожній екран: далі смуга з'явиться, щойно чанк прийде.
  if (me?.impersonator)
    await Promise.race([
      ImpersonationBanner.preload(),
      new Promise((resolve) => setTimeout(resolve, BANNER_WAIT_MS)),
    ])

  const root = document.getElementById("root")
  if (!root) throw new Error("Немає елемента #root")

  createRoot(root).render(
    <StrictMode>
      <CoreAdminContext
        dataProvider={dataProvider}
        authProvider={authProvider}
        i18nProvider={createI18nProvider(i18n)}
        queryClient={queryClient}
      >
        <App />
      </CoreAdminContext>
    </StrictMode>,
  )
}

bootstrap().catch((error: unknown) => {
  // Мок-сервер чи мова не стартували — не порожній екран, а пояснення (i18n тут може ще не бути).
  console.error("demo: bootstrap failed", error)
  const root = document.getElementById("root")
  if (root)
    root.textContent =
      "Не вдалося запустити демо. Перевірте з'єднання й оновіть сторінку."
})
