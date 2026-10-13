# Як підключити erp-ui у проект

Посібник для розробника, який починає або оновлює проект на кіті. Що є в кіті — [`CATALOG.md`](CATALOG.md). Рішення — [ADR-0004](adr/0004-registry-delivery.md).

## 0. Доступ (один раз)

Реєстр — приватний репозиторій `VasulenkoIllia/erp-ui`.

- На своєму комп'ютері: `gh auth login` (GitHub CLI). shadcn сам візьме доступ через `gh`.
- У CI проекту: fine-grained токен GitHub з правом **Contents: Read-only** лише на `erp-ui` → секрет `GH_TOKEN`.

## 1. Новий проект

```sh
pnpm create vite@latest my-erp -- --template react-ts
cd my-erp
pnpm add -D tailwindcss @tailwindcss/vite
# vite.config.ts: plugins: [react(), tailwindcss()], alias "@" → ./src; tsconfig: "paths": { "@/*": ["./src/*"] }
npx shadcn@latest init -b base -p nova
npx shadcn@latest add VasulenkoIllia/erp-ui/base
```

`base` ставить:
- теми й токени в `src/styles/erp-ui/` і замінює `src/index.css` точкою входу erp-ui (CLI спитає дозволу);
- `cn` у `src/lib/utils.ts` і `useResolvedTheme` у `src/hooks/`;
- скіл для Claude Code у `.claude/skills/erp-ui/`, SPEC і каталог у `docs/erp-ui/`.

Після цього додайте в `CLAUDE.md` проекту рядок:

```md
@docs/erp-ui/CLAUDE.project.md
```

і заповніть у `docs/erp-ui/CLAUDE.project.md` модулі, палітру компанії й тип розгортання.

## 2. Компоненти

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/ui/button VasulenkoIllia/erp-ui/ui/dialog
npx shadcn@latest list VasulenkoIllia/erp-ui              # усе, що є
npx shadcn@latest search VasulenkoIllia/erp-ui -q таблиця  # пошук
```

Компоненти лягають у `src/components/ui/`, імпорти — `@/components/ui/button`. Кожен елемент приносить усе, що йому потрібно (наприклад, `ui/dialog` — ще й кнопку та `cn`).

## 3. Вигляд

Палітра, тема, щільність і сайдбар задаються атрибутами `<html>` (SPEC §6.2):

```html
<html lang="uk" data-palette="sapphire" class="dark" data-density="compact" data-sidebar="dark">
```

Палітри: `sapphire`, `graphite` (основні), `indigo`, `teal`, `terracotta`. Без класу `dark` — світла тема.

## 4. Оновлення

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/ui/button --diff   # що зміниться, нічого не записує
npx shadcn@latest add VasulenkoIllia/erp-ui/ui/button          # застосувати
```

- Що змінилося між версіями — `CHANGELOG.md` у репозиторії erp-ui. Мажорна версія — лише при зміні токенів чи публічного API.
- Закріпити версію: `…/ui/button#v0.3.0` (git-тег). Без `#…` береться найновіше з `main`.
- Якщо компонент довелося змінити в проекті — позначте правку `// erp-ui: local override — <причина>`. При оновленні вона буде видна в `--diff`, а вдалу правку варто перенести в реєстр.

## 5. Чого не робити

- Не копіювати компоненти руками з репозиторію — лише через `shadcn add` (так працюють оновлення).
- Не писати кольори, розміри й шрифти повз токени. Потрібен новий токен — він додається в erp-ui.
- Не ставити поверх стилів erp-ui інші shadcn-стилі чи компоненти з інших реєстрів напряму. Вони спершу перебудовуються в реєстрі (ADR-0006).
