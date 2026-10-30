import { defineConfig, devices } from "@playwright/test"

const isCI = Boolean(process.env.CI)
// Шлях до браузера можна задати змінною PW_CHROMIUM_PATH.
const executablePath = process.env.PW_CHROMIUM_PATH
// Mac власника лишається вільним (`docs/dev-setup.md`, «Тихий режим»); CI — усі ядра раннера.
const LOCAL_WORKERS = 4

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: isCI ? undefined : LOCAL_WORKERS,
  forbidOnly: isCI,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    // Локально тест, що впав, запускають ще раз: `--last-failed --trace on`.
    trace: isCI ? "retain-on-failure" : "off",
  },
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /perf\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
    // Бюджети швидкості (ADR-0009): окремо й в один потік — `pnpm perf`.
    {
      name: "perf",
      testMatch: /perf\.spec\.ts/,
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
})
