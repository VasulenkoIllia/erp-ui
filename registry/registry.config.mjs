/**
 * Опис елементів реєстру erp-ui — джерело для registry.json і docs/CATALOG.md (scripts/build-registry.mjs).
 * Кожен файл у registry/{ui,lib,hooks} мусить мати тут запис: так каталог завжди повний.
 *
 * status: draft — у роботі; beta — є в демо й тестах, API може змінитися; stable — після стрес-сторінки (крок 0.6).
 * demo: сторінка демо-застосунку (ключ ROUTES в apps/demo/src/router.ts), де елемент показано в усіх станах.
 * spec: розділи SPEC або ID (UI…, PF…, LC…), які елемент реалізує.
 */

export const REPO = "VasulenkoIllia/erp-ui"

/** Елементи з кодом: ключ — `<тека>/<файл без розширення>`. */
export const CODE_ITEMS = {
  "lib/utils": {
    title: "cn",
    description:
      "Злиття класів Tailwind із підтримкою утиліт щільності erp-ui.",
    status: "beta",
    spec: ["§6.5"],
  },
  "hooks/use-resolved-theme": {
    title: "useResolvedTheme",
    description:
      "Поточна тема з класу dark на <html> — для компонентів, яким потрібна тема.",
    status: "beta",
    spec: ["§6.2"],
  },
  "ui/badge": {
    title: "Бейдж",
    description:
      "Мітки й статуси: soft-тло + *-foreground (success, warning, info, destructive).",
    status: "beta",
    demo: "primitives",
    spec: ["§6.3"],
  },
  "ui/button": {
    title: "Кнопка",
    description:
      "Усі варіанти; висота з токенів щільності; зона натиску ≥ 44 px; «недоступно з поясненням».",
    status: "beta",
    demo: "primitives",
    spec: ["§6.5", "§8.4"],
  },
  "ui/card": {
    title: "Картка",
    description: "Контейнер секції з заголовком, описом, діями й підвалом.",
    status: "beta",
    demo: "primitives",
  },
  "ui/checkbox": {
    title: "Прапорець",
    description: "Checkbox на Base UI зі зоною натиску ≥ 24 px.",
    status: "beta",
    demo: "primitives",
  },
  "ui/dialog": {
    title: "Діалог",
    description: "Модальне вікно; кнопки називають наслідок (SPEC §8.2).",
    status: "beta",
    demo: "primitives",
    spec: ["§8.2"],
  },
  "ui/field": {
    title: "Поле форми",
    description: "Підпис, опис і помилка поля; групи й набори полів.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.3"],
  },
  "ui/input": {
    title: "Поле вводу",
    description:
      "Висота з токена щільності; read-only відрізняється від disabled.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.3"],
  },
  "ui/input-group": {
    title: "Група поля",
    description:
      "Поле з адонами: іконка, спінер перевірки, замок «редагує інший».",
    status: "beta",
    demo: "primitives",
    spec: ["§8.3"],
  },
  "ui/label": {
    title: "Підпис",
    description: "Підпис поля над контролом.",
    status: "beta",
    demo: "primitives",
  },
  "ui/select": {
    title: "Список вибору",
    description: "Select на Base UI; висота з токена щільності.",
    status: "beta",
    demo: "primitives",
  },
  "ui/separator": {
    title: "Розділювач",
    description: "Горизонтальна чи вертикальна лінія.",
    status: "beta",
  },
  "ui/sheet": {
    title: "Шторка",
    description: "Бічна чи нижня панель (фільтри, редактори на телефоні).",
    status: "beta",
    demo: "primitives",
    spec: ["§9", "UI38"],
  },
  "ui/skeleton": {
    title: "Скелетон",
    description:
      "Заглушка контенту під час першого завантаження (лише в контейнерах).",
    status: "beta",
    spec: ["§8.1", "§8.2"],
  },
  "ui/sonner": {
    title: "Тости",
    description:
      "Сповіщення sonner; тема з <html>; тости з «Скасувати» не зникають самі.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.2", "PF10"],
  },
  "ui/spinner": {
    title: "Спінер",
    description: "Індикатор очікування з підписом для скрінрідера.",
    status: "beta",
    demo: "primitives",
    spec: ["§8.2"],
  },
  "ui/switch": {
    title: "Перемикач",
    description: "Switch на Base UI зі зоною натиску ≥ 24 px.",
    status: "beta",
    demo: "primitives",
  },
  "ui/table": {
    title: "Таблиця",
    description:
      "Проста таблиця; рядки з токена щільності; прокрутка доступна з клавіатури.",
    status: "beta",
    demo: "primitives",
    spec: ["§9", "§10"],
  },
  "ui/tabs": {
    title: "Вкладки",
    description: "Вкладки на Base UI (вкладки-статуси списків).",
    status: "beta",
    demo: "primitives",
  },
  "ui/textarea": {
    title: "Багаторядкове поле",
    description: "Textarea з автовисотою.",
    status: "beta",
  },
  "ui/tooltip": {
    title: "Підказка",
    description: "Tooltip; пояснює недоступні дії (SPEC §8.4).",
    status: "beta",
    demo: "primitives",
    spec: ["§8.4"],
  },
}

