# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/uk/1.1.0/), версії — `vX.Y.Z` (CLAUDE.md, правило 8).

## [Unreleased]

### Додано — крок 0.2 (примітиви й стиль)

- Примітиви shadcn/ui на Base UI в `registry/ui` (стиль Nova, ADR-0001), перебудовані за ADR-0006: button, badge, card, checkbox, dialog, field, input, input-group, label, select, separator, sheet, skeleton, sonner, spinner, switch, table, tabs, textarea, tooltip.
- Шар токенів `registry/tokens`: `base.css` (мапінг токенів, шкала радіусів Nova, утиліти `h-control`, `size-control`, `h-row`, `min-h-touch`, `touch-target`, базові стилі) і `no-default-colors.css`.
- `registry/lib/utils.ts` — `cn` (пакет `cn` від shadcn) із підтримкою утиліт щільності; `registry/hooks/use-resolved-theme.ts`.
- Бейдж: статусні варіанти `success`, `warning`, `info`, `destructive` (soft-тло + `*-foreground`).
- Генератор тем `pnpm themes` (`design/generate-themes.mjs`) і перевірка `pnpm check:contrast` (370 пар; входить у `pnpm lint`).
- `scripts/adapt-upstream.mjs` — систематичні правки erp-ui для коду з shadcn та інших реєстрів.
- Сторінка демо «Примітиви»: кнопки, поля в усіх станах SPEC §8.3, вибір, статуси, діалог, шторка, підказка, тости, таблиця; e2e + axe у 5 палітрах × 2 темах × 2 щільностях.
- ADR-0001 (стиль Nova), ADR-0006 (зовнішні компоненти перебудовуємо).

### Змінено — крок 0.2

- Токени: `--input` світла 0,655 → 0,64, темна 0,50 → 0,51 (рамка поля ≥ 3:1 і на фоні сторінки); новий `--overlay`.
- Фокус примітивів — суцільне кільце 2 px `--ring`; текст помилок — `destructive-foreground`.
- Підписи «Закрити», «Завантаження», «Таблиця» в примітивах — українською за замовчуванням (параметри; i18n — крок 0.3).

### Додано — крок 0.1 (каркас)

- Хвиля 0, крок 0.1 — каркас: pnpm workspace, `apps/demo` (Vite 8, React 19, TypeScript 6 strict, Tailwind CSS 4), підключені `design/themes.css` і шрифт Geist.
- Перемикачі вигляду на `<html>` (SPEC §6.2): 5 палітр, тема світла/темна/як у системі, щільність, темний сайдбар; вибір кешується в localStorage.
- Токени щільності як утиліти Tailwind: `h-control`, `min-h-control`, `h-row`, `min-h-touch`.
- Перевірки: ESLint 10 (typescript-eslint, react-hooks, jsx-a11y-x), Prettier з сортуванням класів, `check-tokens` (лише токени), Vitest + Testing Library, Playwright + axe (WCAG 2.2 AA), CI на GitHub Actions.
