/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@/registry": fileURLToPath(new URL("../../registry", import.meta.url)),
      "@design": fileURLToPath(new URL("../../design", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // Компоненти реєстру лежать в іншому пакеті workspace — одна копія React на застосунок.
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