/** Файли шару токенів у проекті. */
const TOKEN_FILES = [
  { path: "registry/tokens/app.css", target: "~/src/index.css" },
  { path: "design/themes.css", target: "~/src/styles/erp-ui/themes.css" },
  { path: "registry/tokens/base.css", target: "~/src/styles/erp-ui/base.css" },
  {
    path: "registry/tokens/no-default-colors.css",
    target: "~/src/styles/erp-ui/no-default-colors.css",
  },
]

const CLAUDE_FILES = [
  {
    path: "registry/claude/skills/erp-ui/SKILL.md",
    target: "~/.claude/skills/erp-ui/SKILL.md",
  },
  {
    path: "registry/claude/CLAUDE.project.md",
    target: "~/docs/erp-ui/CLAUDE.project.md",
  },
  { path: "docs/SPEC.md", target: "~/docs/erp-ui/SPEC.md" },
  { path: "docs/CATALOG.md", target: "~/docs/erp-ui/CATALOG.md" },
]

/** Елементи без власного коду: файли задано явно; `include` — елементи з кодом, які входять повністю. */
export const BUNDLE_ITEMS = {
  base: {
    title: "Основа erp-ui",
    description:
      "Усе для старту проекту однією командою: теми й токени, базові стилі, cn, useResolvedTheme, скіл і правила для Claude Code.",
    status: "beta",
    demo: "appearance",
    spec: ["§3", "§6", "§19"],
    files: [...TOKEN_FILES, ...CLAUDE_FILES],
    include: ["lib/utils", "hooks/use-resolved-theme"],
    dependencies: ["@fontsource/geist", "tw-animate-css", "shadcn"],
    docs: [
      "erp-ui встановлено.",
      "1) src/index.css тепер — точка входу стилів erp-ui; власні стилі проекту додавайте нижче імпортів.",
      "2) Додайте в CLAUDE.md проекту рядок: @docs/erp-ui/CLAUDE.project.md",
      '3) Вигляд задається на <html>: data-palette="sapphire|graphite|…", клас dark, data-density="compact", data-sidebar="dark".',
      "Компоненти: npx shadcn add VasulenkoIllia/erp-ui/ui/<назва>. Каталог: docs/erp-ui/CATALOG.md.",
    ].join("\n"),
  },
  tokens: {
    title: "Токени й теми",
    description:
      "Лише шар 1: 5 палітр × світла/темна, щільність, мапінг токенів у Tailwind v4, базові стилі.",
    status: "beta",
    demo: "appearance",
    spec: ["§6"],
    files: TOKEN_FILES,
    dependencies: ["@fontsource/geist", "tw-animate-css", "shadcn"],
  },
  claude: {
    title: "Правила для Claude Code",
    description:
      "Скіл erp-ui, блок для CLAUDE.md, SPEC і каталог реєстру в docs/erp-ui/.",
    status: "beta",
    spec: ["§19"],
    files: CLAUDE_FILES,
    docs: "Додайте в CLAUDE.md проекту рядок: @docs/erp-ui/CLAUDE.project.md",
  },
}
