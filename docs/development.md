# Як запустити репозиторій

## Вимоги

- Node.js ≥ 22.12, версія для CI в `.nvmrc`.
- pnpm: точна версія закріплена в `package.json`, поле `packageManager`. Будь-який pnpm ≥ 9 сам перемкнеться на неї.

## Команди

```sh
pnpm install
pnpm dev          # демо на http://localhost:5173
pnpm typecheck    # tsc -b
pnpm lint         # eslint + prettier --check + check-tokens
pnpm test         # тести скриптів (node:test) + Vitest
pnpm e2e          # Playwright + axe (збирає демо й піднімає vite preview на :4173)
pnpm perf         # бюджети швидкості: LCP і INP
pnpm check:bundle # JS першого екрана кожного маршруту ≤ межі з apps/demo/bundle-budget.json (після pnpm build)
pnpm format       # prettier --write
pnpm themes       # згенерувати design/themes.css і звіт контрасту з palette-tokens.json
pnpm check:contrast  # themes.css актуальний, контраст проходить (входить у lint)
pnpm registry     # згенерувати registry.json і docs/CATALOG.md з registry/registry.config.mjs
pnpm check:registry  # вони актуальні, схема shadcn, сторінки демо (входить у lint)
pnpm consumer-smoke --ref <коміт|тег>  # поставити кіт із GitHub у чистий проект і зібрати
pnpm consumer-smoke --local --ref main  # те саме з реєстру робочої копії; з GitHub лише ui/button (як у CI)
```

Браузер для e2e ставиться один раз: `pnpm --filter @erp-ui/demo exec playwright install chromium`.

Код захищено авторським правом, користування лише з письмового дозволу (`LICENSE`).
