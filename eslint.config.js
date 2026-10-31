import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import prettier from "eslint-config-prettier"
import jsxA11y from "eslint-plugin-jsx-a11y-x"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/playwright-report/",
    "**/test-results/",
    "docs/",
    "tests/consumer/template/",
    // Згенерований файл MSW (npx msw init), оновлюється разом із пакетом.
    "apps/demo/public/mockServiceWorker.js",
  ]),
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // Фоновий файл web push (ADR-0046): виконується в браузері, а не в Node.
    files: ["**/public/erp-ui-push-sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat["recommended-latest"],
      jsxA11y.configs.strict,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Область із прокруткою (широка таблиця на телефоні) має бути доступна з клавіатури:
      // role="region" + aria-label + tabIndex={0} (axe: scrollable-region-focusable).
      "jsx-a11y-x/no-noninteractive-tabindex": [
        "error",
        { roles: ["tabpanel", "region"] },
      ],
    },
  },
  {
    files: ["apps/*/src/**/*.tsx"],
    extends: [reactRefresh.configs.vite],
  },
  // Файли модуля копіюються в проект як є (ADR-0025): кіт — шляхами проекту, свої — відносно.
  {
    files: ["registry/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/registry/*"],
              message:
                "У модулі — шляхи проекту: @/components/{ui,erp,templates}/…, @/lib/…, @/hooks/…",
            },
          ],
        },
      ],
    },
  },
  // Демо й спільні шари імпортують реєстр через @/registry: шляхи проекту — лише для модулів.
  {
    files: [
      "apps/*/src/**/*.{ts,tsx}",
      "registry/{ui,erp,lib,hooks,templates}/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*", "@/lib/*", "@/hooks/*"],
              message: "Реєстр — через @/registry/<шар>/<файл>",
            },
          ],
        },
      ],
    },
  },
  prettier,
)
