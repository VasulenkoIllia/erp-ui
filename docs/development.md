# Як запустити репозиторій

## Вимоги

- Node.js ≥ 26, версія для розробки й CI в `.nvmrc`.
- pnpm: точна версія закріплена в `package.json`, поле `packageManager`. Будь-який pnpm ≥ 9 сам перемкнеться на неї.

## Команди

```sh
pnpm install
pnpm dev          # демо на http://localhost:5173
pnpm typecheck    # tsc -b
pnpm lint         # eslint + prettier --check + check-tokens + check:contrast + check:registry + check:copies + check:docs
pnpm test         # тести скриптів (node:test) + Vitest
pnpm e2e          # Playwright + axe (збирає демо й піднімає vite preview на :4173)
pnpm perf         # бюджети швидкості: LCP і INP
pnpm check:bundle # JS першого екрана: вхід під стелею, сторінки й шар моків у межах apps/demo/bundle-budget.json (після pnpm build; ADR-0092)
pnpm format       # prettier --write
pnpm themes       # згенерувати design/themes.css і звіт контрасту з palette-tokens.json
pnpm check:contrast  # themes.css актуальний, контраст проходить (входить у lint)
pnpm registry     # згенерувати registry.json і docs/CATALOG.md з registry/registry.config.mjs
pnpm check:registry  # вони актуальні, схема shadcn, сторінки демо, чистий шар контрактів лише з zod (ADR-0093; входить у lint)
pnpm adr-index    # стовпець «Статус» покажчика docs/adr/README.md з файлів ADR
pnpm check:docs   # покажчик ADR і рядки «Змінено», межі розміру скіла, назви в скілі є в коді (входить у lint)
pnpm consumer-smoke --ref <коміт|тег>  # поставити кіт із GitHub у чистий проект і зібрати
pnpm consumer-smoke --local --ref main  # те саме з реєстру робочої копії; з GitHub лише ui/button (як у CI)
pnpm consumer-smoke --local --ref main --audit  # і pnpm audit --prod повного проекту (сторож свіжих версій, ADR-0102)
pnpm upgrade-smoke  # проект на попередньому тегу оновити командою кіта до HEAD (закомічений стан), зібрати (як у CI)
pnpm workspace-smoke  # те саме для адмінки окремим пакетом у монорепо з сервером (ADR-0097, як у CI)
```

Браузер для e2e ставиться один раз: `pnpm --filter @erp-ui/demo exec playwright install chromium`.

Код захищено авторським правом, користування лише з письмового дозволу (`LICENSE`).
