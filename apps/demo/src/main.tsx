import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { initAppearance, syncLanguage } from "@/registry/lib/appearance"

import { App } from "@/App"
import { createDemoI18n } from "@/i18n"

import "@/styles/globals.css"

initAppearance()
syncLanguage(createDemoI18n())

const root = document.getElementById("root")
if (!root) throw new Error("Немає елемента #root")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
