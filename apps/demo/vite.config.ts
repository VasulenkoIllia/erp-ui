/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Маніфест чанків — для перевірки бюджету першого екрана (scripts/check-bundle.mjs, ADR-0009).
  build: { manifest: true },
  resolve: {
    alias: {
      "@/registry": fileURLToPath(new URL("../../registry", import.meta.url)),
      // Модулі реєстру імпортують кіт шляхами проекту: їх файли копіюються в проект як є (ADR-0025).
      "@/components/ui": fileURLToPath(
        new URL("../../registry/ui", import.meta.url),
      ),
      "@/components/erp": fileURLToPath(
        new URL("../../registry/erp", import.meta.url),
      ),
      "@/components/templates": fileURLToPath(
        new URL("../../registry/templates", import.meta.url),
      ),
      "@/hooks": fileURLToPath(
        new URL("../../registry/hooks", import.meta.url),
      ),
      "@/lib": fileURLToPath(new URL("../../registry/lib", import.meta.url)),
      "@design": fileURLToPath(new URL("../../design", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // Компоненти реєстру лежать в іншому пакеті workspace — одна копія React, роутера й
    // TanStack Query на застосунок (інакше контексти ra-core і демо розійдуться).
    dedupe: [
      "react",
      "react-dom",
      "react-router",
      "react-router-dom",
      "@tanstack/react-query",
      "ra-core",
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Тихий режим на Mac (`docs/dev-setup.md`); CI — усі ядра раннера.
    maxWorkers: process.env.CI ? undefined : 6,
  },
})
