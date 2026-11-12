/// <reference types="vite/client" />

// Значення дає vite.config.ts (запобіжник `VITE_BACKEND`): інших у коді не буває.
interface ImportMetaEnv {
  readonly VITE_BACKEND: "mocks" | "api"
}
