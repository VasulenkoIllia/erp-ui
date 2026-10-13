import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// App.tsx і lib/i18n з'являються після `shadcn add` (scripts/consumer-smoke.mjs).
import { App } from "./App"
import { createI18n } from "@/lib/i18n"
import "./index.css"

createI18n()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
