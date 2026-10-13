import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/App"
import { initAppearance } from "@/appearance/store"

import "@/styles/globals.css"

initAppearance()

const root = document.getElementById("root")
if (!root) throw new Error("Немає елемента #root")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
