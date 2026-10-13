import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// App.tsx з'являється після `shadcn add` (scripts/consumer-smoke.mjs).
import { App } from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
