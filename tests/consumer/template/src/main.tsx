import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// App.tsx, mocks/browser.ts і lib/* з'являються після `shadcn add` (scripts/consumer-smoke.mjs).
import { App } from "./App"
import { getAppearance, initAppearance, syncLanguage } from "@/lib/appearance"
import { createI18n, whenI18nReady } from "@/lib/i18n"
import "./index.css"

initAppearance()
const i18n = createI18n({ language: getAppearance().language })
syncLanguage(i18n)

// Моки — окремим чанком і лише з VITE_BACKEND=mocks: з бекендом збирач викидає гілку разом із MSW.
const mocks =
  import.meta.env.VITE_BACKEND === "mocks"
    ? import("./mocks/browser").then((module) => module.startMocks())
    : Promise.resolve()

// Англійські рядки кіта — окремим чанком (динамічний import, ADR-0009): перший кадр — уже з ними.
void Promise.all([mocks, whenI18nReady(i18n)]).then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
