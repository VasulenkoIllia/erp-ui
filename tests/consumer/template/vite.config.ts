import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"

/** Звідки дані (`VITE_BACKEND`): моки MSW чи бекенд за контрактом кіта; адаптер проекту — своя назва. */
const BACKENDS = ["mocks", "api"]

// Запобіжник (посібник кіта, розділ 5): у розробці без змінної — моки, збірка без неї зупиняється.
export default defineConfig(({ command, mode }) => {
  const backend =
    loadEnv(mode, process.cwd(), "VITE_").VITE_BACKEND ||
    (command === "serve" ? "mocks" : "")
  if (!BACKENDS.includes(backend))
    throw new Error(
      `VITE_BACKEND="${backend}": очікується ${BACKENDS.join(" чи ")}; збірка без змінної зупиняється`,
    )
  // Збірка на моках — лише змінною команди (e2e, стенд): закомічений .env-файл не дасть продакшну на моках.
  if (
    command === "build" &&
    backend === "mocks" &&
    process.env.VITE_BACKEND !== "mocks"
  )
    throw new Error(
      "VITE_BACKEND=mocks у збірці — лише змінною команди: VITE_BACKEND=mocks vite build --outDir dist-e2e",
    )
  return {
    // Значення стає в код як є: без моків перевірка `=== "mocks"` викидає їх зі збірки в будь-якому файлі.
    define: { "import.meta.env.VITE_BACKEND": JSON.stringify(backend) },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
  }
})
