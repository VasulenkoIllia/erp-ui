import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// App.tsx і lib/* з'являються після `shadcn add` (scripts/consumer-smoke.mjs).
import { App } from "./App"
import { getAppearance, initAppearance, syncLanguage } from "@/lib/appearance"
import { createI18n, whenI18nReady } from "@/lib/i18n"
import "./index.css"

initAppearance()
const i18n = createI18n({ language: getAppearance().language })
syncLanguage(i18n)

// Англійські рядки кіта — окремим чанком (динамічний import, ADR-0009): перший кадр — уже з ними.
void whenI18nReady(i18n).then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
