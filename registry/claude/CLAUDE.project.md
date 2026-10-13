## UI: реєстр erp-ui

Цей проект використовує приватний реєстр **erp-ui** (shadcn-реєстр на GitHub). Специфікація: `docs/erp-ui/SPEC.md`. Для будь-якої роботи з інтерфейсом використовуй скіл `erp-ui`.

- Що є в кіті — `docs/erp-ui/CATALOG.md`. Компоненти ставляться командою `npx shadcn@latest add VasulenkoIllia/erp-ui/<елемент>` (наприклад, `ui/button`) у `src/components/ui/`, утиліти — у `src/lib/`, хуки — у `src/hooks/`, стилі — у `src/styles/erp-ui/`. Доступ до приватного реєстру — `gh auth login` або `GH_TOKEN` (лише читання).
- Оновлення: спершу `npx shadcn@latest add VasulenkoIllia/erp-ui/<елемент> --diff`, переглянути зміни, потім без `--diff`. Версія — `#vX.Y.Z`. Посібник — https://github.com/VasulenkoIllia/erp-ui/blob/main/docs/using-erp-ui.md.
- Не пиши аналогів компонентів реєстру. Бракує — запропонуй додати в erp-ui.
- Лише токени тем (`src/styles/erp-ui/themes.css`): палітра `data-palette` (основні — `sapphire`, `graphite`), клас `dark`, `data-density`, `data-sidebar`.
- Стек: React 19, Vite, TypeScript, Tailwind v4, shadcn/ui на Base UI, ra-core + Shadcn Admin Kit, TanStack Query/Table, react-hook-form + zod, i18next (uk, en).
- Оболонка — `src/components/erp/app-shell.tsx`; вигляд і мова — `src/lib/appearance.ts`; іконки — лише зі словника `src/lib/icons.tsx`.
- Мови: `syncLanguage(createI18n())` у `main.tsx` (після `initAppearance()`); тексти — лише через i18n, числа, суми й дати — лише `useFormat()` з `src/lib/format.ts` (ADR-0007 erp-ui).
- Дані — через контракти модулів (`contract.ts`) і MSW-моки; бекенд цього проекту реалізує ті самі контракти. API (ADR-0002 erp-ui): `/api/v1/<ресурс>`, плоскі фільтри, `{ data, total }`, `version` + 409, `X-Company-Id`. Вхід (ADR-0003, ADR-0010): httpOnly cookie, способи входу з `GET /auth/methods` (коди, без пароля, ключі доступу, Google/Apple/OIDC), `/me` з правами `<ресурс>:<дія>`, `/me/preferences`, `X-Session-Expires-At`; екрани — пакунок `auth`.
- Перед здачею: стани, 360/768/1440 px, світла/темна тема, uk/en, клавіатура, axe.

Модулі цього проекту: <!-- перелік ID, напр. A2, B1, B3, K2, LC07 -->
Палітра компанії за замовчуванням: <!-- sapphire | graphite | indigo | teal | terracotta -->
Розгортання: <!-- окремий інстанс | мультитенантний SaaS -->
