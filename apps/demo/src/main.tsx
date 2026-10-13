import { CoreAdminContext } from "ra-core"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { isApiError } from "@/registry/lib/api"
import { initAppearance, syncLanguage } from "@/registry/lib/appearance"
import { ME_QUERY_KEY } from "@/registry/lib/auth"

import { App } from "@/App"
import {
  authProvider,
  createI18nProvider,
  dataProvider,
  queryClient,
} from "@/data/providers"
import { createDemoI18n } from "@/i18n"

import "@/styles/globals.css"

async function bootstrap() {
  initAppearance()
  const i18n = createDemoI18n()
  syncLanguage(i18n)

  // Демо без бекенду: MSW (окремим чанком) має перехоплювати запити ще до першого з них.
  const { startMocks } = await import("@/mocks/browser")
  await startMocks()
  // Сесію перевіряємо до першого кадру — топбар одразу показує користувача або «Увійти».
  // Гість — 401 (немає сесії) чи 403 (входу немає, як у checkAuth); збій сервера чи мережі useMe
  // покаже як помилку з повтором.
  await authProvider.getMe().catch((error: unknown) => {
    if (isApiError(error) && (error.status === 401 || error.status === 403))
      queryClient.setQueryData(ME_QUERY_KEY, null)
  })

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

void bootstrap()
