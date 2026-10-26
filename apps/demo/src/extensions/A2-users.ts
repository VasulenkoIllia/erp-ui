import type { UsersExtension } from "@/registry/modules/A2-users"

import { usersMockExtension } from "./A2-users-fields"

/**
 * Розширення модуля A2 «Користувачі й ролі» під клієнта (ADR-0020, ADR-0025) — так виглядає файл
 * проекту `src/extensions/A2-users.ts`. Файли модуля (`registry/modules/A2-users`, у проекті —
 * `src/modules/A2-users`) для цього не змінювались:
 * - поле «Відділ» — колонка після посади, фільтр і поле шапки картки;
 * - вкладка списку «Без другого кроку» — нагадати людям налаштувати другий крок;
 * - колонка «Посада» — інша назва без заміни (`change`).
 */
export const usersExtension: UsersExtension = {
  users: {
    ...usersMockExtension.users,
    columns: {
      add: [{ id: "department", place: { after: "position" }, minWidth: 9 }],
      change: [
        {
          id: "position",
          header: { uk: "Посада в компанії", en: "Job title" },
        },
      ],
    },
    filters: { add: [{ id: "department" }] },
    tabs: {
      add: [
        {
          id: "noTwoFactor",
          label: { uk: "Без другого кроку", en: "No two-step" },
          filter: { twoFactor: "false" },
        },
      ],
    },
    recordFields: { add: [{ id: "department", place: { after: "position" } }] },
  },
}
