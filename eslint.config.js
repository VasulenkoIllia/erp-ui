import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import prettier from "eslint-config-prettier"
import jsxA11y from "eslint-plugin-jsx-a11y-x"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"

import { CONTRACT_LAYER } from "./registry/registry.config.mjs"

/** Модуль бере кіт шляхами проекту (ADR-0025), а не через @/registry. */
const MODULE_PROJECT_PATHS = {
  group: ["@/registry/*"],
  message:
    "У модулі — шляхи проекту: @/components/{ui,erp,templates}/…, @/lib/…, @/hooks/…",
}

/** Демо й спільні шари беруть реєстр через @/registry: шляхи проекту — лише для модулів. */
const REGISTRY_PATHS = {
  group: ["@/components/*", "@/lib/*", "@/hooks/*"],
  message: "Реєстр — через @/registry/<шар>/<файл>",
}

/**
 * ra-core — лише через шов (ADR-0090). Правило з тим самим ім'ям у пізнішому блоці замінює ранній,
 * тож ця заборона стоїть у кожному блоці no-restricted-imports нижче; сам шов звільнено наприкінці.
 */
const RA_CORE_SEAM = {
  name: "ra-core",
  message:
    "ra-core — через шов: @/registry/lib/ra-core, у модулі — @/lib/ra-core (ADR-0090). Бракує імені — додайте його в шов",
}

/**
 * Чистий шар контрактів (ADR-0093): файл шару імпортує лише zod і утиліти, зокрема типами; які саме утиліти
 * належать шару, перевіряє `pnpm check:registry` за переліком CONTRACT_LAYER.
 */
const CONTRACT_LAYER_IMPORTS = {
  group: [
    "*",
    "!zod",
    "!@/",
    "!@/lib/",
    "!@/lib/*",
    "!@/registry/",
    "!@/registry/lib/",
    "!@/registry/lib/*",
    "!./",
    "!./*",
  ],
  message:
    "Чистий шар контрактів (ADR-0093): лише zod і файли шару; чиста частина змішаного файла — <ім'я>-core",
}
const CONTRACT_LAYER_LIB = CONTRACT_LAYER.lib.map(
  (name) => `registry/lib/${name}.ts`,
)
const CONTRACT_LAYER_MODULES = [
  "registry/modules/*/{contract,resources}.ts",
  ...Object.entries(CONTRACT_LAYER.modules).flatMap(([dir, names]) =>
    names.map((name) => `registry/modules/${dir}/${name}.ts`),
  ),
]

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/playwright-report/",
    "**/test-results/",
    "docs/",
    "tests/consumer/template/",
    "tests/consumer/upgrade/",
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
      "no-restricted-imports": ["error", { paths: [RA_CORE_SEAM] }],
    },
  },
  {
    files: ["apps/*/src/**/*.tsx"],
    extends: [reactRefresh.configs.vite],
  },
  // Файли модуля копіюються в проект як є (ADR-0025): кіт — шляхами проекту, свої — відносно.
  // Сторож каркаса (ADR-0085, ADR-0086): контекст сторінок, прогрів чанків і переклад модуль бере з
  // lib/module і createModuleT, а не збирає сам.
  {
    files: ["registry/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [RA_CORE_SEAM], patterns: [MODULE_PROJECT_PATHS] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name='createContext'], CallExpression[callee.property.name='createContext'])",
          message:
            "Контекст модуля — createModuleContext з @/lib/module (ADR-0085)",
        },
        {
          selector:
            ":matches(ImportDeclaration[source.value='react-router'] > ImportSpecifier[imported.name='matchRoutes'], ObjectExpression > Property[key.name='preload']:not([value.type='MemberExpression']), FunctionDeclaration[id.name='preload'], VariableDeclarator[id.name='preload'])",
          message:
            "Прогрів сторінок модуля дає createModule з @/lib/module (ADR-0085): свого preload модуль не пише",
        },
        {
          selector:
            "ImportDeclaration[source.value='@/lib/i18n-namespaces'] > ImportSpecifier[imported.name=/^useNamespace/]",
          message:
            "Переклад модуля — createModuleT з @/lib/i18n-namespaces (ADR-0085)",
        },
      ],
    },
  },
  // Нелінивий вхід модуля (фабрика, контекст, тип розширення, види документів) іде в перший екран
  // проекту: компоненти звідти — лише типами, інакше вхідний чанк росте непомітно до check:bundle
  // (ADR-0086, доповнення від 14.11.2026). Виняток — межа помилок: вона вже в першому екрані (маршрути входу).
  {
    files: [
      "registry/modules/*/{index,module-context,extension}.ts",
      "registry/modules/*/*-kinds.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [RA_CORE_SEAM],
          patterns: [
            MODULE_PROJECT_PATHS,
            {
              group: ["@/components/*/*", "!@/components/erp/error-boundary"],
              allowTypeImports: true,
              message:
                "Нелінивий файл модуля бере з @/components лише типи (import type): компонент — у ліниву сторінку",
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
        { paths: [RA_CORE_SEAM], patterns: [REGISTRY_PATHS] },
      ],
    },
  },
  // Чистий шар контрактів (ADR-0093): поверх правил шару файла вище — лише zod і файли шару.
  {
    files: CONTRACT_LAYER_LIB,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [RA_CORE_SEAM],
          patterns: [REGISTRY_PATHS, CONTRACT_LAYER_IMPORTS],
        },
      ],
    },
  },
  {
    files: CONTRACT_LAYER_MODULES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [RA_CORE_SEAM],
          patterns: [MODULE_PROJECT_PATHS, CONTRACT_LAYER_IMPORTS],
        },
      ],
    },
  },
  // Шов сам бере ra-core (ADR-0090).
  {
    files: ["registry/lib/ra-core.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [REGISTRY_PATHS] }],
    },
  },
  prettier,
)
