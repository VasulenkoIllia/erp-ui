import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/App"
import {
  getAppearance,
  initAppearance,
  subscribeAppearance,
} from "@/appearance/store"
import { createDemoI18n } from "@/i18n"

import "@/styles/globals.css"

initAppearance()
const i18n = createDemoI18n(getAppearance().language)
subscribeAppearance(() => {
  const { language } = getAppearance()
  if (i18n.language !== language) void i18n.changeLanguage(language)
})

const root = document.getElementById("root")
if (!root) throw new Error("Немає елемента #root")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
