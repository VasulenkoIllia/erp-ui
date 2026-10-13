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
  ]),
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
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
  prettier,
)
