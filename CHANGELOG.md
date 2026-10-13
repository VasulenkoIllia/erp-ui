# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/uk/1.1.0/), версії — `vX.Y.Z` (CLAUDE.md, правило 8).

## [Unreleased]

### Додано

- Хвиля 0, крок 0.1 — каркас: pnpm workspace, `apps/demo` (Vite 8, React 19, TypeScript 6 strict, Tailwind CSS 4), підключені `design/themes.css` і шрифт Geist.
- Перемикачі вигляду на `<html>` (SPEC §6.2): 5 палітр, тема світла/темна/як у системі, щільність, темний сайдбар; вибір кешується в localStorage.
- Токени щільності як утиліти Tailwind: `h-control`, `min-h-control`, `h-row`, `min-h-touch`.
- Перевірки: ESLint 10 (typescript-eslint, react-hooks, jsx-a11y-x), Prettier з сортуванням класів, `check-tokens` (лише токени), Vitest + Testing Library, Playwright + axe (WCAG 2.2 AA), CI на GitHub Actions.
