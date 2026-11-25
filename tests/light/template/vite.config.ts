import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

// Легкий набір (ADR-0099): свій сервер і свій вхід, без моків кіта. Екран віддається з базовим шляхом `/new/`,
// бо старий лишається на `/`: ассети, шрифти й чанки кіта мають іти з цього шляху.
export default defineConfig({
  base: "/new/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
})
