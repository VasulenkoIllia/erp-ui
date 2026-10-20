## UI: реєстр erp-ui

Цей проект використовує приватний реєстр **erp-ui** (shadcn-реєстр на GitHub). Специфікація: `docs/erp-ui/SPEC.md`. Для будь-якої роботи з інтерфейсом використовуй скіл `erp-ui`.

- Що є в кіті — `docs/erp-ui/CATALOG.md`. Компоненти ставляться командою `npx shadcn@latest add VasulenkoIllia/erp-ui/<елемент>` (наприклад, `ui/button`) у `src/components/ui/`, утиліти — у `src/lib/`, хуки — у `src/hooks/`, стилі — у `src/styles/erp-ui/`. Доступ до приватного реєстру — `gh auth login` або `GH_TOKEN` (лише читання).
- Оновлення: тією самою версією CLI, що й ставили (`pnpm exec shadcn`, версія закріплена в `package.json`), спершу `add … --dry-run` (список змін), потім `add … --overwrite`. Версія — `#vX.Y.Z`. Модуль — з реєстру, зібраного з тегу локально, а не напряму з GitHub (розділ «Оновлення» в `src/modules/<ID>-<назва>/README.md`). Посібник — https://github.com/VasulenkoIllia/erp-ui/blob/main/docs/using-erp-ui.md, розділ 8.
- Не пиши аналогів компонентів реєстру. Бракує — запропонуй додати в erp-ui.
- Лише токени тем (`src/styles/erp-ui/themes.css`): палітра `data-palette` (основні — `sapphire`, `graphite`), клас `dark`, `data-density`, `data-sidebar`.
- Стек: React 19, Vite, TypeScript, Tailwind v4, shadcn/ui на Base UI, ra-core + Shadcn Admin Kit, TanStack Query/Table, react-hook-form + zod, i18next (uk, en).
- Оболонка — `src/components/erp/app-shell.tsx`; вигляд і мова — `src/lib/appearance.ts`; іконки — лише зі словника `src/lib/icons.tsx`.
- Мови: у `main.tsx` після `initAppearance()` — `const i18n = createI18n({ language: getAppearance().language })`, `syncLanguage(i18n)` і `await whenI18nReady(i18n)` перед рендером (у пам'яті лише мова інтерфейсу, ADR-0009 erp-ui); тексти — лише через i18n, числа, суми й дати — лише `useFormat()` з `src/lib/format.ts` (ADR-0007 erp-ui).
- Дані — через контракти модулів (`contract.ts`) і MSW-моки; бекенд цього проекту реалізує ті самі контракти. API (ADR-0002 erp-ui): `/api/v1/<ресурс>`, плоскі фільтри, `{ data, total }`, `version` + 409, `X-Company-Id`. Вхід (ADR-0003, ADR-0010–0014): httpOnly cookie, способи входу й бренд з `GET /auth/methods` (коди, без пароля, ключі доступу, Google/Apple/OIDC), `/me` з правами `<ресурс>:<дія>`, `/me/preferences`, `/me/security` і `/me/factors`, сесії й журнал входів, «Увійти як…», `X-Session-Expires-At`, `Accept-Language`; профіль (`PATCH /me`, `/me/avatar`), токени API (`/me/api-tokens`), політика безпеки (`/security-policy`), запити й скидання другого кроку (`/recovery-requests`, `/users/:id/reset-factors`); журнал аудиту (`/audit-events`), вебхуки (`/webhooks`), сповіщення (`/me/notification-settings`), доступ користувачів (`/users/:id/access`, `/sessions`, блокування) — ADR-0013; ролі й права (`/roles`, `/users/:id/roles`), запрошення (`/invitations`), центр сповіщень (`/notifications`), компанія (`/company`, логотип, печатка, філії) — ADR-0014; екрани — пакунок `auth`.
- Перед здачею: стани, 360/768/1440 px, світла/темна тема, uk/en, клавіатура, axe.

Модулі цього проекту: <!-- перелік ID, напр. A2, B1, B3, K2, LC07 -->
Палітра компанії за замовчуванням: <!-- sapphire | graphite | indigo | teal | terracotta -->
Розгортання: <!-- окремий інстанс | мультитенантний SaaS -->
