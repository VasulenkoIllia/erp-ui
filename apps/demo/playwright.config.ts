import { defineConfig, devices } from "@playwright/test"

const isCI = Boolean(process.env.CI)
// Шлях до браузера можна задати змінною PW_CHROMIUM_PATH.
const executablePath = process.env.PW_CHROMIUM_PATH

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    trace: "retain-on-failure",
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
