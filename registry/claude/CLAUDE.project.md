## UI: реєстр erp-ui

Цей проект використовує приватний реєстр **erp-ui** (shadcn-реєстр на GitHub). Специфікація: `docs/erp-ui/SPEC.md`. Для будь-якої роботи з інтерфейсом використовуй скіл `erp-ui`.

- Компоненти реєстру лежать у `src/components/erp-ui/` і додаються командою `npx shadcn add @erp-ui/<item>` (токен доступу — `ERP_UI_REGISTRY_TOKEN` у `.env.local`).
- Не пиши аналогів компонентів реєстру. Бракує — запропонуй додати в erp-ui.
- Лише токени тем (`design/themes.css`): палітра `data-palette` (основні — `sapphire`, `graphite`), клас `dark`, `data-density`, `data-sidebar`.
- Стек: React 19, Vite, TypeScript, Tailwind v4, shadcn/ui на Base UI, ra-core + Shadcn Admin Kit, TanStack Query/Table, react-hook-form + zod, i18next (uk, en).
- Дані — через контракти модулів (`contract.ts`) і MSW-моки; бекенд цього проекту реалізує ті самі контракти.
- Перед здачею: стани, 360/768/1440 px, світла/темна тема, uk/en, клавіатура, axe.

Модулі цього проекту: <!-- перелік ID, напр. A2, B1, B3, K2, LC07 -->
Палітра компанії за замовчуванням: <!-- sapphire | graphite | indigo | teal | terracotta -->
Розгортання: <!-- окремий інстанс | мультитенантний SaaS -->
