import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// App.tsx і lib/* з'являються після встановлення кіта (scripts/light-smoke.mjs).
import { App } from "./App"
import { getAppearance, initAppearance, syncLanguage } from "@/lib/appearance"
import { createI18n, whenI18nReady } from "@/lib/i18n"
import "./index.css"

initAppearance()
const i18n = createI18n({ language: getAppearance().language })
syncLanguage(i18n)

void whenI18nReady(i18n).then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
