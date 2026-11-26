# Як підключити erp-ui у проект

Посібник для розробника, який починає або оновлює проект на кіті. Що є в кіті — [`CATALOG.md`](CATALOG.md). Рішення — [ADR-0004](adr/0004-registry-delivery.md).

## 0. Доступ (один раз)

Реєстр — відкритий репозиторій `VasulenkoIllia/erp-ui`: `shadcn add` працює без токена. Код захищено авторським правом, користування лише з письмового дозволу (`LICENSE`).

- Команда кіта `node scripts/erp-ui-kit.mjs update` бере SHA коміту тегу й архів цього коміту через `gh api`, тож на своєму комп'ютері потрібен `gh auth login` (GitHub CLI).
- У CI проекту для тієї самої команди: `GH_TOKEN`.

## 1. Новий проект

Потрібен Node.js 26 або новіший (`.nvmrc` проекту): на ньому CI кіта перевіряє доставку й команду `scripts/erp-ui-kit.mjs`.

Браузери: мінімум задає Tailwind CSS v4 — Safari 16.4, Chrome і Edge 111, Firefox 128 ([сумісність Tailwind](https://tailwindcss.com/docs/compatibility)); у старіших кольори тем і тіні можуть не відобразитись. Новіші можливості кіт бере як покращення: без них поле коментаря не росте з текстом (`field-sizing`), а перехід між сторінками йде без анімації (View Transitions, ADR-0009).

```sh
pnpm create vite@latest my-erp -- --template react-ts
cd my-erp
pnpm add -D tailwindcss @tailwindcss/vite
# vite.config.ts: plugins: [react(), tailwindcss()], alias "@" → ./src, запобіжник VITE_BACKEND (розділ 5)
# "paths": { "@/*": ["./src/*"] } — і в tsconfig.json, і в tsconfig.app.json (шаблон Vite ділить їх)
npx shadcn@latest init -b base -p nova
pnpm remove shadcn && pnpm add -D -E shadcn@4.21.4   # init кладе shadcn у dependencies з ^: CLI — для розробки, та сама версія для встановлення й оновлення (розділ 8)
pnpm exec shadcn add VasulenkoIllia/erp-ui/base#v1.5.0
pnpm remove @fontsource-variable/geist   # шрифт від init: Geist тепер ставить base (@fontsource/geist)
git add -A && git commit -m "erp-ui: base v1.5.0"   # команда кіта пише лише в чисте дерево
node scripts/erp-ui-kit.mjs update v1.5.0 --items base,data,mocks,auth,erp/app-gate,erp/auth-routes,erp/app-shell,erp/user-menu,lib/query-client,tools/e2e
git add -A && git commit -m "erp-ui: кіт v1.5.0"
```

Комітів на старті два, і це навмисно: команда кіта пише лише в чисте дерево (ADR-0029, SPEC §3.3), тож перший коміт — шаблон, `init` і `base` (у ньому сама команда), другий — те, що команда поставила. Так кожна зміна кіта, і перша, і кожне оновлення, лежить окремим diff: її видно й можна відкотити, не зачепивши код проекту.

Рядок `update` ставить решту кіта з тегу (розділи 4–6) і записує `kit-files.json`: список встановлених елементів, версію з SHA коміту, відбитки файлів кіта й контрольну суму. Далі нові елементи — `update v1.5.0 --add <елемент>`, оновлення — розділ 8. У `pnpm lint` проекту додайте `node scripts/erp-ui-kit.mjs check` (файли кіта в проекті не правлені) і `node scripts/erp-ui-check-tokens.mjs` (лише токени тем у коді проекту, ADR-0089).

Код кіта компілюється й з налаштуваннями шаблону Vite (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`), перевірено тестовим проектом (крок 1.5b). Лінтер і форматер проекту (oxlint чи ESLint шаблону, Prettier) налаштуйте без файлів кіта (`src/components`, `src/hooks`, `src/lib`, `src/modules`, `src/styles/erp-ui`, `scripts/erp-ui-kit*.mjs`, `scripts/erp-ui-check-tokens.mjs`, `e2e/erp-ui.ts`, `docs/erp-ui`): їх перевіряє лінтер кіта, а правити їх у проекті не можна — `check` (розділ 8) не пропустить і переформатування.

`base` ставить:
- теми й токени в `src/styles/erp-ui/` і замінює `src/index.css` точкою входу erp-ui (CLI спитає дозволу);
- `cn` у `src/lib/utils.ts` і `useResolvedTheme` у `src/hooks/`;
- мови й форматери: `src/lib/i18n.ts` (+ рядки кіта: база `i18n-uk-base.ts`, рядки функцій `i18n-uk-*.ts`, усі разом `i18n-uk.ts`, англійські `i18n-en.ts`) і `src/lib/format.ts`;
- вподобання вигляду `src/lib/appearance.ts` + `src/hooks/use-appearance.ts` і словник іконок `src/lib/icons.tsx`;
- скіл для Claude Code у `.claude/skills/erp-ui/` (ядро `SKILL.md` і довідки за темами в `references/`, ADR-0089), SPEC і каталог у `docs/erp-ui/`;
- команду кіта `scripts/erp-ui-kit.mjs` (+ `erp-ui-kit-lib.mjs`, `erp-ui-kit-deps.mjs`, `erp-ui-kit-manifest.mjs`, `erp-ui-kit-changelog.mjs`): оновлення й перевірка файлів кіта (розділ 8, ADR-0029, ADR-0078);
- перевірку `scripts/erp-ui-check-tokens.mjs [теки…]` (без аргументів — найближча тека `src` над файлом `tailwind.css` з `components.json`, без неї тека самого файла, без `components.json` — `src`; Next.js без `src` називає теки аргументами; стилі поза проектом, як `../../packages/ui/…` у монорепо, — помилка, тоді теки коду — аргументами; ADR-0096): сирі кольори, стандартна палітра Tailwind, довільні розміри в класах і рух поза токенами у файлах `.ts`, `.tsx`, `.js`, `.jsx`, `.css`; згенеровані палітри `…/styles/erp-ui/themes.css` пропускає, виняток для рядка — коментар `erp-ui: allow-raw-value — <причина>`; тека, якої немає, чи тека без таких файлів — помилка (ADR-0089).

Після цього додайте в `CLAUDE.md` проекту рядок:

```md
@docs/erp-ui/CLAUDE.project.md
```

і заповніть у `docs/erp-ui/CLAUDE.project.md` модулі, палітру компанії й тип розгортання.

### Адмінка в монорепо з сервером (ADR-0097)

Сервер і адмінка в одному репозиторії: адмінка — окремий пакет робочого простору зі своїми `package.json`, `components.json`, `tsconfig` і `src/`. Кіт ставиться в пакет так само, як в окремий проект, лише з теки пакета.

```text
repo/
  package.json           # корінь воркспейсу: залежностей кіта тут немає
  pnpm-workspace.yaml    # packages: [apps/*]
  pnpm-lock.yaml         # один lock-файл на весь репозиторій
  CLAUDE.md              # @apps/admin/docs/erp-ui/CLAUDE.project.md
  apps/server/           # сервер: кіт його не чіпає
  apps/admin/            # адмінка: усе з розділу 1 — тут
```

- **Старт.** Сервер закомітьте до старту. Шаблон — `pnpm create vite@latest apps/admin -- --template react-ts`, далі команди розділу 1 з теки `apps/admin`; `git add -A` звідти бере й `pnpm-lock.yaml` кореня. Комітів на старті так само два.
- **Де файли кіта.** Усе з розділу 1 лягає в пакет: код у `apps/admin/src/`, команда в `apps/admin/scripts/`, `kit-files.json` поруч із `components.json`, скіл в `apps/admin/.claude/skills/`, довідка в `apps/admin/docs/erp-ui/`. Команду кіта, `check` і `check-tokens` запускайте з теки пакета (`cd apps/admin && node scripts/erp-ui-kit.mjs …`), у `lint` пакета вони стоять, як в окремому проекті; у CI проекту — `working-directory: apps/admin`.
- **Залежності.** Нові залежності кіта йдуть у `apps/admin/package.json`, наявні записи пакета команда не змінює. Залежність, яка є лише в корені чи в сервері, команда поставить і адмінці, як нову: потрібна інша версія — запишіть її в пакет адмінки до `update`.
- **CLI shadcn** — у `devDependencies` пакета адмінки, точна версія (рядок `pnpm add -D -E` вище): команда бере `apps/admin/node_modules/.bin/shadcn`, а CLI з кореня воркспейсу туди не потрапляє.
- **Чистим має бути весь репозиторій.** `update` змінює й `pnpm-lock.yaml` у корені, тож незакомічені зміни сервера теж зупиняють оновлення. Оновлення не вдалося — `git restore .` з кореня репозиторію.
- **Claude Code.** У `CLAUDE.md` кореня — рядок `@apps/admin/docs/erp-ui/CLAUDE.project.md` (шлях відносно файла з імпортом). Скіл `erp-ui` з `apps/admin/.claude/skills/` Claude Code підхоплює, щойно відкриє файл пакета, а запущений з `apps/admin` — одразу.
- **Сервер на TypeScript** бере схеми й правила кіта з `apps/admin/src/` (розділ 5, «Сервер на TypeScript»).
- Перевіряє це задача CI кіта «адмінка в монорепо» на pnpm; робочі простори npm, yarn і bun кіт не перевіряє. Спільний пакет стилів поза адмінкою (`packages/ui`) кіт не підтримує: `check-tokens` на ньому падає, теки коду називайте аргументами.

### Легкий набір: свій сервер і свій вхід (ADR-0099)

Проект без модулів кіта, шару даних і входу кіта — свій API, своя сесія, свої ролі — бере лише легкий набір: ці елементи й усі `ui/*` не ставлять ra-core і react-router. Перелік — [`CATALOG.md`](CATALOG.md), «Легкий набір»; що в ньому не з'являтиметься ra-core, перевіряє CI кіта (задача «легкий набір»: чистий проект ставить набір, збирає з базою `/new/` і відкриває сторінки в браузері).

- **Старт** — як у розділі 1, без запобіжника `VITE_BACKEND` (моків кіта немає) і з іншим списком: `update v1.5.0 --items base,erp/app-shell,erp/user-menu,erp/page-state,erp/data-table,erp/form-field,erp/form-select,erp/auth-card,erp/login-form`; решта набору — `--add` за потребою. i18next лишається (SPEC §11): `main.tsx` — як у розділі 1, без моків.
- **Вхід** — `LoginForm` з `erp/login-form` у картці `AuthCard` з `erp/auth-card`. Запит, сесію й перехід після входу робить проект; форма перевіряє поля, тримає кнопку зайнятою й показує причину відмови своїм текстом мовою інтерфейсу. Перше поле — логін (за замовчуванням) чи `identifier="email"`; посилання «Забули пароль?» — `forgotPassword`.

```tsx
import { useNavigate } from "react-router"

import { AuthCard } from "@/components/erp/auth-card"
import { LoginForm, type AuthFormFailure } from "@/components/erp/login-form"
import { useErpUiT } from "@/lib/i18n"
import { ukSignIn } from "@/lib/i18n-uk-sign-in"

/** Відповідь свого сервера → причина відмови: текст сервера (`{ error }` англійською) людині не показуємо. */
function failureOf(res: Response): AuthFormFailure {
  if (res.status === 401) return { kind: "credentials" }
  if (res.status === 429) {
    const seconds = Number(res.headers.get("Retry-After"))
    return { kind: "rateLimited", retryAfterSeconds: seconds > 0 ? seconds : undefined }
  }
  return { kind: "server" }
}

export function LoginPage() {
  const t = useErpUiT(ukSignIn) // рядки входу кіта — частиною (ADR-0094)
  const navigate = useNavigate()
  return (
    <AuthCard title={t("auth.title")}>
      <LoginForm
        onSubmit={async ({ identifier, password }) => {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ login: identifier, password }),
          })
          if (!res.ok) return failureOf(res)
          void navigate("/")
          return undefined
        }}
      />
    </AuthCard>
  )
}
```

- **Причини відмови** (`AuthFormFailure`): `credentials`; `rateLimited` — з `retryAfterSeconds` (до години) кнопка чекає з відліком і стає доступною сама, без секунд (наприклад, денний ліміт) — «Спробуйте пізніше»; `linkInvalid`; `offline`; `server`; `message` — свій рядок проекту мовою інтерфейсу, а не текст відповіді сервера (той може розкрити, чи є такий логін). Збій мережі `fetch` кидає `TypeError`: не перехоплюйте його, форма покаже «Немає з'єднання». Кинута помилка видна в консолі (`erp-ui: sign-in request failed`): `TypeError` у своєму коді `onSubmit` теж дасть «Немає з'єднання», тож шукайте там. Після успіху форма лишається зайнятою, поки проект переходить далі.
- **Сесія в cookie.** `HttpOnly`, `SameSite=Strict` і `Path=/api` браузер обробляє сам: запити того самого походження несуть cookie без `credentials: "include"`, а заголовок `Sec-Fetch-Site: same-origin`, на який спирається сервер без CSRF-токена, ставить браузер. Шлях API — абсолютний (`/api/…`), не від бази екрана. Сервер перевіряє заголовок на кожному запиті, що змінює дані, також на вході й виході; без заголовка (старий браузер, не браузер) — `Origin` чи відмова; GET нічого не змінює; ліміт спроб однаковий для наявного й неіснуючого логіна.
- **Запрошення й скидання пароля** — `SetPasswordForm` з `minLength` проекту (без нього — типовий кіта, 10) і `context` (логін, ім'я: їх не має бути в паролі). Токен у `#` (`/invite#токен`) не йде на сервер ні з запитом сторінки, ні в `Referer`. Прочитайте його один раз і приберіть з адреси: він зникне з поля адреси й кнопки «Назад», але історія браузера посилання вже запам'ятала, тож на сервері токен одноразовий і короткоживучий. Порожній чи не того формату токен (зокрема після перезавантаження сторінки) — одразу «Посилання недійсне», без форми. Токен — лише в тілі запиту: у шляху `fetch` токен `../users/5` став би запитом того самого походження до іншого маршруту, і `Sec-Fetch-Site` його пропустив би. Відповідь про посилання — своя: недійсне, застаріле, використане → `linkInvalid`; відмова правил пароля → `message` зі своїм текстом; `credentials` тут не підходить.

```tsx
// Імпорти — як у LoginPage, плюс useState, useEffect, useLocation і Alert, AlertDescription з ui/alert.
const TOKEN = /^[\w-]{16,256}$/ // формат токена вашого сервера

export function InvitePage() {
  const t = useErpUiT(ukSignIn)
  const navigate = useNavigate()
  const { pathname, hash } = useLocation()
  const [token] = useState(() => hash.slice(1)) // один раз: далі адреса без токена
  useEffect(() => {
    void navigate(pathname, { replace: true })
  }, [navigate, pathname])
  return (
    <AuthCard title={t("auth.reset.title")}>
      {TOKEN.test(token) ? (
        <SetPasswordForm
          minLength={12}
          onSubmit={async ({ password }) => {
            const res = await fetch("/api/auth/invite", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token, password }),
            })
            if (res.ok) {
              void navigate("/login")
              return undefined
            }
            if ([400, 404, 410].includes(res.status)) return { kind: "linkInvalid" }
            return { kind: "server" }
          }}
        />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{t("auth.link.expired")}</AlertDescription>
        </Alert>
      )}
    </AuthCard>
  )
}
```

- **Брама й ролі — у проекті.** Запит профілю (`/api/me`): 401 — на `/login`, поки вантажиться — `LoadingFallback`, збій — `PageState` з `onRetry` і `headingLevel={1}` у `PageStateMain` (усе з `erp/page-state`). Пункти навігації за роллю — у `nav` для `AppShell`; меню користувача — `UserMenu` з `onSignOut` проекту, пункти палітри й щільності проект може сховати, мову — зберегти в себе (`onLanguageChange`, ADR-0098).
- **Поля форми** — `FormField` з `erp/form-field` (react-hook-form + zod, розділ 3). `UnsavedChangesGuard` з `erp/form` тягне ra-core: у легкому проекті — без нього чи свій `beforeunload`. `FormSelect` без `FormField` — з `aria-label` (тип вимагає назву).
- **Таблиця** — `DataTable` з `rows` (розділ 2, «Малий список»); сортування — `DataTableSort` (`{ field, order: "ASC" | "DESC" }`) з `lib/data-table-core`, `getRowId` — рядок (`String(row.id)`). Великий список (`hooks/use-windowed-list`) потребує шару даних кіта, вибір рядків (`hooks/use-row-selection`) — `@tanstack/react-query`: обидва поза легким набором.
- **Екран не в корені сайту** (старий екран лишається на `/`): `base: "/new/"` у `vite.config.ts`, роутер — `createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, "") })`, посилання оболонки — `renderLink={(href) => <Link to={href} />}` з адресами без бази (`/suppliers`). Ассети, шрифти й англійські рядки кіта йдуть від бази самі; сервер віддає `index.html` на будь-яку адресу під `/new/`. Поза набором абсолютна адреса лишається у фонового файла push (`/erp-ui-push-sw.js`, ADR-0046).
- **Модулі згодом** — сервер під контракт кіта (розділ 5) чи адаптер (розділ 5, «Наявний бекенд через адаптер»).

## 2. Компоненти

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add ui/button,ui/dialog
npx shadcn@latest list VasulenkoIllia/erp-ui              # усе, що є
npx shadcn@latest search VasulenkoIllia/erp-ui -q таблиця  # пошук
```

Компоненти лягають у `src/components/ui/`, імпорти — `@/components/ui/button`. Кожен елемент приносить усе, що йому потрібно (наприклад, `ui/dialog` — ще й кнопку та `cn`). Ставте елементи командою кіта (`--add`), а не `shadcn add` напряму: так елемент потрапляє в `kit-files.json` і оновлюється разом з рештою (§8). Команди `shadcn add VasulenkoIllia/erp-ui/<елемент>` у розділах нижче — назви елементів для `--add`.

Малий список (десятки записів, свій API, без вікон з сервера) складається з тих самих елементів, окремих «легких» немає; усі вони — у легкому наборі (розділ 1, «Легкий набір»):

- таблиця — `erp/data-table` з `rows` (поточна сторінка; `undefined` — ще вантажиться) і, за потреби, `pagination` замість `list`: ті самі стани, сортування й картки на телефоні (`cardsBelow`);
- вибір файла — `erp/file-drop`: кнопка й перетягування, тип і розмір перевіряються біля поля;
- вибір з короткого списку — `erp/form-select` у `FormField` чи без форми (`aria-label` чи `id` під свій `<label>`); значення — рядок чи число (id з бази), що в `items`, те й прийде в `onValueChange`: `<FormSelect<number | null> …>` (ADR-0099).

## 3. Мови й формати

У `src/main.tsx` до рендеру застосуйте вподобання вигляду й створіть i18next із рядками проекту (ADR-0007, ADR-0008):

```tsx
import { getAppearance, initAppearance, syncLanguage } from "@/lib/appearance"
import { createI18n, whenI18nReady } from "@/lib/i18n"
import uk from "@/i18n/uk.json"

initAppearance() // палітра, тема, щільність, сайдбар і мова з кешу (на сервері — PF11)
const i18n = createI18n({
  language: getAppearance().language,
  resources: {
    uk: { app: uk },
    // Інші мови — окремим чанком: у пам'яті лише мова інтерфейсу (ADR-0009).
    en: () => import("@/i18n/en.json").then((m) => ({ app: m.default })),
  },
  defaultNamespace: "app",
})
syncLanguage(i18n)
await whenI18nReady(i18n) // перший кадр — уже потрібною мовою, без проблиску української
```

- Рядки компонентів кіта (простір імен `erp-ui`) підключаються самі: на старті українська база (`i18n-uk-base`: каркас застосунку й загальні рядки компонентів), рядки функції приходять разом із її компонентом (ADR-0094), англійські довантажуються цілими, коли потрібні. `changeLanguage` чекає на рядки, тож мова перемикається вже з перекладами. Перевизначити рядок: `i18n.addResourceBundle("uk", "erp-ui", { common: { close: "Закрити вікно" } }, true, true)`; так само й рядок функції: її частина доливається пізніше й доданого не перезаписує. Для інших мов — лише після того, як мову завантажено (`await i18n.loadLanguages("en")`): раніше доданий бандл позначить простір імен готовим, і кіт свої рядки цієї мови не довантажить.
- Рядок функції кіта у своєму коді (наприклад, `roles.title`, `audit.categories.*`, `filterBar.*` чи `recordForm.*`) — передайте її частину в хук: `const t = useErpUiT(ukRoles)`, частина — `import { ukRoles } from "@/lib/i18n-uk-roles"`. Файл частини — за розділом ключа, див. `src/lib/i18n-uk-*.ts`. Без цього на сторінці, яку відкрили першою, видно ключ замість тексту. Так само, коли ваш компонент дає `t` помічнику кіта з рядками функції: `deviceLabel` бере `ukSecurity`, `partyClause` — `ukPrint`, `documentTemplateVariables` — `ukDocumentGenerator`, `ukParty` і `ukPrint`. У тесті без компонента частину додає `addStrings(i18n, ERP_UI_NAMESPACE, ukRoles)`. Рядки бази (`common`, `pageState`, `apiErrors`, `forms`, `validation`, `dates`, `confirm`, `dataTable`…) беруться, як і раніше, `useErpUiT()`.
- Рядки проекту можна ділити так само (за бажанням): у `src/i18n/uk.json` — шапка застосунку, тексти сторінки — свій `src/i18n/uk/orders.json` з тими самими ключами, а сторінка підключає його `useStrings("app", ukOrders)` до першого `t()`. Тоді тексти сторінки приходять із її чанком, а не на старті. Англійські лишаються одним файлом. Зразок — `apps/demo/src/i18n/pages.ts` і `useDemoTranslation` у репозиторії erp-ui, тип ключів зі злиття частин — `apps/demo/src/i18n/i18next.d.ts`.
- Мова не довантажилась (офлайн): два повтори, далі запасна українська й `<html lang="uk">`; наступний `changeLanguage` пробує знову. Скажіть про це людині, поки `toLanguage(i18n.language) !== toLanguage(i18n.resolvedLanguage)`: сповіщення з «Повторити» (`i18n.changeLanguage(i18n.language)`), зразок — `apps/demo/src/i18n/fallback-notice.ts` у репозиторії erp-ui.
- Множина — ключі `_one/_few/_many/_other` для uk і `_one/_other` для en: `t("invoices", { count })`.
- Типізовані ключі — оголошення `CustomTypeOptions` у проекті (приклад — `apps/demo/src/i18n/i18next.d.ts` у репозиторії erp-ui).
- Числа, суми й дати — лише через `useFormat()` з `@/lib/format`. Не пишіть шаблони на кшталт `DD.MM.YYYY` і не викликайте `toLocaleString` напряму:

```tsx
const format = useFormat()
format.money({ amount: 4_860_000, currency: "UAH" }) // 48 600,00 ₴ · ₴48,600.00
format.date("2026-10-13", "long")                    // 13 жовтня 2026 · 13 October 2026
format.relative(updatedAt)                           // 5 хвилин тому · 5 minutes ago
```

- Мова даних (назви компаній, документи) — окремо від мови інтерфейсу: форматери з `lib/format` приймають локаль явно.
- Ідентифікатори й телефони: `node scripts/erp-ui-kit.mjs update v1.5.0 --add erp/ua-id-input,erp/phone-input`. Перевірка — `validateUaId(kind, value)` і `validatePhone(value)`; текст помилки — `t(uaIdIssueKey(kind, issue))` з `useErpUiT()`.
- Поле телефону тягне дані libphonenumber (~120 КБ gzip): вантажте екрани з ним окремим чанком (`lazyWithPreload` з `@/lib/lazy`).
- Вибір запису з пошуком на сервері (компанія контакту, відповідальний) — `erp/record-picker` (ADR-0023): значення — `id`, `optionLabel` і `sort` від проекту, «Створити…» — `create.onCreate(query)` відкриває форму проекту, а новий запис проект сам ставить у значення. Реквізити в картці з «Копіювати» — `erp/copyable-value` (`kind`: `code`, `iban`, `phone`, `email`, `url`).
- Кілька значень із короткого довідника (сегменти, теги, ролі) — `MultiSelect` з `erp/multi-select` (ADR-0027): `options` — `{ value, label, description? }[]` (поки довідник вантажиться — не задавайте; не завантажився — `error` і `onRetry`), значення — масив ключів (`value`, `onValueChange`), `clearable`; на телефоні — шторка з «Готово». Ключ, якого вже немає в довіднику, лишається міткою, і його можна зняти. У `FormField` — `{...control}`, `value={field.value}`, `onValueChange={field.onChange}`, `onBlur={field.onBlur}`. Довідник на сотні записів і пошук на сервері — не сюди: мультивибору з пошуком на сервері ще немає.

### Форми, дати, суми й підтвердження (ADR-0015)

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add erp/form,erp/date-input,erp/number-input,erp/confirm-dialog
```

- Форма — react-hook-form + zod: `useForm({ mode: "onTouched", resolver: zodResolver(schema) })`. Схему будуйте в компоненті з `useErpUiT()`/`t` у `useMemo`, щоб помилки були мовою інтерфейсу. Зразок — `erp/profile-form`, повний приклад — `apps/demo/src/pages/FormsPage.tsx`.
- Пакети `zod` і `@hookform/resolvers` ставить `erp/profile-form`; для своїх форм без нього — `pnpm add zod @hookform/resolvers`.
- Поле — `FormField` з `control` і `name`; у `render` віддайте `control`-пропси керуванню (`<Input {...control} {...field} />`). Для полів дати, суми й телефону — явно: `ref={field.ref} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur}`. Поле без прав — `readOnly`, не `disabled`. Схема з `.transform`/`z.coerce` — `useForm<Вхід, unknown, Вихід>`. `FormField` з'єднаний з формою легким `useFieldController` (ADR-0063): поле перемальовується лише зі зміною свого стану, тож у рядках і довгих формах беріть його, а не `Controller`.
- Над полями — `FormErrorSummary` (`errors`, `submitCount`, `labels`); під формою — `UnsavedChangesGuard when={isDirty}` (і під час збереження: після успіху перехід відбудеться сам).
- «Зберегти» не вимикайте: лише `disabled={isSubmitting} focusableWhenDisabled`. Помилки полів від сервера (422) — `form.setError(name, { type: "server", message })`.
- Кнопкам форми (відправка, «Скасувати») — `onMouseDown={keepFieldFocus}` з `erp/form` (ADR-0027): поле перевіряється при виході з нього, і без цього помилка під полем зсуває кнопку між натисканням і відпусканням миші — перший клік губиться. Клавіатури й дотику це не змінює.
- Дата — `DateInput` зі значенням `"2026-10-13"` або `""`; неповне введення приходить текстом, текст помилки для схеми — `useDateIssueText()(value, { min, max })` (null — помилки немає). Період — `DateRangeInput` (`{ from, to }` або `null`), час — `TimeInput`.
- Текст полів кіта на дотиковому екрані — 16 px (телефон і планшет не збільшують сторінку на фокусі), з мишею — 14 px (ADR-0096); своє поле — так само, `text-base pointer-fine:text-sm`, а не `md:text-sm`. Список прапорців із кроком менше 44 px (права, події, канали): рядкам — `pointer-coarse:min-h-touch`, інакше на дотиковому екрані зона прапорця 44 px залазить на квадрат сусіда (як у `erp/filter-panel`).
- Сума — `MoneyInput` зі значенням `Money` (цілі копійки й валюта) або `null`; число — `NumberInput` (за замовчуванням ціле: кома й дріб не вводяться, під полем спливає «Лише ціле число»; дріб — `decimalScale`). Сума прописом для документів — `amountInWords(money, "uk")` з `lib/amount-in-words`.
- Підтвердження: зворотна дія — `useUndoToast()`; видалення — `ConfirmDialog` з кнопкою, що називає наслідок; критична дія — ще й `confirmWord`.
- Календар (react-day-picker і date-fns) і react-hook-form важать помітно: вантажте сторінки з формами окремим чанком (`lazyWithPreload` з `@/lib/lazy`).
- Форма запису ресурсу (створення й зміна) — `RecordFormDialog` з `erp/record-form` і `useRecordForm` з `hooks/use-record-form` (ADR-0026): `const state = useRecordForm({ resource, record, schema, defaultValues, recordSchema, toPayload, toValues, onSaved })` створює форму з налаштуваннями вище (`state.form`), `POST` усіх полів, `PATCH` лише змінених з `version`, 409 — порівняння змінених полів («Зберегти мої зміни», «Взяти збережене»; `current` розбирає `recordSchema` — схема контракту з полями розширення), 422 — біля полів і в зведенні (поле, якого у формі немає, — над формою), «Закрити без збереження?» для зміненої форми. `finalFocus` — кнопка, що відкрила форму (Safari кнопку кліком не фокусує); форма поверх іншої форми — `nested`. Поля — `RecordFormItem` (`{ id, label, description?, wide?, render, text? }`, ключ — ім'я поля форми), вибір зі списку — `FormSelect` з `erp/form-select`. Діалог монтуйте, лише поки він відкритий (`{editing ? <Форма /> : null}`); `onSaved` викликається після рендера зі скинутою формою, тож перехід на картку нового запису в ньому не зупиняє `UnsavedChangesGuard`. Форма тягне react-hook-form і поля вводу: у сторінку її ставте лінивим чанком (`lazyWithPreload`, попереднє завантаження через `whenIdle`), поки чанк вантажиться чи не завантажився — діалог із назвою форми, спінером чи «Спробувати ще» (так у B1, `components/form-dialogs.tsx`).
- Повторювані рядки — `RepeatingRows` з `erp/repeating-rows` (ADR-0047): `control`, `name`, `label`, `rowLabel`, `addLabel`, `newRow`, `renderRow`, за потреби `minRows`, `maxRows`, `canReorder`. Поля рядка — `FormField` з іменем `` `${name}.${index}.поле` ``, `rowLabel` підписує рядок і його кнопки для скрінрідера. Порядок міняють кнопки, перетягування кіт не дає. Помилку всієї групи (сума частин) пишіть у `superRefine` схеми масиву, вона стане під рядками.
- Пари «назва, значення» — `KeyValueField` з `erp/key-value-field`: значення форми — масив рядків, `keyValueRows` і `keyValueRecord` з `lib/key-value` перетворюють його на об'єкт API й назад, `keyValueSchema` дає перевірку.
- Довга форма на сторінці — `RecordFormPage` з `erp/record-form-page` (ADR-0047): ті самі `useRecordForm` і поля, що в `RecordFormDialog`, плюс `SaveBar` з `erp/save-bar`. Запис, який сторінка перечитує, передавайте з `followRecord: true`: форма візьме свіжі значення й версію, поки в ній немає змін. Свою форму без запису можна поставити на `SaveBar` напряму: останньою всередині `<form>`, у картці панель теж липне.
- Елемент вкладеної колекції запису (адреса, банківський рахунок, ADR-0028) — та сама форма запису: `PATCH` запису з усією колекцією й `version`, тож чужа зміна колекції дає 409, а не губиться. `toPayload(values, keys, target)` застосовує зміну до `target` — збереженого запису, а після «Зберегти мої зміни» — того, що збережений зараз; `id` нового елемента дає сервер. Помилка сервера зі шляхом елемента (`bankAccounts.1.iban`) стає біля поля форми через `fieldOfServerError: (field) => field.replace(/^bankAccounts\.\d+\./, "")`. У моках `createResourceHandlers` такі колекції — `detailFields` (зберігаються разом із записом, у список не йдуть), показ у журналі «було → стало» — `auditValue`. Зразок — форми адреси й рахунку в B1 (`components/address-form.tsx`, `components/bank-account-form.tsx`).

## 4. Оболонка застосунку

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add erp/app-gate,erp/app-shell,erp/command-palette,erp/shortcuts-help,erp/user-menu,erp/company-switcher,erp/notification-inbox
```

Застосунок — брама сесії навколо оболонки, екрани входу поруч (розділ 6):

```tsx
const auth = useMemo(() => createAuthRoutes({ afterLogin: "/", title: t("app.title") }), [t])   // erp/auth-routes
const signOut = useSignOut()                                                 // erp/app-gate

useRoutes([
  ...auth.routes,
  { path: "*", element: <SessionGate><Shell /></SessionGate> },
])
```

`SessionGate` (ADR-0029): гість — на `/login` (після входу ra-core поверне на ту саму адресу); поки сесія й профіль перевіряються вперше — спінер (повторна перевірка після «Увійти як…» оболонку не прибирає); профіль не завантажився (мережа, 5xx) — стан помилки з h1 і «Спробувати ще», а не «Увійти»: людина, можливо, вже увійшла; далі — вміст і `SessionGuard` (попередження перед кінцем сесії, автовихід за політикою сервера, вихід у всіх вкладках). `SessionGuard` окремо не ставте: брама ставить його сама, свої параметри — `<SessionGate idleMinutes={30} warnSeconds={120}>`. `useSignOut()` — для меню користувача: «Ви вийшли» чи помилка, якщо сервер не завершив сесію (офлайн, 5xx, 10 с без відповіді), щоб людина не думала, що вийшла. Потрібен `<Toaster />` з `ui/sonner`.

```tsx
<IconProvider>
  <TooltipProvider>
    <AppShell
      nav={[{ id: "sales", label: t("nav.sales"), items: [
        { id: "K2", label: kitT("modules.K2"), href: "/invoices", icon: MODULE_ICONS.K2, mobile: true },
      ] }]}
      activeId="K2"
      breadcrumbs={[{ label: t("nav.sales") }, { label: kitT("modules.K2"), href: "/invoices" }, { label: invoice.number }]}
      header={<CompanySwitcher companies={me.companies} value={companyId ?? ""} onValueChange={switchCompany} />}
      actions={<>
        <CommandPaletteTrigger onClick={openPalette} />
        <InboxBell onNavigate={navigate} onShowAll={() => navigate("/notifications")} />
        <UserMenu user={me} onSignOut={signOut} />
      </>}
      renderLink={(href) => <Link to={href} />} // React Router; без нього — <a href>
    >
      {page}
    </AppShell>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
  </TooltipProvider>
</IconProvider>
```

- Гарячі клавіші (ADR-0042): усі клавіші кіта — у `SHORTCUTS` з `lib/shortcuts`. Довідка `erp/shortcuts-help` відкривається клавішею `useShortcut(SHORTCUTS.help, openHelp)` (`hooks/use-shortcut`, `openHelp` — стабільна функція в `useCallback`) і командою палітри `{ id: "shortcuts-help", label: kitT("shortcuts.items.help"), onSelect: openHelp, … }`. Команда обов'язкова: людина може вимкнути «?» у самій довідці (WCAG 2.1.4), і палітра лишається єдиним способом увімкнути її назад. Вибір зберігається в цьому браузері, а не на сервері.
- Дії відкритого запису в палітрі (ADR-0044): картка описує їх даними, `usePaletteActions(record && { title: record.name, actions: [{ id: "edit", label: t("edit"), onSelect: openEdit, deniedReason }] })` з `hooks/use-palette-actions`, палітра показує їх першою групою сама, проект нічого не прокидає. Дія без права лишається в списку з причиною (`deniedReason`), перехід на вкладки — `useSectionActions(sections, tabs.onValueChange)`.
- Своя клавіша проекту: константа модуля `const CREATE = { keys: [{ key: "i", mod: true }] }` (`mod` — ⌘ на Mac, Ctrl деінде; працює й на українській розкладці), `useShortcut(CREATE, onPress)` і підпис у довідці: `<ShortcutsHelp extra={[{ ...CREATE, id: "invoice", label: t("…") }]} … />`. Клавіша-символ без модифікатора (`{ key: "n" }`) сама поважає вимикач довідки, поля, меню й діалоги. Клавіші всередині свого компонента обробляйте в компоненті.

- Компанія: `const [companyId, switchCompany] = useCompany()` з `hooks/use-company` (пакунок `data`). Перемикання скасовує запити, скидає дані попередньої компанії й перечитує профіль; свої `useQuery` з даними компанії додають у кінець ключа `companyScope(useCompanyId())` з `lib/company-scope`. Компанія з іншого джерела (напр. з адреси сторінки) — через `setCompanyId` з `lib/company-scope`: `X-Company-Id` і ключі кешу беруться лише звідти.
- Крихти: остання без `href` — поточна сторінка, з `href` — посилання (список над карткою запису, як у прикладі), тож крихті поточної сторінки `href` не давайте; інша крихта без `href` — підпис групи. На телефоні видно лише останню.
- Десктоп — сайдбар із групами, планшет — вузька панель з іконками, телефон — нижня панель (пункти з `mobile: true`, до 4) + «Ще». Довга назва в нижній панелі обрізається: дайте пункту `shortLabel` — слово з `label` («Рахунки» для «Рахунки клієнтам»). Видно короткий підпис, а доступна назва посилання лишається повною; якщо слова в `label` немає, доступна назва — обидва підписи (WCAG 2.5.3).
- Свій `header` (назва продукту, логотип) у вузькій панелі не вміщається: текст сховайте класом `group-data-[collapsible=icon]:hidden` (або `group-data-[collapsible=icon]:sr-only`, щоб скрінрідер його чув), іконку чи логотип лишіть. `CompanySwitcher` робить так сам.
- Іконки модулів, статусів і дій — лише з `lib/icons` (`MODULE_ICONS`, `STATUS_ICONS`, `ACTION_ICONS`); гривня — `HryvniaIcon`.
- Стани списків і сторінок — `PageState` і `PageSkeleton` з `erp/page-state`; порожній стан не підміняє помилку. Рівень заголовка стану — `headingLevel`: 2 за замовчуванням (під h1 сторінки), 1 — стан замість усієї сторінки («Не знайдено» картки), 3 — стан секції чи вкладки.
- Стан у секції, картці чи вкладці — `<PageState kind="empty" compact action={…} />` (ADR-0098): рядок з іконкою, текстом і діями без великого блоку, заголовок h3; на вузькому контейнері дії переносяться під текст. Рамку, якщо секція її не має, дайте `className="rounded-lg border p-3"`; завантаження такої секції — `SectionSkeleton`.
- Меню користувача (ADR-0098): пункти палітри й щільності видно за замовчуванням; проект з однією палітрою чи щільністю ховає їх — `<UserMenu user={me} onSignOut={signOut} showPalette={false} showDensity={false} />`. Тема, мова й темний сайдбар лишаються. Сервер із контрактом PF11 отримує всі вподобання, зокрема мову, через `syncPreferences` (розділ 5). Проект зі своїм API, що зберігає лише мову, бере колбек: `onLanguageChange={(language) => void saveLanguage(language)}`; він приходить, коли мову вже застосовано, і лише на іншу мову. Інші зміни вигляду для такого API — `subscribeAppearance` з `@/lib/appearance`.
- Сітки сторінок — з `grid-cols-1` (`minmax(0, 1fr)`), інакше широка таблиця розпирає сторінку на телефоні.
- Сторінки — лінивими чанками через `lazyWithPreload` з `@/lib/lazy`, не `React.lazy`: той запам'ятовує невдале завантаження назавжди. Сторінку обгорніть у межу помилок із ключем-адресою, тоді чанк, що не завантажився, покаже стан із «Оновити сторінку» й «Спробувати ще», а не білий екран; без мережі лишається лише повтор (ADR-0055). Власний `fallback` межі отримує другим аргументом помилку: при `isChunkLoadError(error)` покажіть `ReloadPageAction` з `erp/error-boundary`, інакше людина після деплою лишиться без виходу. Кнопка сама попередить про незбережені зміни, якщо форма стоїть під `UnsavedChangesGuard`; власна форма без нього викликає `holdUnsavedChanges` з `@/lib/page-reload`, а власний обробник `beforeunload` пропускає запит при `isPageReloading()`. Помилки в моніторинг — `onError` межі. `LoadingFallback` з `erp/page-state` оголошує скрінрідеру «Завантаження», якщо чанк вантажиться понад секунду (новий `role="status"` у fallback скрінрідер часто не озвучує):

  ```tsx
  const InvoicesPage = lazyWithPreload(() => import("@/pages/InvoicesPage").then((m) => m.InvoicesPage))

  <ErrorBoundary key={pathname}>
    <Suspense fallback={<LoadingFallback />}>
      <InvoicesPage />
    </Suspense>
  </ErrorBoundary>
  ```

  Чанк вантажте заздалегідь, коли на посилання навели чи сфокусувались: `renderLink={(href) => <Link to={href} onPointerEnter={() => preloadPage(href)} onFocus={() => preloadPage(href)} />}`, де `preloadPage` викликає `.preload()` сторінки за адресою (зразок — `apps/demo/src/pages/lazy-pages.ts` у репозиторії erp-ui). Палітра команд сама вантажить пошук, коли браузер вільний (ADR-0009).

Щоб тема не блимала до завантаження JS, додайте в `<head>` `index.html` (логіка — як у `lib/appearance`):

```html
<script>
  ;(function () {
    var root = document.documentElement, a = {}
    try { a = JSON.parse(localStorage.getItem("erp-ui:appearance") || "{}") || {} } catch (e) {}
    root.dataset.palette = a.palette || "sapphire"
    root.classList.toggle("dark", a.theme === "dark" ||
      (a.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches))
    if (a.density === "compact") root.dataset.density = "compact"
    if (a.sidebar === "dark") root.dataset.sidebar = "dark"
    root.lang = a.language === "en" ? "en" : "uk"
  })()
</script>
```

## 5. Дані, вхід і моки

Шар даних (ADR-0002, ADR-0003) і моки ставляться двома пакунками:

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add data,mocks,lib/mock-views,lib/query-client
npx msw init public --save   # service worker для моків у браузері; без --save MSW питає в терміналі
```

`CoreAdminContext`, хуки й типи ra-core (`useGetList`, `useUpdate`, `useCanAccess`, `RaRecord`…) беріть з `@/lib/ra-core`: це шов кіта, він ставиться разом із пакунком `data` і кожним модулем (ADR-0090). Кіт імпортує ra-core лише через нього, тож мажорне оновлення бібліотеки зачепить один файл. Прямий імпорт `ra-core` у коді проекту теж працює; ім'я, якого в шві немає, беріть напряму.

Списки на шаблоні List Report читають особисті види (`/me/views`) і розмір сторінки чи згорнуті колонки дошки (`/me/list-settings/<ресурс>`): у моках це `createSavedViewHandlers()` з `@/lib/mock-views` (окремий елемент `lib/mock-views`) і `createListSettingsHandlers()` з `@/lib/mock-lists` поруч з обробниками ресурсів.

```tsx
// src/data/providers.ts
// Політика повторів кіта (lib/query-client, ADR-0029): читання — один повтор через 1 с лише після
// тимчасового збою (офлайн, 5xx); 4xx (зокрема 401 — кінець сесії) і зміни — без повтору.
export const queryClient = createQueryClient()
// X-Company-Id — лише з lib/company-scope (компанію з профілю вибирає authProvider), cookie-сесія
export const api = createApiClient()
export const authProvider = createAuthProvider(api, {
  onMe: (me) => queryClient.setQueryData(ME_QUERY_KEY, me),
})
export const dataProvider = createDataProvider(api)

// src/mocks/handlers.ts — усі обробники, користувачі й фікстури моків живуть лише в src/mocks/
export const handlers = [...createPlatformHandlers({ users }), ...invoices.handlers]

// src/mocks/browser.ts
export async function startMocks() {
  await setupWorker(...handlers).start({ onUnhandledFrame: "bypass", quiet: true })
}

// src/main.tsx — моки окремим чанком і лише з VITE_BACKEND=mocks: з бекендом збирач викидає їх разом із MSW
const mocks = import.meta.env.VITE_BACKEND === "mocks"
  ? import("@/mocks/browser").then((m) => m.startMocks())
  : Promise.resolve()
await Promise.all([mocks, whenI18nReady(i18n)])
createRoot(root).render(
  <CoreAdminContext dataProvider={dataProvider} authProvider={authProvider}
    i18nProvider={createRaI18nProvider(i18n)} queryClient={queryClient}>
    <App />
  </CoreAdminContext>,
)
```

### Моки поза продакшном (ADR-0079)

Звідки застосунок бере дані, каже змінна `VITE_BACKEND` (у `.env.example` — ключ без значення, значення — у `.env.local` чи в змінних сервера збірки): `mocks` — моки MSW, `api` — бекенд за контрактом кіта, своя назва — адаптер (розділ «Наявний бекенд через адаптер»). Значення один раз визначає `vite.config.ts`:

```ts
// vite.config.ts
const BACKENDS = ["mocks", "api"]   // і назва адаптера, якщо він є

export default defineConfig(({ command, mode }) => {
  // Запобіжник: у розробці без змінної — моки, збірка без неї (чи з опискою) зупиняється.
  const backend =
    loadEnv(mode, process.cwd(), "VITE_").VITE_BACKEND || (command === "serve" ? "mocks" : "")
  if (!BACKENDS.includes(backend))
    throw new Error(`VITE_BACKEND="${backend}": очікується ${BACKENDS.join(" чи ")}; збірка без змінної зупиняється`)
  // Збірка на моках — лише змінною команди (e2e, стенд): закомічений .env-файл не дасть продакшну на моках.
  if (command === "build" && backend === "mocks" && process.env.VITE_BACKEND !== "mocks")
    throw new Error("VITE_BACKEND=mocks у збірці — лише змінною команди: VITE_BACKEND=mocks vite build --outDir dist-e2e")
  return {
    // Значення стає в код як є: без моків перевірка `=== "mocks"` викидає їх зі збірки в будь-якому файлі.
    define: { "import.meta.env.VITE_BACKEND": JSON.stringify(backend) },
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  }
})

// src/vite-env.d.ts — ті самі значення, що в BACKENDS
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_BACKEND: "mocks" | "api"
}
```

- `pnpm dev` без змінної працює на моках, як і раніше. Збірка для сервера (`pnpm build`) без `VITE_BACKEND` зупиняється: змінну задають на сервері збірки чи в CI. Забута змінна не дає сайту, що працює на моках із тестовим входом.
- Моки — лише в `src/mocks/` і лише через `import()` під `import.meta.env.VITE_BACKEND === "mocks"`. Обробники, створені поза цією текою (у файлі модуля, у `main.tsx` до умови), тягнуть MSW у перший екран навіть із вимкненими моками: +135 КБ стисненого коду. Розділи модулів нижче показують рядок `setupWorker(...)` у `src/mocks/handlers.ts` скорочено: це обробники, які бере `startMocks`.
- Умова — саме порівняння `import.meta.env.VITE_BACKEND`: збирач підставляє значення й викидає гілку разом із чанком. Стала з окремого файла (`export const isMocks = …`) цього не дає: чанк моків лишається в `dist`.
- Панель сценаріїв (`DevPanel`) — під тією ж умовою.
- Явне `VITE_BACKEND=mocks` у збірці — для e2e і стенду-демо, лише змінною команди (з `.env`-файла збірка `mocks` не бере) і в окрему теку: `VITE_BACKEND=mocks vite build --outDir dist-e2e`. `public/mockServiceWorker.js` від `msw init` лежить і в збірці з бекендом, але реєструє його лише `startMocks`.
- Перевірка: після збірки з бекендом `grep -rlF -e "[MSW]" -e "erp-ui:mock-" dist` нічого не знаходить (додайте рядок, що є лише у ваших моках, напр. пароль користувача моків). Так само кіт у CI перевіряє тестовий проект (`scripts/consumer-smoke.mjs`): без змінної, з опискою й з `mocks` лише з `.env`-файла збірка зупиняється, з `api` моків у `dist` немає, з `mocks` MSW і моки проекту — лише лінивими чанками.
- `node scripts/erp-ui-kit.mjs check` попереджає (код 0), якщо в `vite.config.*` проекту немає `VITE_BACKEND`: старий проект бачить так, що запобіжника ще немає (ADR-0088). Лише коли моки кіта в проекті є: елемент `mocks` у `kit-files.json` чи файл кіта `mocks.ts` (`lib/mocks.ts`, який ставить і модуль кіта, чи моки модуля); проект без моків попередження не бачить (ADR-0096).

- Список: `useGetList("invoices", { pagination, sort, filter: { status: ["paid", "sent"], amount_gte: 10000, q } })` → `GET /api/v1/invoices?status=paid&status=sent&amount_gte=10000&q=…&sort=-date&page=1&perPage=25`. Суми за всім фільтром (дошка, ADR-0100): `meta: { sumOf: ["amount"] }` → `…&sumOf=amount`, сервер відповідає `{ data, total, sums: { amount: 125000 } }`, у ra-core — `meta.sums` результату (`listSums(meta)` з `lib/data-provider`); сервер, що сум не рахує, параметр пропускає (не фільтр), а поле суми бере лише зі свого переліку дозволених. `sumOf`, як `page`, `perPage` і `sort`, — не ім'я фільтра.
- Таблиця (ADR-0016) — `DataTable` з `erp/data-table`: колонки описуються один раз для гріда й карток (на контейнері вужчому за 40 rem — картки), сортування й фільтри — на сервері.

  ```tsx
  const columns: DataTableColumn<Invoice>[] = [
    { id: "number", header: t("number"), cell: (r) => r.number, sortField: "number", sticky: true, card: "title" },
    { id: "client", header: t("client"), cell: (r) => r.client, priority: 2, overflow: "wrap", card: "subtitle" },
    { id: "amount", header: t("amount"), cell: (r) => format.money(r.amount, r.currency), sortField: "amount", align: "end", firstSortOrder: "DESC" },
    { id: "dueDate", header: t("dueDate"), cell: (r) => format.date(r.dueDate), priority: 3, overflow: "hide" },
  ]
  // Великий список: вікна по 100 з сервера, прокрутка на висоту екрана.
  // hooks/use-windowed-list ставлять шаблони списку; лише з erp/data-table — `--add hooks/use-windowed-list`.
  const list = useWindowedList<Invoice>("invoices", { sort, filter })
  <DataTable label={t("tableLabel")} columns={columns} getRowId={(r) => r.id} list={list} sort={sort} onSortChange={setSort}
    isFiltered={Boolean(filter.q)} onResetFilters={reset} countLabel={(count, value) => t("count", { count, value })} />
  // Малий список: rows={data} pagination={{ page, perPage, total, onPageChange }} і стани з useGetList.
  ```

  Стани (скелетон, оновлення, порожньо, нічого не знайдено, помилка, немає доступу, офлайн, збій частини рядків) таблиця показує сама; `useUpdate` оновлює рядок у кеші вікна. Сторінку списку цілком збирає шаблон List Report (нижче); колонки рахунків у демо — `src/pages/invoice-columns.tsx`.
- Сторінка списку (ADR-0022) — шаблон List Report з `templates/list-report`: заголовок і дії, вкладки-статуси, панель фільтрів, особисті збережені види (ADR-0017), панель масових дій і таблиця. Стан списку живе в адресі сторінки тим самим синтаксисом, що й запит до API (`?tab=overdue&client=A&amount_gte=1000000&sort=-date`); роутер дає застосунок:

  ```tsx
  const tabs: ListTab[] = [{ id: "all", label: t("all"), filter: {} }, { id: "overdue", label: t("overdue"), filter: { status: "overdue" } }]
  const filters: FilterDefinition[] = [
    { kind: "options", id: "client", field: "client", label: t("client"), options },
    { kind: "date-range", id: "date", field: "date", label: t("date") },         // date_gte, date_lte
    { kind: "money-range", id: "amount", field: "amount", label: t("amount"), currency: "UAH" }, // мінорні одиниці
  ]
  // tabs, filters, defaults і columns — стабільні між рендерами (useMemo чи константа модуля).
  const [params, setParams] = useSearchParams()                  // React Router
  const report = useListReport({ resource: "invoices", params, onParamsChange: setParams, tabs, filters,
    defaults: { tab: "all", sort: { field: "date", order: "DESC" }, sortFields: ["number", "date", "amount"] } })
  <ListReport report={report} title={t("title")} tableLabel={t("tableLabel")} columns={columns}
    tabsLabel={t("status")} searchPlaceholder={t("search")} countLabel={(count, value) => t("count", { count, value })}
    actions={[{ id: "create", node: <Button onClick={create}>{t("create")}</Button> }]}
    mode="scroll" />                                             // малий список — mode="pages"
  ```

  Колонки, фільтри, вкладки й дії — списки з ключами, порядок на екрані — порядок у списку: розширення модуля додає, ховає чи переставляє елемент за ключем (ADR-0020). Поки види вантажаться, таблиця — скелетон: дані не вантажаться двічі. Без `title` шапки в шаблоні немає: її ставить сторінка (`PageHeader` з `erp/page-header`, стара назва `ListReportHeader` — той самий компонент), напр. над перевіркою сесії, щоб шапка не з'являлась заново; сторінка без списку (налаштування, форма) теж бере `PageHeader`, а не шаблон списку. Збирати список вручну з `StatusTabs`, `FilterBar`, `SavedViewsMenu`, `useListState` і `DataTable` не треба; повний приклад — `src/pages/DataPage.tsx` у демо.

  Подання (ADR-0091) — ті самі записи дошкою, календарем чи картками з тими самими вкладками, фільтрами, видами й вибором: `useListReport({ …, layouts })`, де `layouts` (у `useMemo`) — `[{ id: "table", label, icon: LAYOUT_ICONS.table }, { id: "board", label, component: DealsBoard }]` (іконки подань — `LAYOUT_ICONS` з `lib/icons`; нове подання додає туди свою). Подання без `component` — таблиця шаблону, перше — за замовчуванням. Компонент подання отримує `ListReportContentProps` (`resource`, `label`, `filter` — вкладка поверх панелі, `sort`, `onSortChange`, `isFiltered`, `onResetFilters`, `selection`, `bulkActions` — масові дії `bulk` для своєї панелі вибраного), сам вантажить записи й показує стани колекції (скелетон, помилка з повтором, «нічого не знайдено» з `onResetFilters`, «порожньо»). Перемикач «Подання списку» шаблон ставить сам біля «Фільтри»; вибране подання — в адресі (`?layout=board`) і у збереженому виді, «Стандартний» вид і «Скинути фільтри» його не міняють, а інше подання, як і інша вкладка, скидає вибір. У списку з поданнями поле фільтра не називайте `layout`. Зразок — подання «Картки» в `src/pages/OrganizationsPage.tsx` демо.

  Дошка (ADR-0100) — подання з `templates/board`: колонки за полем запису, кожна колонка — свій запит із фільтром списку, у шапці кількість і сума, «Показати ще», доріжки, згортання, швидке створення й «Перемістити в…» у меню картки (з клавіатури, без перетягування); на контейнері вужчому за 42rem — одна колонка з перемикачем.

  ```tsx
  function DealsBoard(props: ListReportContentProps) {          // подання списку з layouts
    const columns = useMemo<BoardColumn[]>(() => STAGES.map((id) => ({
      id, label: t(`stages.${id}`), collapsed: id === "lost",      // згорнута, поки людина не вибрала свого
    })), [t])
    const sum = useMemo(() => ({ field: "amount", format: (amount: number) => format.money({ amount, currency: "UAH" }) }), [format])
    return (
      <Board<Deal> {...props}
        field="stage"                                              // значення поля — id колонки
        columns={columns}
        cardLabel={(deal) => deal.title}
        renderCard={(deal) => <DealCard deal={deal} />}
        sum={sum}                                                  // необов'язково
        lanes={{ items: owners, of: (deal) => deal.ownerId ?? "" }} // необов'язково; невідома доріжка — «Інше»
        quickCreate={{ field: "title", label: t("title") }}        // без права create кнопки немає
        lockedBy={(deal) => deal.editedBy ?? undefined}            // «Редагує …» (ADR-0051)
        denialText={denialText}                                    // слова модуля для deniedActions запису
        countLabel={(count, value) => t("count", { count, value })} />
    )
  }
  ```

  Перенесення за замовчуванням — `update` поля колонки з версією запису (409 — повідомлення й оновлена дошка); перехід статусу через свою дію — `move: (record, column) => …`. Без права `update` (свій текст причини — `moveDenied`), з `deniedActions.update` запису чи коли картку редагує інша людина меню показує причину замість колонок. Згорнуті колонки людина вибирає сама, вибір зберігається в `/me/list-settings/<ресурс>` (`collapsedColumns`); `collapsed` у колонках — лише за замовчуванням. Бекенд без `sumOf` теж працює: сума — лише в колонці, завантаженій повністю; сервер, що вважає кожен невідомий параметр фільтром, оновлює розбір (`fromSearchParams` кіта) чи дошка йде без `sum`. Колонки покривають усі значення поля: «усі за фільтром» у масових діях бере фільтр списку без колонки. Без `templates/board` (легкий набір) — `erp/kanban` з власними даними. Зразок — `src/pages/BoardPage.tsx` демо.

  Закріплення записів угорі списку (ADR-0024) — колонка `usePinColumn({ resource, name })` з `erp/pin-toggle` першою в `columns` і `isPinned={isPinned}` (з `lib/pins`) у `ListReport`; порядок «закріплені спершу» дає сервер (`PUT`/`DELETE /<ресурс>/:id/pin`, `pinned: true` у відповіді), у моках — `pins: true` у `createResourceHandlers`. У шапці картки — `<PinToggle variant="button" … />`. Бекенд без закріплення — розширення ховає колонку `pin`. Розмір сторінки в `mode="pages"` запам'ятовується сам (`/me/list-settings/<ресурс>`, у моках — `createListSettingsHandlers()`); інші розміри — `perPageOptions`, без вибору — `perPageOptions={[]}`.

  Адреса — ввід ззовні: з `filters` у запит ідуть лише описані фільтри й `q`, сортування — лише за `sortFields`. Поки види вантажаться, `isReady` — false: якщо сторінку відкрили без параметрів, спершу застосується вид за замовчуванням, і список не вантажиться двічі. Бекенд реалізує `/me/views` за контрактом `lib/saved-views`; у моках — `createSavedViewHandlers()` поруч з іншими обробниками, сценарій — ресурс `views` у панелі розробника.
- Картка запису (ADR-0019) — шаблон Object Page з `templates/object-page`: «Назад до списку», шапка з даних (назва — h1, статус, ключові поля, дії), смуга етапів, секції й стрічка запису праворуч чи вкладкою (за шириною контейнера):

  ```tsx
  const heading = useRef<HTMLHeadingElement>(null)
  // Фокус на h1 після переходу (WCAG 2.4.3), той самий хук — для списку; адресу дає роутер.
  useFocusHeadingOnNavigation(heading, useLocation().pathname, !isPending || pageError !== undefined)
  <ObjectPage title={t("invoice")} headingRef={heading} back={<BackLink />}
    isPending={isPending} error={pageError} onRetry={retry}
    header={invoice && { title: t("title", { number: invoice.number }), status: <StatusBadge status={invoice.status} />,
      fields: [{ id: "client", label: t("client"), value: invoice.client }],
      actions: [{ id: "edit", node: <EditButton invoice={invoice} /> }] }}
    statusBar={invoice && <RecordStatusBar label={t("steps")} steps={steps} current={invoice.status} />}
    sections={invoice ? [{ id: "lines", title: t("lines"), content: <InvoiceLines invoice={invoice} /> }] : []}
    aside={{ label: t("history"), content: <RecordHistory target={{ type: "invoices", id, name: invoice?.number }} /> }} />
  ```

  Ключові поля, дії й секції — списки з ключами, як у List Report. Поки запису немає, `header` не передається: h1 — прихований `title`. Дані — `useGetOne` з `meta` компанії: шапка одразу з кешу списку, детальний запис (рядки документа) — з `GET /<ресурс>/:id` (у моках — опція `detail`; поле, значення якого не повторюється в компанії, — `unique: ["name"]`, сервер відповідає 422 `duplicate`); помилку запису передавай лише коли запису немає, інакше це стан секції. Повний приклад — `src/pages/InvoicePage.tsx` у демо.

  Багато розділів — вкладками (ADR-0024): `tabs={{ value: searchParams.get(TAB_PARAM), onValueChange: (tab) => setSearchParams(…, { replace: true }) }}`. Вкладки — ті самі `sections` з ключами (вкладка розширення — секція слота), змонтована лише вибрана, тож вкладка вантажить свої дані, коли її відкрили; невідомий ключ з адреси — перша вкладка; на вузькому контейнері стрічка — остання вкладка (`OBJECT_PAGE_ASIDE_TAB`). Приклад — `src/pages/OrganizationPage.tsx` у демо.
- Вибір рядків і масові дії (ADR-0018). Вибір живе на сторінці й скидається зі зміною фільтра; таблиця сама додає колонку прапорців і панель вибраного. Дія — фонова задача сервера, прогрес і підсумок — у сповіщенні, що живе поза сторінкою:

  ```tsx
  const selection = useRowSelection([list.queryFilter, companyId])   // hooks/use-row-selection (без шаблону списку — --add)
  const dataProvider = useDataProvider<ErpDataProvider>()
  const approve = async () => {
    // У try — лише запуск: задачу прийнято, далі тільки показ (повторне «Погодити» не дублює її).
    const started = await dataProvider.startBulk("invoices", "approve", toBulkSelection(selection.state, list.queryFilter))
      .catch((error: unknown) => { toast.error(errorMessage(error)); return null })
    if (!started) return
    selection.clear()
    showJobProgress({ jobId: started.jobId, title: t("approving"), failureLabel: (code) => t(`reasons.${code}`, { defaultValue: "" }) || undefined })
  }
  <DataTable … selection={selection} rowLabel={(row) => t("rowLabel", { number: row.number })}
    bulkActions={(count) => <Button onClick={() => setConfirm(count)}>{t("approve")}</Button>} />
  ```

  У шаблоні List Report вибір — `report.selection`, фільтр — `report.list.queryFilter`, а кнопки — `bulk={{ actions: [{ id: "approve", render: (count) => … }], rowLabel }}`; без `bulk` прапорців немає. `selection` передається лише разом із `rowLabel` (це перевіряє тип). У «Прокрутці» прапорець у шапці вибирає всі записи за фільтром (зняті — винятки, запит `{ filter, exclude }`), на сторінках — сторінку, далі панель пропонує «Вибрати всі N»; у картках цей прапорець із підписом стоїть у рядку стану. Підтвердження з кількістю — `ConfirmDialog` на сторінці (не в панелі: панель зникає разом із вибором), `returnFocus={() => tableTabStop(table)}`. Бекенд реалізує `POST /<ресурс>/bulk/<дія>` і `/jobs/:id` за контрактом `lib/jobs`; у моках — `createBulkHandlers({ resource, db, actions })` і `createJobHandlers()` перед обробниками ресурсу, сценарій опитування — ресурс `jobs`.
- Редагування в комірці — `EditableCell` з `erp/editable-cell` у `cell` колонки: значення одразу (`useOptimistic`), відмова сервера — відкат і сповіщення з «Повторити», помилка перевірки — під полем. Зберігай через `useUpdate` у режимі `pessimistic` з `returnPromise: true` і `version` рядка; збереження одного запису з різних комірок став у чергу з версією попереднього (приклад — `invoice-cells.tsx` демо), інакше друга комірка отримає 409 на власну зміну людини. Конфлікт (409) обробляй в `onError` діалогом `ConflictDialog` сторінки, перевіривши `error.current` схемою (без запису — поверни false, і кіт покаже сповіщення). Важкий редактор (поле суми) — лінивим у `ErrorBoundary` + `Suspense`: `ref` з `inputProps` фокусує поле, щойно воно змонтувалось.
- Профіль і права: `useMe()` (`null` — гість), `useCanAccess({ resource: "invoices", action: "edit" })`. Дія без права — неактивна кнопка у фокусі з підказкою-причиною.
- Сторінка лише для користувачів — `useAuthenticated()`: без сесії перенаправить на `/login` і поверне назад після входу (`useLogin`).
- Збереження: `useUpdate` у режимі `pessimistic` надсилає змінені поля + `version`; 409 → `ConflictDialog` з `error.current`.
- Текст помилки — `useApiErrorMessage()(error)`; стани списку — `PageState` за `error.code` (`offline`, 403 → `forbidden`, інше → `error`).
- Вподобання на сервері — `syncPreferences(api)` після входу (повертає функцію зупинки).
- Моки: `createResourceHandlers({ resource, schema, data, searchFields })` дає CRUD із фільтрами, сортуванням, правами й версіями. `<DevPanel resources={["invoices"]} compact onChange={() => queryClient.invalidateQueries()} />` — у `actions` топбара, лише на моках (`import.meta.env.VITE_BACKEND === "mocks"`, «Моки поза продакшном»).
- Повний приклад — `apps/demo` у репозиторії erp-ui: `src/data/providers.ts`, `src/mocks/`, `src/pages/DataPage.tsx`, `src/pages/AuthPage.tsx`.

### e2e проекту (ADR-0029)

Елемент `tools/e2e` ставить `e2e/erp-ui.ts` — помічники Playwright (залежності `@playwright/test` і `@axe-core/playwright` — у `devDependencies`):

```ts
import { expectNoA11yViolations, expectNoHorizontalScroll, openAs } from "./erp-ui"

await openAs(page, "/crm", { user: "u-olena", appearance: { theme: "dark", language: "uk" } })   // user: null — гість
await expectNoA11yViolations(page)    // axe, WCAG 2.2 AA
await expectNoHorizontalScroll(page)  // 360/390/768
```

Playwright проекту збирає застосунок на моках в окрему теку: `webServer.command` — `VITE_BACKEND=mocks vite build --outDir dist-e2e && vite preview --outDir dist-e2e --port <порт>` («Моки поза продакшном»).

`openAs` засіває сховище (вигляд, користувач моків) один раз на виклик: після перезавантаження тест бачить те, що змінив сам. Ще — `cellOf` (комірка таблиці за назвою колонки), `waitForMenuFocus` і `chooseInSubmenu` (меню й підменю). Користувачі, ширини й теми — у своєму `e2e/helpers.ts` проекту.

### Модуль під клієнта: файл розширення (ADR-0020)

Файли модуля в проекті не правляться. Усе, чим клієнт відрізняється, — поля, колонки, ключові поля картки, секції й дії — лежить в окремому файлі проекту `src/extensions/<ID>-<назва>.ts`, який `shadcn add` не створює й не перезаписує. Модуль отримує розширення там, де його підключають (маршрути, моки), і зливає зі своїми елементами за ключем:

```ts
// src/extensions/K2-invoices-fields.ts — поля без компонентів: їх беруть і моки
export const invoiceFields: InvoicesExtension["fields"] = [{ id: "manager", type: "text",
  label: { uk: "Менеджер", en: "Manager" }, mockValues: ["Ірина Бондар", "Олег Мельник", null] }]

// src/extensions/K2-invoices.ts — дані; компоненти слотів — поруч у K2-invoices-slots.tsx
export const invoicesExtension: InvoicesExtension = {
  fields: invoiceFields,
  columns: { add: [{ id: "manager", place: { after: "client" }, priority: 7, overflow: "hide" }] },
  recordFields: { add: [{ id: "manager", place: { after: "client" } }] },
  sections: { add: [{ id: "paymentTerms", title: { uk: "Умови оплати", en: "Payment terms" },
    component: PaymentTerms, place: { after: "lines" } }] },
  actions: { add: [{ id: "remind", component: RemindAction, access: "edit" }] },
}
```

- Зміни списку (`lib/extensions`): `add` — новий елемент на місці `place` (`"start"`, `"end"`, `{ before: "…" }`, `{ after: "…" }`; без нього — у кінець), `hide` — сховати, `move` — переставити. Ключі модуля в `hide`, `move` і `place` типізовані: модуль перейменував ключ — TypeScript покаже місце у файлі розширення. Ключ модуля в `add` — заміна його секції чи дії; номер-посилання й обов'язкові поля модуль закріплює (`locked`): їх не сховати й не замінити.
- Розширення — дані (тип поля, підпис `{ uk, en }`, обов'язковість, значення для моків), крім компонентів у слотах: секція й дія отримують `{ record, resource }` (тип з `templates/object-page`), поле розширення беруть через `extensionValue(record, "manager")`, права — з `useCanAccess`, мову — з `useLanguage`; дія з `access` (`"edit"`, не `"invoices:edit"`) видна лише з правом. Компонент, що впав, не валить картку: секція покаже помилку з повтором, дія зникне. Так ті самі зміни зможе прислати сервер (PF09).
- Нові поля проходять перевірку: модуль розбирає відповіді схемою `extendSchema(контракт, fields)`, моки — теж, а фікстури отримують значення з `withMockValues` (`lib/extension-fields`). Моки імпортують лише файл полів: компоненти слотів у шарі моків роздувають перший екран.
- Зв'язок з іншим записом сервера — поле `type: "record"` (ADR-0030), а не список імен у коді: новий працівник з'являється у виборі без нової версії проекту. У записі — `id`, назву колонка, шапка (`displayEntry`) і чип фільтра беруть із сервера одним запитом на сторінку (`GET /users?id=a&id=b`), форма — вибір із пошуком на сервері, у журналі моків — назва (`extensionAuditOptions(locale, fields, mockRecordTitle)`). `entry()` і `text()` дають `id` — для тексту, а не для показу. Хто не має права читати довідник, бачить «Немає доступу», а не помилку сторінки:

  ```ts
  { id: "manager", type: "record", label: { uk: "Відповідальний менеджер", en: "Account manager" },
    resource: "users", labelField: "name", descriptionField: "email",
    filter: { status: "active" },               // постійні умови довідника, необов'язково
    mockValues: ["u-olena", "u-ivan", null] }   // id записів довідника моків
  ```
- Бракує точки розширення — її додають у кіт (PR в erp-ui), проект оновлює модуль. Аварійний вихід — «від'єднати» модуль: скопіювати під іншою назвою й більше не оновлювати з кіта (рішення — у README проекту).
- Приклад — `src/extensions/K2-invoices.ts` у демо: рахунки «Даних і моків» з колонкою й полем «Менеджер», секцією «Умови оплати» і дією «Нагадати клієнту»; точки розширення модуля-прикладу — `src/pages/invoice-extension.ts`.

### Модуль у проекті (ADR-0025)

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add modules/B1-contacts
```

Мінімальний набір для проекту з модулем на моках (тестовий проект `erp-ui-pilot`): `base`, `data`, `mocks`, `auth`, `lib/mock-views`, `lib/query-client`, `erp/app-gate`, `erp/auth-routes`, `erp/app-shell`, `erp/user-menu`, `ui/sonner`, `tools/e2e` і сам модуль — усі з одного тегу. Команда кіта ставить модуль з тегу одним запитом (§8): напряму з GitHub CLI робить на модуль сотні й тисячі запитів, кожен з тайм-аутом 15 с і без повтору.

Файли модуля стають у `src/modules/B1-contacts/` як є, спільні компоненти кіта, яких бракує, — на свої місця. Кіт модуль імпортує шляхами проекту (`@/components/…`, `@/lib/…`, `@/hooks/…`), тож псевдоніми, які створив `shadcn init`, не змінюйте. Підключення — фабрика один раз:

```ts
// src/modules.ts
import { createContactsModule } from "@/modules/B1-contacts"
import { contactsExtension } from "@/extensions/B1-contacts"

export const contactsModule = createContactsModule({ basePath: "/crm", extension: contactsExtension })

// маршрути — під Suspense і межею помилок застосунку
function Contacts() { return useRoutes(contactsModule.routes) }
// навігація — moduleNavItems(contactsModule.nav, language, me?.permissions) з @/lib/module: підпис мовою інтерфейсу,
// пункт з access — лише з цим правом, поки профіль вантажиться — без таких пунктів;
// активний пункт оболонки — activeId={moduleNavId(contactsModule.nav, pathname)}; сторінка модуля без свого пункту
// (майстер A1 `/setup`) — undefined: поставте свій запасний пункт, як демо — перший пункт модуля
// права й ресурси — contactsModule.resources (contacts, organizations, segments), до каталогу прав бекенда

// src/mocks/handlers.ts — моки беруть лише файл полів, без компонентів
import { createListSettingsHandlers } from "@/lib/mock-lists"
import { createSavedViewHandlers } from "@/lib/mock-views"
import { createContactsMocks } from "@/modules/B1-contacts/mocks"
import { contactsMockExtension } from "@/extensions/B1-contacts-fields"
const contacts = createContactsMocks({ extension: contactsMockExtension })
// Види й розмір сторінки списків модуля — обробники кіта поруч із модулем.
setupWorker(...platformHandlers, ...createSavedViewHandlers(), ...createListSettingsHandlers(), ...contacts.handlers)
```

Крім полів, колонок, ключових полів картки, секцій і дій (вище), розширення модуля має:

```ts
// src/extensions/B1-contacts-fields.ts — дані без компонентів, їх беруть і моки
export const contactsMockExtension = {
  organizations: {
    fields: [{ id: "vatPayer", type: "boolean", label: { uk: "Платник ПДВ", en: "VAT payer" }, mockValues: [true, false] }],
    statuses: { add: [{ id: "suspended", label: { uk: "Призупинена", en: "Suspended" }, tone: "warning", mockEvery: 11 }] },
  },
} satisfies ContactsMockExtension

// src/extensions/B1-contacts.ts
export const contactsExtension: ContactsExtension = {
  organizations: {
    ...contactsMockExtension.organizations,
    filters: { add: [{ id: "vatPayer" }] },               // з поля-списку, так/ні чи дати
    columns: { change: [{ id: "city", header: { uk: "Місто клієнта", en: "Client city" } }] },
    form: {
      add: [{ id: "vatPayer", place: { after: "code" } }],  // поле розширення у формі
      change: [{ id: "city", description: { uk: "Як у виписці з ЄДР", en: "As in the register" } }],
    },
  },
  contacts: {
    tabs: { add: [{ id: "key", label: { uk: "Ключові", en: "Key" }, filter: { segments: "seg-key" } }] },
  },
  strings: { uk: { contacts: { lead: "Люди, з якими працює студія." } } },
}
```

- `statuses` — додати статус (тон `neutral`, `info`, `success`, `warning`, `destructive`; `mockEvery` — кожен N-й запис фікстур), змінити підпис, тон чи іконку статусу модуля без заміни (`change`, з v0.3.0; ключ модуля в `add` замінює статус цілком) чи сховати з вибору (`hide`). Схований лишається дійсним: записи з ним показуються з бейджем (зі змінами `change`). Новий статус стає й вкладкою списку.
- `detailRows: { hide: [...] }` — сховати рядки «Подробиць» картки (у B1 — посада, сегменти тощо), `history: false` — картка без журналу «Історія» (з v0.3.0): для бекенду, який цих полів чи журналу змін не має, щоб картка не показувала порожнього.
- `filters` — фільтр панелі з поля розширення: список і так/ні — варіанти, дата — період; текст і число фільтром не стають (помилка при запуску). `tabs` — вкладка списку з фільтром плоскими параметрами API. Фільтр вкладки перекриває фільтр панелі з тим самим ключем (у демо «Ключові» за сегментом: на цій вкладці фільтр «Сегменти» не діє), тож для вкладки краще поле без фільтра панелі.
- `form` — поле розширення у формі створення й зміни: `add` з місцем серед полів модуля (`OrganizationFormFieldId`, `ContactFormFieldId`), `description` — підказка, `wide` — на всю ширину. Поле вводу — за типом поля (текст, число з `decimals`, дата, список, так/ні); обов'язкове поле (`required`) мусить бути у формі, інакше форма не збереться (помилка розробника). У запит іде лише змінене поле, порожнє — `null`.
- `change` — змінити властивість елемента модуля без заміни (ADR-0026): у колонці — `header`, `minWidth`, `grow`, `priority`, `align`; у полі форми — `label`, `description`. Вміст і поведінка лишаються модуля, тож оновлення модуля до них доходять; закріплений елемент теж можна змінити.
- Довгий підпис (заголовок колонки розширення, перейменований статус) таблиця кіта поки не обрізає: текст ширший за колонку налазить на сусідню. Дайте колонці ширину — новій `minWidth`, колонці модуля `columns.change: [{ id: "status", minWidth: 14 }]` (так у тестовому проекті з «Обслуговування припинено»).
- Що файли кіта в проекті не змінені, перевіряє `node scripts/erp-ui-kit.mjs check` (у `pnpm lint`) за відбитками `kit-files.json`, які записує команда оновлення: правка файлу кіта падає з підказкою «зміни — у файлі розширення», випадкова правка самого `kit-files.json` (контрольна сума не збігається) — з підказкою повернути його з git.
- `strings` — перевизначення рядків модуля за ключами його `i18n/uk.json` і `en.json`; ключа, якого немає, TypeScript не пропустить. Рядки модуля — у своєму просторі імен, застосунку реєструвати їх не треба; простір один на застосунок, тож модуль підключають одним екземпляром.
- Модуль кожної фабрики — одного спільного типу `ErpModule` з `@/lib/module` (ADR-0085): `id`, `paths`, `routes`, `nav`, `resources`, `preload`; типи модулів (`ContactsModule`, `ContactsNavItem`, `ContactsResource`…) — його псевдоніми. Список модулів проекту — `satisfies Record<string, ErpModule>`, один код маршрутів і навігації на всі.
- Документні модулі (B3, K2, K4) зібрано зі спільного шару документа (ADR-0086), тож розширення документа однакове в усіх: тип `DocumentExtension` з `@/components/templates/document-extension` (типи модулів `SalesDocumentExtension`, `InvoiceDocumentExtension` — його псевдоніми з ключами модуля). Свій документ проекту (договір, акт) збирайте з тих самих частин, а не копіюйте модуль: вид документа `DocumentKind` і статуси й граф мовою інтерфейсу (`useDocumentStatuses`, `useDocumentTransitions`) з `@/lib/document-kind`; сторінка форми — шаблон `DocumentFormPage` і `useDocumentFormSource` з `@/components/templates/document-form-page` разом із `useEditSession` з `@/hooks/use-edit-session` («Редагує …»), рамка форми `RecordFormFrame` з `@/components/erp/record-form-page`; рядки — `DocumentSavedLines` і `DocumentFormLines` з `@/components/erp/document-lines-section`; поля «Клієнт» і «Дата» — `documentClientItem`, `dateFormItem` з `@/components/erp/document-form-items`; «Змінити» й «Копіювати» — `AccessLink` з `@/components/erp/access-link`, «Видалити чернетку» — `DocumentDeleteAction` з `@/components/erp/document-delete-action`; тексти масових дій — `useBulkActionTexts` з `@/components/erp/bulk-action`.
- Точки розширення документа (ADR-0086, доповнення) — однакові в B3, K2 і K4: дія в рядку списку й масова дія, групи полів форми, друк (B3, K2) і поля в рядках документа (пропозиції, замовлення, рахунки). Дії й блоки аркуша — компоненти проекту в слотах, решта — дані:

  ```ts
  // src/extensions/K2-invoices.ts — фрагмент; повний приклад — apps/demo/src/extensions/K2-sales-invoices.ts в erp-ui
  invoices: {
    fields: [contractField],
    lineFields: [{ id: "hsCode", type: "text", label: { uk: "Код УКТЗЕД", en: "HS code" } }],
    rowActions: { add: [{ id: "print", component: PrintInvoiceRow }] },
    bulkActions: { add: [{ id: "export", component: ExportInvoices, place: "end" }], hide: ["delete"] },
    form: { add: [{ id: "contract" }] },
    formGroups: { add: [{ id: "contract", title: { uk: "Договір", en: "Contract" }, fields: ["contract"] }] },
    print: { fields: [{ id: "contract" }],
      blocks: { add: [{ id: "paymentTerms", component: PaymentTermsBlock, place: { after: "totals" } }] } },
  }
  ```

  - Дія рядка отримує `{ record, resource }` і стоїть у колонці «Дії» в кінці таблиці (на телефоні — серед дій картки); масова дія — `{ resource, selection, count, filter }` (тип `BulkSlotProps` з `@/components/templates/list-report-slots`), діалог підтвердження — у самому компоненті, кнопка — `size="sm"`, як у масових дій модуля. `access` — дія ресурсу з прав (`"approve"`, не `"sales-invoices:approve"`; `export` кіт зводить до права читання); дію рядка ще ховає позначка сервера на записі, а дії без права немає ще до таблиці (ні колонки «Дії», ні вибору рядків); заміна дії модуля з правом, якого немає, ховає й дію модуля. Масова дія розширення вмикає вибір рядків і там, де модуль своїх масових дій не має.
  - Група полів — заголовок над полями модуля чи полями розширення з `form.add` під полями без групи; поле стає в першу групу, що його називає.
  - Блок аркуша отримує `{ record, resource }`, мову й локаль документа — `usePrintSheet()` з `@/lib/print`; блоки модуля (`company`, `title`, `parties`, `fields`, `lines`, `totals`, у рахунку `qr`, `signatures`) можна сховати чи переставити. Назву аркуша й інші тексти модуля змінює `strings` (`invoice.sheet.title`); не довантажились рядки мови аркуша — сторінка друку показує помилку з повтором.
  - Поле рядка — у рядку редактора під назвою з видимим підписом, на картці й на аркуші; значення — у рядку товару (`lines[].hsCode`), порожнє — `null`. Бекенд приймає й повертає ці ключі в рядках товарів; моки дають значення з `mockValues`. Обов'язкове поле рядка (`required`) — лише коли значення є й у старих документах: рядок без нього робить рядки документа «не за контрактом».
- Опис модуля, контракт і моки — `README.md` модуля; повний приклад — `apps/demo/src/extensions/B1-contacts.ts` у репозиторії erp-ui.

### Модуль A2 «Користувачі й ролі» (ADR-0031)

```ts
// src/modules.ts
import { createUsersModule } from "@/modules/A2-users"
import { usersExtension } from "@/extensions/A2-users"

// homePath — куди перейти після «Увійти як…»
export const usersModule = createUsersModule({ basePath: "/team", extension: usersExtension, homePath: "/" })

// src/mocks/handlers.ts — колеги з фікстур модуля стають користувачами мок-сервера входу,
// ресурс users — моки модуля (свого ресурсу users у моках проекту не треба)
import { createUsersFixtures } from "@/modules/A2-users/fixtures"
import { createUsersMocks } from "@/modules/A2-users/mocks"
import { usersMockExtension } from "@/extensions/A2-users-fields"
const team = createUsersFixtures({ company: COMPANIES[0], roles: ["sales", "accountant"], emailDomain: "example.com" })
const platformHandlers = createPlatformHandlers({ users: [...USERS, ...team.users], accountSeeds: { ...SEEDS, ...team.accountSeeds }, … })
setupWorker(...platformHandlers, ...createUsersMocks({ extension: usersMockExtension }).handlers)
```

- Список і картка людини, сторінка «Ролі й права» (`<basePath>/roles`, вибрана роль — `?role=<id>`; ADR-0033), сторінка «Запрошення» (`<basePath>/invitations`; ADR-0035). Дії над людиною — лише в компанії запиту, «стеля» ролей і «Увійти як…» не в сильнішого (ADR-0032), ролі компанії запиту й лічильник людей лише цієї компанії, ролі людини свої в кожній її компанії, права й «стеля» — у компанії запиту, `*` не керує ролями чужої компанії (ADR-0033) бекенд перевіряє сам.
- Навігація — `usersModule.nav`: «Користувачі», «Ролі й права» і «Запрошення»; пункт з `access` лише з цим правом показує `moduleNavItems` (`@/lib/module`, вище).
- Права: список і картка — `users:read`, вкладки «Доступ» і «Сесії» — `users:update`, зміна ролей — `users:update` і `roles:read`, «Увійти як…» — `users:impersonate`, сторінка ролей — `roles:read`, нова роль, копія, зміна й видалення — `roles:update`, сторінка запрошень — `users:create`. Без права — «Немає доступу» на місці сторінки.
- Довідник для полів-записів: поле `type: "record", resource: "users"` в іншому модулі показує імена всім у компанії — бекенд віддає без `users:read` лише `{ id, version, name, email }` (контракт — `README.md` модуля).
- Розширення — `users`: `fields`, `columns`, `filters`, `tabs`, `recordFields`, `sections`, `actions`, `history: false`; форми запису немає (людину створює запрошення). `roles: { page: false }` — без сторінки ролей і пункту навігації, `invitations: { page: false }` — без сторінки запрошень і її пункту.

### Модуль A1 «Компанія й валюти» (ADR-0043)

```ts
// src/modules.ts
import { createCompanyModule } from "@/modules/A1-company"
import { companyExtension } from "@/extensions/A1-company"

export const companyModule = createCompanyModule({ basePath: "/settings", afterSetup: "/", extension: companyExtension })

// src/mocks/handlers.ts — компанію дають моки платформи, модуль додає валюти й курси
import { createCompanyMocks } from "@/modules/A1-company/mocks"
import { companyMockExtension } from "@/extensions/A1-company-fields"
setupWorker(...platformHandlers, ...createCompanyMocks({ extension: companyMockExtension, companies: ["my-company"] }).handlers)
```

- Сторінки: картка компанії (`<basePath>/company`), «Валюти» (`<basePath>/currencies`), «Курси валют» (`<basePath>/exchange-rates`, валюта в адресі: `?currency=USD`).
- Права: картку читає кожен у компанії, зміни — `company:update`; `currencies:read|create|update`; `exchange-rates:read|create|update|delete`. Додайте їх у свої ролі.
- Логотип і печатка чи підпис (`PUT /company/logo|stamp`, PNG, JPG, WebP чи SVG до 1 МБ): сервер віддає їх як файли користувачів (ADR-0081, розділ «Стрічка запису»), SVG очищає від скриптів, обробників подій і зовнішніх посилань або не приймає.
- Розширення — `company`: `sections`, `actions`, `history: false`; `currencies`: `page: false` (одна валюта), `columns`; `rates`: `fields`, `columns`, `filters`, `form`.
- Курс із бекенду проекту (НБУ чи інше джерело): поставте `source` не `manual` і `deniedActions: { update: "source", delete: "source" }`, екран покаже його лише для перегляду. Опис контракту — README модуля.

- Перший запуск (ADR-0044): майстер — `companyModule.paths.setup`. Щоб відкривати його після реєстрації: `createAuthRoutes({ afterSignUp: companyModule.paths.setup })`. Чек-лист «Почніть роботу» — `{companyModule.setupChecklist}` на головній сторінці проекту. Обидва бачить лише той, хто має `company:update`. Пункт і крок «Колеги» потребують `users:create`; проект без запрошень ховає їх: `setup: { hide: ["team"] }`, без логотипа — `hide: ["logo"]`, свій онбординг замість майстра — `setup: { page: false }`. Свій чек-лист — `SetupChecklist` з `erp/setup-checklist`.

### Модуль A5 «Аудит та історія» (ADR-0045)

```ts
// src/modules.ts
import { createAuditModule } from "@/modules/A5-audit"
import { auditExtension } from "@/extensions/A5-audit"

export const auditModule = createAuditModule({ basePath: "/settings", extension: auditExtension })

// src/mocks/handlers.ts — журнал дають моки платформи, модуль додає початкові події
import { createAuditMocks } from "@/modules/A5-audit/mocks"
const audit = createAuditMocks({ companies: ["my-company"] })
setupWorker(...createPlatformHandlers({ auditSeeds: audit.seeds }))
```

- Сторінка: журнал (`<basePath>/audit`), `basePath` веде на нього. Пункт навігації — з `access`, сторінка без права каже «Немає доступу» без запиту.
- Право — `audit:read`. Додайте його у свої ролі. Журнал пише сервер, клієнт лише читає.
- Розширення — `journal`: `actionLabels` (назви дій проекту мовами, важливіші за `actionLabel` від сервера), `export: false` (бекенд без `GET /audit-events/export`); `strings`.
- Шухляда на картках — спільна частина кіта, модуль для неї не потрібен: блок «Історія» на картках A1, A2 і B1 уже з кнопкою «Уся історія». Сценарії моків — ресурс `audit`.

### Модуль N5 «Сповіщення» (ADR-0046)

```ts
// src/modules.ts
import { createNotificationsModule } from "@/modules/N5-notifications"
import { notificationsExtension } from "@/extensions/N5-notifications"

export const notificationsModule = createNotificationsModule({ extension: notificationsExtension })

// src/mocks/handlers.ts — адреси дають моки платформи, модуль додає початкові сповіщення
import { createNotificationsMocks } from "@/modules/N5-notifications/mocks"
const notifications = createNotificationsMocks({ users: ["u-1"] })
setupWorker(...createPlatformHandlers({ inboxSeeds: notifications.seeds }))
```

- Сторінки: «Сповіщення» (`<basePath>/inbox`) і «Налаштування сповіщень» (`<basePath>/notification-settings`), `basePath` веде на першу. Прав немає: людина бачить лише своє.
- `InboxBell` в оболонці дає лічильник у назві вкладки («(3) Рахунки», `tabCounter={false}` вимикає) і реакцію на push. Вони працюють і без модуля. Тест проекту, що порівнює назву вкладки повністю, має врахувати лічильник.
- Push: сервер проекту тримає пару ключів VAPID і реалізує контракт `lib/web-push`, докладно в README модуля. Блок «Push на цьому пристрої» видно, якщо сервер має канал `push`. Працює на комп'ютері й Android; на iPhone і iPad потрібен застосунок на головному екрані, тобто PWA.
- Фоновий файл `public/erp-ui-push-sw.js` приходить разом із блоком push (пакунок `auth`, модуль чи `erp/push-device-section` окремо), не правте його. Застосунок має стояти в корені домену.
- Підписку скасовує «Вийти», а не автовихід: push потрібен і після простою. Тому сервер прибирає запис під час «вийти всюди», зміни пароля, блокування й вилучення з компанії. Перелік перевірок сервера, зокрема проти SSRF: README модуля, «Що перевіряє сервер». Без них підключати push не можна.
- Адаптер, що будує `inbox` вручну, додає `push`: `createPushApi(client)` з `lib/web-push` або свої чотири методи.
- Розширення — `inbox.perPage`, `strings`. Сценарії — ресурс `notifications`.

### Модуль A6 «Довідники» (ADR-0047)

```ts
// src/modules.ts
import { createDictionariesModule } from "@/modules/A6-dictionaries"
import { dictionariesExtension } from "@/extensions/A6-dictionaries"

export const dictionariesModule = createDictionariesModule({ basePath: "/settings", extension: dictionariesExtension })

// src/mocks/handlers.ts — усі адреси дає модуль
import { createDictionariesMocks } from "@/modules/A6-dictionaries/mocks"
import { dictionariesMockExtension } from "@/extensions/A6-dictionaries-fields"
const dictionaries = createDictionariesMocks({ extension: dictionariesMockExtension, companies: ["my-company"] })
setupWorker(...createPlatformHandlers({}), ...dictionaries.handlers)
```

- Сторінки: «Податки», «Одиниці виміру», «Умови оплати», «Теги», «Причини», «Типові значення», адреси в `dictionariesModule.paths`, `basePath` веде на першу сторінку.
- Права: `taxes`, `units`, `payment-terms`, `tags`, `reasons` мають `read`, `create`, `update`; `dictionary-defaults` має `read`, `update`. Додайте їх у свої ролі. Форма типових значень бере перелік значень, тож тому, хто її змінює, потрібне ще `read` на довідники.
- Значення не видаляються: «Вимкнути» прибирає його з нових виборів. Це і є архів довідника, кошика довідники не мають (ADR-0095). Вибір у документі — `RecordPicker` із `filter={{ active: true }}`.
- Вимкнення прибирає значення з типових: це робить сервер у тій самій транзакції. «Скасувати» типового не повертає, тому значення з позначкою «Типове» перед вимкненням питає (потрібне право `dictionary-defaults:read`).
- Розширення — кожен довідник: `page: false`, `fields`, `columns`, `filters`, `form`; `reasons.kinds` (види причин проекту); `defaults: { page: false }`; `strings`.

### Модуль A4 «Імпорт і експорт» (ADR-0050)

```ts
// src/modules.ts
import { createImportExportModule } from "@/modules/A4-import-export"
import { importExportExtension } from "@/extensions/A4-import-export"

export const importExportModule = createImportExportModule({ basePath: "/settings", extension: importExportExtension })

// src/extensions/A4-import-export.ts — цілі під проект
export const importExportExtension: ImportExportExtension = {
  targets: {
    hide: ["taxes", "units", "tags", "reasons"], // A6 у проекті немає
    add: [
      {
        id: "products", // ресурс API
        label: { uk: "Товари", en: "Products" },
        matchField: "sku",
        fields: [
          { key: "sku", label: { uk: "Артикул", en: "SKU" }, required: true },
          { key: "price", label: { uk: "Ціна", en: "Price" }, type: "number" },
        ],
      },
    ],
  },
}

// src/mocks/handlers.ts — цілі на записах своїх моків
import { createImportExportMocks, importTargetMock } from "@/modules/A4-import-export/mocks"
const importExport = createImportExportMocks({
  companies: ["my-company"],
  targets: [
    importTargetMock({ resource: "contacts", db: contacts.db.contacts }),
    importTargetMock({ resource: "products", db: products.db }),
  ],
})
setupWorker(...createPlatformHandlers({}), ...importExport.handlers)
```

- Сторінки: «Імпорт і експорт», майстер на адресі цілі, «Історія імпорту». Адреси в `importExportModule.paths`, `basePath` веде на цілі.
- Кнопка на своєму списку: `importRunPath(importExportModule.paths, "contacts")` веде на майстер цілі.
- Права: `import-runs` має `read` і `read:own` (лише свої запуски). Імпорт просить `<ресурс>:create`, оновлення ще й `<ресурс>:update`, експорт `<ресурс>:read`. Окремого права немає.
- Бекенд реалізує контракт `lib/imports` для кожної цілі й історію `GET /import-runs`, `GET /import-runs/:id`: запуск створює сам сервер у `POST /<ресурс>/import`. Без історії — `history: { page: false }`.
- Цілі з коробки: контакти й організації B1, податки, одиниці, теги й причини A6. Без цих модулів сховайте їх: ціль без модуля бачив би той, хто має `*`. Умов оплати немає: частини оплати не лягають на рядок таблиці. Контакт приходить без організації.
- Нове поле в цілі модуля: `targets: { change: [{ id: "contacts", fields: [...CONTACTS_TARGET.fields, { key: "source", label: "Джерело" }] }] }`, дані цілей — у `targets.ts` модуля.
- Розширення — `targets`, `history` (`page: false`, `columns`, `filters`), `strings`. Сценарії — `import-runs` і кожна ціль окремо.

### Майстер (ADR-0043)

```tsx
const wizard = useWizard({
  steps: [
    { id: "main", label: t("steps.main"), description: t("steps.mainHint"), onNext: () => form.trigger(["name"], { shouldFocus: true }) },
    { id: "extra", label: t("steps.extra"), optional: true },
    { id: "review", label: t("steps.review") },
  ],
  onFinish: async () => { await save(form.getValues()) },
})

<Wizard wizard={wizard} finishLabel={t("create")}>
  {wizard.step.id === "main" ? <MainFields /> : wizard.step.id === "extra" ? <ExtraFields /> : <WizardReview onEdit={wizard.goTo} sections={…} />}
</Wizard>
```

- `onNext` повертає `false` — людина лишається на кроці, крок позначено в степері. Виняток показує шаблон, введене лишається.
- Необов'язковий крок з полями: `onSkip` прибирає введене, інакше значення, яких ніхто не перевірив, дійдуть до `onFinish`.
- `initial` читається раз, під час монтування: прогрес із сервера дочекайтесь до рендеру майстра.
- Прогрес у браузері — `loadWizardProgress(key)`, `saveWizardProgress(key, { ...progress, draft })` в `onProgress` і `clearWizardProgress(key)` після успіху. Сервер, що зберігає кроки, цього не потребує: передайте `initial`.

### Імпорт і експорт (ADR-0049)

Майстер імпорту знає про ресурс лише те, що йому описали:

```tsx
const target: ImportTarget = {
  resource: "contacts",
  label: t("contacts"),
  matchField: "email", // без нього кожен рядок стає новим записом
  fields: [
    { key: "name", label: t("name"), required: true },
    { key: "email", label: t("email"), aliases: ["e-mail", "пошта"] },
    { key: "birthday", label: t("birthday"), type: "date" },
    { key: "phone", label: t("phone"), parse: parsePhoneCell },
  ],
}

<ImportWizard target={target} title={t("import")} onDone={() => navigate(list)} />
```

- Типи полів: `text`, `number`, `integer`, `boolean`, `date`, `enum` з `options`. Свій розбір клітинки
  (телефон, ЄДРПОУ) — `parse`: він повертає `{ value }` або `{ code }`.
- Текст коду модуля — `errorLabel` цілі; `required`, `invalid`, `duplicate`, `forbidden` кіт знає сам.
- Файл із шапкою над таблицею: людина вибирає рядок із назвами колонок на першому кроці, серед заповнених
  рядків у перших 20. Код сторінки для цього нічого не робить (ADR-0050).
- Без права `<ресурс>:update` передайте `canUpdate={false}`: дублі лише пропускаються, вибір вимкнений і
  пояснює причину.
- Сервер проекту реалізує `POST /<ресурс>/import/check` і `POST /<ресурс>/import` (`lib/imports`).
  Адаптер, де їх немає, перевизначає `checkImport` і `startImport`. Межа JSON має вміщати
  `IMPORT_MAX_ROWS` рядків. Моки: `createImportHandlers({ resource, db })` з `lib/mock-imports`.

Експорт збирає браузер зі сторінок списку, тож серверу нічого не треба:

```tsx
const columns: ExportColumn<Contact>[] = [
  { id: "name", label: t("name"), value: (row) => row.name },
  { id: "balance", label: t("balance"), value: (row) => row.balance },
  { id: "note", label: t("note"), value: (row) => row.note ?? null, optional: true },
]

<ExportDialog
  open={open}
  onOpenChange={setOpen}
  resource="contacts"
  title={t("contacts")}
  fileName="contacts"
  columns={columns}
  filter={filter}
  selectedIds={selectedIds}
/>
```

- Числа й дати віддавайте типами: Excel рахуватиме їх, а не бачитиме текст.
- `optional: true` — колонка спочатку не вибрана. Межа — `EXPORT_MAX_ROWS`, її міняє `maxRows`.
- `finalFocus` — кнопка, що відкрила діалог: Safari кнопку кліком не фокусує.

`hucre` напряму не імпортуйте: лише через `lib/spreadsheet`, вона має лишатись окремим чанком. Вибір файла
для власних сценаріїв — `FileDrop` з `erp/file-drop`.

### Реальний час і «Редагує …» (ADR-0051)

Канал подій сервера не обов'язковий: без нього все працює опитуванням, як раніше. Увімкнути:

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add erp/realtime-sync,erp/edit-lock-notice,hooks/use-edit-lock
```

```tsx
// поруч із SessionGuard, лише для людини, що увійшла
{me ? <RealtimeSync /> : null}
```

- Бекенд: `GET /events` з `Accept: text/event-stream`, потік SSE компанії з `X-Company-Id`. Кожне повідомлення — JSON у
  `data`: `{ type, resource, id?, at }`, `type` — `<ресурс>.<дія>`, ті самі назви, що у вебхуків. Даних запису в події
  немає. Серцебиття (рядок-коментар) не рідше ніж раз на 30 с.
- 401, 403, 404, 405, 501 — каналу немає, кіт більше не пробує. Решта збоїв — нові спроби з паузою до 30 с.
- Канал тримає одна вкладка на людину й компанію, решта отримує події від неї.
- Подія `<ресурс>.created`, `.updated`, `.deleted` перечитує відкриті списки й картки ресурсу, не частіше ніж раз на
  секунду. `notifications.created` оновлює дзвінок. Свої події: `useRealtimeEvent((event) => …)`, стан каналу:
  `useRealtimeStatus()`. Подія `REALTIME_RESYNC` означає, що після обриву частина подій могла не дійти.

«Редагує …» на картці:

```tsx
const lock = useEditLock({ resource: "contacts", id })
<ObjectPage notice={<EditLockNotice holder={lock.holder} />} … />
<AccessAction lockReason={lock.reason} busy={lock.isAcquiring} onClick={() => void start()} … />  // чи DeniedAction з lock.reason
const start = async () => { if (await lock.acquire()) setEditing(true) }
// форма закрилась: lock.release()
```

- Бекенд: `GET`, `PUT`, `DELETE /<ресурс>/<id>/lock`, відповідь `{ holder: { id, name } | null, expiresAt }`. `PUT` дає 200 і
  тоді, коли запис уже тримає інша людина: вона буде в `holder`. `DELETE` чужого блокування не знімає. Термін дії — від
  двох хвилин, подовження щохвилини фоновим запитом (`X-Background-Request`), тож воно не продовжує сесію.
  Подія `<ресурс>.locked` з `id` запису, коли `holder` змінився.
- Це домовленість між людьми, дані береже версія запису. Збій блокування не заважає редагувати, а бекенд без цих
  адрес (404, 405, 501) працює, як раніше: кіт питає один раз на картку. Модуль B1 вимикається `editLock: false` у
  розширенні.
- `useEditLock` прив'язаний до запису на весь час життя: картка з іншим `id` має бути новим екземпляром (`key={id}`).
- Моки вже мають канал і блокування (`createPlatformHandlers`). Колегу імітують `setMockEditLock` із `lib/mock-realtime`
  і звичайна зміна в `db` ресурсу; сценарії — ресурс `realtime`.

### Оформлений текст і згадки (ADR-0052)

Текст нотаток і повідомлень зберігається JSON-документом, а не HTML. Поле вантажить редактор окремим чанком, показ
редактора не потребує.

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add erp/rich-text-field,erp/rich-text-view,lib/rich-text
```

```tsx
const schema = z.object({
  body: richTextSchema.refine((doc) => !isRichTextEmpty(doc), { message: t("notes.required") }),
})

<FormField
  control={form.control}
  name="body"
  label={t("notes.body")}
  render={({ field, control, labelId }) => (
    <RichTextField
      {...control}
      aria-labelledby={labelId}
      value={field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
    />
  )}
/>

<RichTextView value={note.body} />
```

- Бекенд: поле — JSON. Сервер обмежує глибину (32 рівні) і довжину документа та ніколи не вставляє його в HTML без своєї
  перебудови: лист клієнту збирає сам із тих самих вузлів, текст і підписи екранує, а посилання перевіряє за правилами
  `safeLinkHref` (`http`, `https`, `mailto` без параметрів, `tel`, без логіна в адресі). Лист іде від адреси компанії, тож
  підроблене посилання дійшло б клієнту з довірою до відправника.
- Провайдер кіта відповіді схемою не перевіряє, тому межа на сервері обов'язкова. У форму редагування кладіть
  `toRichText(record.body)`: `react-hook-form` копіює значення рекурсивно й без меж, а сирий документ на тисячі рівнів
  вичерпав би стек. `richTextSchema` чистить значення на виході форми й у контракті моків.
- Бекенд із простим текстом працює без змін: `toRichText` і `richTextSchema` перетворюють рядок на абзаци.
- Згадки шукають у `GET /users` (`q`, `sort=name`, `perPage=24`). Свій пошук: `mentions={(query, signal) => …}`, без згадок:
  `mentions={false}`. Хто згаданий: `richTextMentions(doc)`. І `id`, і підпис надсилає браузер автора: сервер перевіряє
  кожен `id` (людина є, активна, бачить запис) і на запису ставить ім'я з довідника, інакше підпис можна підробити.
- Прев'ю в списку, сповіщення, пошук: `richTextToPlain(doc)`. Порожньо чи ні: `isRichTextEmpty(doc)`.
- Лише читання й `disabled` показують текст без редактора, чанк не вантажиться. Перемикання скидає курсор та історію,
  тож `disabled={isSubmitting}` на цьому полі не ставте. Заздалегідь завантажити перед відкриттям форми:
  `preloadRichTextEditor()`.
- Чого немає: заголовків, таблиць, зображень, вкладення пунктів списку в полі (Tab виводить із поля). Невідомий вузол із
  новішої версії кіта показує свій текст.

Tiptap напряму не імпортуйте: лише через `erp/rich-text-field` і `erp/rich-text-view`, редактор має лишатись окремим чанком.

### Стрічка запису (ADR-0053)

Блок на картці: нотатки команди, повідомлення назовні, зміни полів, файли, підписники й заплановані дії. Писати може
кожен, хто бачить запис.

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add erp/record-timeline
```

```tsx
<RecordTimeline resource="invoices" id={record.id} />

// Проект без пошти: лишаються нотатки, зникає й фільтр повідомлень.
<RecordTimeline resource="contacts" id={id} messages={false} />

// Закритий запис: читати можна, додавати нічого.
<RecordTimeline resource="invoices" id={id} readOnly />
```

- Пропи: `messages`, `files`, `followers`, `activities` вимикають блоки, `maxFileBytes` міняє межу файла (25 МБ), `mentions` і
  `renderMention` працюють, як у полі тексту. Кілька стрічок на одній сторінці розрізняйте `label`.
- Нотатку бачить лише команда, повідомлення йде назовні. Отримувача вибирає й лист надсилає сервер проекту: запис приходить зі
  станом `queued`, далі сервер шле подію. Текст листа сервер будує сам із вузлів документа (ADR-0052).
- Контракт — шапка `lib/timeline`: `GET`, `POST /<ресурс>/<id>/timeline`, `PATCH`, `DELETE …/timeline/<entryId>`, `POST …/files`,
  `…/followers`, `…/activities`. Кожен запит потребує лише `<ресурс>:read`. Нотатку й файл змінює автор: сервер позначає чужі
  `deniedActions` (ADR-0037), меню показує причину.
- `requestId` робить `POST` ідемпотентним: той самий ключ повертає той самий запис, інакше загублена відповідь надішле лист двічі.
  Клієнт міняє ключ, лише коли змінився текст.
- Нотатки й файли мають спільний простір `id`: `DELETE` адресує запис лише за ним. Зміни полів і події можуть мати ті самі `id`.
  `url` файла — абсолютна адреса `http(s)`, що відкривається без заголовків і живе довше за
  відкриту картку. Відносну адресу кіт посиланням не показує.
- Файли користувачів сервер віддає так, щоб вони не виконувались у застосунку (ADR-0081): з окремого походження без cookie
  застосунку (напр. підписана адреса сховища) або з `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` і
  `Content-Security-Policy: sandbox`; тип — за вмістом, а не за розширенням. Інакше завантажений `.html` чи `.svg` зі скриптом
  діє із сесією того, хто його відкрив. Те саме — логотип і печатка компанії; SVG сервер очищає від скриптів,
  обробників подій і зовнішніх посилань або не приймає.
- Оновлення: подія `<ресурс>.timeline` з `id` запису перечитує цю стрічку, без `id` усі стрічки ресурсу. Подія обов'язкова, щойно є
  канал: опитування тоді вимкнено. Без каналу стрічка опитується раз на хвилину.
- Адаптер перевизначає `authProvider.timeline` цілком (тип `TimelineApi`). Зміни полів, завершені дії й події проекту пише сервер: подія
  проекту приходить будь-яким видом, який кіт не знає, і показує свій `text`.
- Сторінка з формою поруч зі стрічкою: `UnsavedChangesGuard` форми тримайте змонтованим постійно. Захист поля стрічки монтується
  лише для зміненого поля, тож чисте поле захист форми не вимикає.
- Моки: `createTimelineHandlers({ targets: [timelineTargetMock({ resource, db })], seeds })`. Сценарії — ресурс `timeline` у панелі
  розробника.

### Модуль стрічки й «Мої справи» (ADR-0054)

Модуль N1 збирає стрічку в картки через слот і додає сторінку з діями людини через усі записи. Проект вмикає це сам: без слота картка
лишається з «Історією» й не звертається до адрес стрічки.

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/N1-timeline
```

```ts
// src/extensions/N1-timeline.ts
export const timelineExtension: TimelineExtension = {
  myActivities: {
    perPage: 20,
    recordHref: ({ resource, id }) => `/${resource}/${encodeURIComponent(id)}`,
  },
  // Проект без пошти: лишаються нотатки.
  card: { messages: false },
}

// src/extensions/B1-contacts.ts
export const contactsExtension: ContactsExtension = {
  organizations: { aside: timelineModule.aside },
  contacts: { aside: timelineModule.aside },
}
```

- Своя картка на Object Page бере той самий слот: `useRecordSlots({ aside: extension.aside })`, далі `aside={slots.aside ?? …}`.
- Сторінці модуля потрібна адреса `GET /me/activities` (шапка `lib/timeline`): лише дії цієї людини на записах, які вона бачить, найближчий
  термін першим. `dueFrom` і `dueTo` — календарні дати включно, їх рахує клієнт. Бекенду без цієї адреси ставте `myActivities: false`:
  зникнуть сторінка й пункт навігації, стрічка на картках лишиться.
- `recordHref` дає адресу картки: модуль не знає сусідніх модулів. Без нього назва запису показується текстом. Без `title` у рядку видно `id`.
  `resource` приходить із відповіді сервера: шукаючи адресу в об'єкті, перевіряйте `Object.hasOwn`. `perPage` — до 100.
- `component` слота — стала функція з модуля. Нова функція на кожен рендер перемонтує стрічку разом із чернеткою.
- Вузька картка показує стрічку вкладкою. Чернетка живе, поки людина перемикає вкладки чи повертає телефон, і захист незбережених змін
  спрацьовує з прихованої вкладки.
- Лінива сторінка не імпортує `timelineModule` напряму, якщо модуль є у вхідному графі: збирач перебудує спільні шматки, і вхідний чанк виросте.
  Беріть слот із файлу розширення, який вантажить вхід (ADR-0054, п. 7).
- Моки: `createTimelineMocks({ targets: [timelineTargetMock({ resource, db, title })], seeds })`, фікстури `createTimelineFixtures({ records, people })`.

### Життєвий цикл документа й панель дій (ADR-0057)

Документ має стан кіта `docStatus` (`draft`, `submitted`, `cancelled`) і статус модуля. Модуль описує граф переходів, проект змінює його
файлом розширення, панель показує дії зі статусу.

```tsx
// Граф модуля: основна дія статусу першою; без `to` дія створює новий документ.
const INVOICE_TRANSITIONS = [
  { id: "submit", from: ["draft"], to: "submitted" },
  { id: "cancel", from: ["submitted"], to: "cancelled", reason: "required" },
  { id: "reverse", from: ["submitted"], to: "reversed", reason: "required" },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition<InvoiceStatus>[]

const transitions = useResolvedTransitions(
  INVOICE_TRANSITIONS.map((item) => ({ ...item, label: t(`invoices.actions.${item.id}`) })),
  extension.transitions, // add, hide, move, change: label, from, reason
)

<DocumentActionBar
  resource="invoices"
  record={invoice}
  transitions={transitions}
  compare={(seen, current) => changedFields(seen, current)}
  onCreated={(created) => navigate(`/invoices/${created.id}`)}
/>
```

- Бекенду потрібна адреса `POST /<ресурс>/:id/<дія>` з `{ version, reason? }` (SPEC §17): змінений запис (200) або новий документ (201)
  для `amend` і `reverse`. Дія — `id` переходу й дія права (`invoices:submit`). Порядок перевірок і коди причин — ADR-0057.
- Проведений і скасований документ бекенд мітить `deniedActions` (`submitted`, `cancelled`), пов'язані проведені документи — `linked`,
  виправлений — `amended`, сторнований — `reversed`. Тексти цих кодів кіт показує сам. Свій код проекту — загальним текстом.
- Підтвердження «Провести документ?», «Скасувати документ?» — тексти кіта за ключем дії. Модуль зі своїми словами дає переходу
  `confirm: { title, description, action }` (ADR-0065): «Надіслати пропозицію?» з кнопкою «Надіслати пропозицію».
- Після сторно перший документ лишається проведеним, поруч з'являється документ-сторно з `reversalOf`.
- Куди веде дія модуля (`to`), розширення не змінює: інша поведінка — нова дія в `add` зі своїм ключем (`add` з ключем дії модуля не
  діє). Дії кіта — лише зі свого стану `docStatus`, хоч би що дозволяв граф. Сервер і моки беруть той самий граф через
  `mergeTransitions(MODULE_TRANSITIONS, extension.transitions)`.
- Провайдер, написаний вручну, додає `runTransition(resource, id, action, body)`; адаптер на `createDataProvider` отримує його сам.
- Моки: `createTransitionHandlers({ resource, db, transitions, amend, reverse, conflictChange, numbering })` перед `handlers` ресурсу і
  `deniedActions: (_, record) => documentDeniedActions(record)` у `createResourceHandlers`. Дії, якої немає в графі, мок не бере, тож
  масові дії, імпорт і стрічка ресурсу працюють; дії графа не називайте `bulk` чи `import`.

### Нумерація документів (ADR-0058)

Номер дає сервер, коли документ стає проведеним: на `submit` і документу-сторно. Чернетка й виправлена копія мають `number: null`,
інтерфейс пише «Без номера» (`numbering.noNumber`). Номер ніколи не повторюється: скасований документ лишає свій.

```tsx
// Сторінка налаштувань: серії компанії, форма шаблону, перегляд наступного номера.
<NumberingSettings labels={{ invoices: t("invoices.title") }} headingLevel={3} />

// Моки: серія на тип документа, засів лічильника для документів із номерами, номер на проведенні.
const numbering = createNumberingMocks({
  series: [{ companyId: null, resource: "invoices", template: "РФ-{YYYY}-{####}" }],
  counters: [{ companyId: null, resource: "invoices", year: 2026, value: 12 }],
})
createTransitionHandlers({ /* … */ numbering: numbering.forResource({ resource: "invoices", db: invoices.db }) })
```

- Бекенду потрібен ресурс `numbering-series` (`GET` список і запис, `PATCH` з `version` полів `template`, `resetYearly`, `perBranch`) і
  `GET /numbering-counters?series=<id>` → `{ data, total }`. Серію на кожен тип документа створює сервер. Права
  `numbering-series:read` і `numbering-series:update`.
- Мітки шаблону: `{YYYY}`, `{YY}`, `{MM}`, `{BRANCH}`, `{#…#}` (1–9 цифр), до 40 символів. Хибний шаблон — 422
  `fieldErrors.template` з кодом `numberingTemplateIssue`; форма показує той самий текст, що й до відправки.
- Лічильник — на серію чи філію (`perBranch`) і на рік дати документа (`resetYearly`). Видача атомарна, зайнятий номер сервер
  пропускає. Номера в браузері не складайте: перегляд (`nextDocumentNumber`) лише показує, яким він, імовірно, буде.

### Потік документів (ADR-0061)

Ланцюг пов'язаних документів на картці: пропозиція, замовлення, відвантаження, рахунок, а в межах типу виправлена копія й
сторно. Ланцюг будує сервер, картка лише показує його.

```tsx
// Картка замовлення: типи — назва, адреса картки й статуси модуля; модулі один одного не імпортують.
<DocumentFlow
  resource="orders"
  id={String(record.id)}
  types={{
    quotes: { label: t("quotes.one"), href: paths.quote, statuses: quoteStatuses },
    orders: { label: t("orders.one"), href: paths.order, statuses },
    invoices: { label: t("invoices.one") }, // сторінки рахунків у проекті немає: номер без посилання
  }}
/>

// Моки: джерела в порядку процесу, звідки документ — `links`; за замовчуванням зв'язки життєвого циклу.
createDocumentFlowHandlers({
  sources: [
    documentFlowSource({ resource: "quotes", db: quotes.db, node: (quote) => ({ number: quote.number, date: quote.date }) }),
    documentFlowSource({
      resource: "orders",
      db: orders.db,
      node: (order) => ({ number: order.number, date: order.date, status: order.status, docStatus: order.docStatus }),
      links: (order) => (order.quoteId ? [{ kind: "basedOn", resource: "quotes", id: order.quoteId }] : []),
    }),
  ],
})
```

- Бекенду потрібна адреса `GET /<ресурс>/:id/flow` → `{ documents, truncated? }`: цей документ і пов'язані, тип за типом у порядку
  процесу, документ запиту завжди. Документ без права читати — `access: "forbidden"` лише з типом, номером і зв'язками, видалений —
  `"deleted"`; сервер не пропускає їх, інакше ланцюг рветься. Документа іншої компанії в потоці немає. Не більше 100 документів,
  решта — `truncated: true`.
- Зв'язки `links` (`basedOn`, `amendedFrom`, `reversalOf`) ведуть на документ тієї самої відповіді. Порядок кроків — порядок
  першої появи типу у відповіді.
- Провайдер, написаний вручну, додає `getDocumentFlow(resource, id, { signal })` і розбирає відповідь `documentFlowSchema.parse(body)`:
  схема дає `truncated`, межу й відкидає зайві поля документа без права. Адаптер на `createDataProvider` отримує метод сам, з
  тайм-аутом 15 с. `resource` у відповіді — назва ресурсу інтерфейсу, як у `types`: інші назви бекенду перекладає адаптер.
- Потік оновлюється разом із ресурсом картки: подія каналу про документ і дія панелі (панель на нього не чекає). Свій запит —
  `useDocumentFlow` з `hooks/use-document-flow`, показ без запиту — `DocumentFlowView`.

### Рядки документа (ADR-0056, ADR-0059, ADR-0060)

Редактор рядків пропозиції, замовлення чи рахунку — поле форми документа. Довідники одиниць і податків модуль читає сам
(ресурси A6 `units`, `taxes`, `dictionary-defaults`) і дає варіантами; рядок зберігає знімок значення.

```tsx
const schema = useDocumentLinesSchema("UAH").safeExtend({ client: z.string().min(1, required) })
const form = useForm({ mode: "onTouched", resolver: zodResolver(schema), defaultValues })

<DocumentLinesEditor
  form={form}
  currency="UAH"
  units={units.map((unit) => ({ id: unit.id, name: unit.shortName }))}
  taxes={taxes.map(({ id, name, rate, included }) => ({ id, name, rate, included }))}
  item={{ resource: "products", optionLabel: (p) => p.name, toLine: (p) => ({ name: p.name, price: String(p.price) }) }}
  newLine={() => ({ tax: defaultTax, unit: defaultUnit })}
/>
```

- Поля форми: `lines` (`DocumentBodyLine[]` з `lib/document-lines`), `discountPercent`, `discountAmount` — знижка на документ.
  Знижка рядка й документа — відсотком або сумою в мінорних одиницях, одне з двох.
- Рядок має вид `kind`: `item` — товар чи послуга, `section` — розділ (`title`) до наступного розділу, `note` — текст без суми
  (`text`). Підсумки рахуйте з `itemLinesOf(lines)`; сума розділу — лише для показу, сервер її не зберігає.
- Великий документ редактор тримає сам: від `virtualizeFrom` рядків (12) малює лише видимі, прокручується сторінка; у діалозі
  чи шторці з власною прокруткою малює всі. Варіанти `units`, `taxes` і `item` робіть стабільними (`useMemo`), інакше кожен
  рядок перемальовується на кожен рендер форми. Поля рядка поза екраном немає в DOM: форма — з `shouldFocusError: false` і
  `FormErrorSummary`. Підписи колонок таблиці липнуть під топбаром (`--app-topbar-height`, ADR-0063).
- Великий документ з клавіатури (ADR-0064) теж дає редактор: Ctrl+End з будь-якого поля рядка веде на знижку документа; від
  `virtualizeFrom` рядків над рядками стоять пошук у рядках (назва, розділ, нотатка чи номер рядка; вибір ставить фокус у рядок,
  навіть поза екраном) і кнопка «До підсумків», а ⌘F/Ctrl+F у рядках ставить курсор у цей пошук. Меню розділу має «Перенести
  розділ із рядками вище» й «…нижче»: розділ міняється місцями із сусіднім, рядки до першого розділу лишаються на місці.
- Підсумки під рядками — попередній розрахунок `computeDocumentTotals`; запис із сервера розбирайте `documentBodySchemaFor(digits)`,
  а в режимі лише для читання передайте підсумки сервера в `savedTotals`, а рядки — з `totals` (`savedDocumentLineSchema`).
- `toLine` і `newLine` дають лише ті поля, що відомі: `undefined` у `toLine` лишає поточне значення рядка, у `newLine` — значення
  порожнього рядка. Форма — без `shouldUnregister`.
- Бекенд рахує ті самі суми за таблицями ADR-0056 і ADR-0059: знижка документа ділиться між рядками пропорційно, копійки
  залишку — найдорожчому рядку, база ПДВ зменшується. Знижка понад свою суму — 422 `discount_exceeds`.

### Друк (ADR-0062)

Друк — діалог друку браузера, PDF — «Зберегти як PDF» там само; архівний юридичний PDF дає сервер. Перегляд друку — окрема
сторінка картки з блоками кіта, кнопка «Друк» на картці — посилання на неї.

```tsx
// /orders/:id/print: дані картки й профіль компанії; мова аркуша — мова документів компанії.
const { data: company } = useCompanyProfile()
const state = order && company ? undefined : error ? errorStateKind(error) : "loading"

<PrintPreview title={`${t("orders.print")} ${order?.number ?? ""}`} language={company?.language} state={state} onRetry={retry}>
  {order && company ? (
    <>
      <PrintWatermark docStatus={order.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintCompanyHeader company={company} />
        <PrintDocumentTitle title={sheetT("orders.title")} number={order.number} date={order.date} docStatus={order.docStatus} />
        <PrintParties parties={[{ label: sheetT("orders.seller"), name: company.legalName }, { label: sheetT("orders.buyer"), name: order.client }]} />
        <PrintDocumentLines lines={order.lines} currency={order.currency} />
        <PrintDocumentTotals lines={order.lines} currency={order.currency} totals={order.totals} />
        <PrintSignatures company={company} />
      </div>
    </>
  ) : null}
</PrintPreview>
```

- На сторінці з аркушем (`data-print-root`) друкується лише він, Ctrl+P теж; один аркуш на сторінці. Без аркуша будь-яка
  сторінка друкується на A4 без оболонки; `data-print="hide"` — не друкувати елемент, `data-print="avoid-break"` — не
  розривати його між сторінками. Рядок таблиці не розривається, шапка таблиці повторюється на кожній сторінці.
- Аркуш світлий і в темній темі, папір — теж: утиліти `dark:` (кіта й проекту) діють лише на екрані й поза світлою областю
  `data-theme="light"` (ADR-0082). Мова аркуша — `language` (мова документа), а не інтерфейсу: тексти аркуша, суми, дати й сума
  прописом. Вид документа, підписи сторін і назви одиниць — дані модуля мовою документа.
- Суми рядків і підсумки — сервера (`savedDocumentBodyLineSchema`, `documentTotalsSchema`), сума розділу — та сама, що в
  редакторі, рядки підсумків — ті самі, що під редактором (`totalsRowsOf`). Сума прописом — для UAH, USD, EUR; інші валюти —
  словами через `currencies` з усіма формами слова (`hasCurrencyWords`), інакше без суми прописом.
- Чернетка й скасований друкуються з позначкою «Чернетка» чи «Скасовано» на кожній сторінці, у чернетки «(без номера)».
- Логотип і печатка — з профілю компанії (`logoUrl`, `stampUrl`); `PrintSignatures stamp={false}` — без печатки. Порожній
  реквізит не друкується.
- `PrintButton` чекає логотипа й печатки аркуша (до 3 с) і на час друку ставить у заголовок сторінки назву документа: з неї
  браузер бере назву файла PDF. Кнопку прибрали, поки чекали, — друк скасовано; свій виклик `printPage` скасовує `signal`.
- Сторінка з віртуальними рядками (редактор великого документа, таблиця) друкує лише намальовані рядки: документ друкуйте аркушем.
- Нестандартний папір (наліпки, чек): правило `@page` кіта (A4) не чіпайте, а дайте своєму аркушу іменовану сторінку в
  `src/index.css` проекту. Решта документів лишається на A4:

  ```css
  @page label {
    size: 58mm 40mm;
    margin: 2mm;
  }
  @media print {
    .label-preview [data-print-root] {
      page: label;
    }
  }
  ```

  `<PrintPreview className="label-preview" …>` — клас стоїть на обгортці перегляду, а сторінку бере аркуш усередині.

### Реквізити сторін (ADR-0068)

Сторона документа (`lib/document-parties`, `PartyDetails`) — знімок у документі: вид, назва, код, ІПН, IBAN і банк, адреса,
контакти, підписант, «в особі» в родовому відмінку (вручну, одним полем) і «діє на підставі». Наша компанія виступає
замовником чи виконавцем, контрагент — другою роллю.

```tsx
const party = usePartyDetailsSchema()
const schema = useMemo(() => z.object({ ourRole: z.enum(PARTY_ROLES), ours: party, theirs: party }), [party])
const { data: company } = useCompanyProfile()

<PartyRoleField form={form} name="ourRole" />
<PartyDetailsFields
  form={form}
  name="ours"
  legend={t("partyDetails.ours", { role: t(`partyDetails.roles.${ourRole}`) })}
  source={{ label: t("contracts.fillCompany"), values: company && partyFromCompany(company), unavailableReason: t("contracts.companyLoading") }}
/>
<PartyDetailsFields form={form} name="theirs" legend={t(`partyDetails.roles.${otherPartyRole(ourRole)}`)} source={counterpartySource} />
```

- Схема — `usePartyDetailsSchema` з `erp/party-details-schema`: у знімок ФОП не йдуть посада й «в особі». `source.unavailableReason`
  обов'язковий: поки даних немає, кнопка неактивна з цією причиною.
- «Заповнити з …» бере з джерела лише порожні поля; вид — разом із кодом, поки код порожній. Що дати з картки контрагента,
  вирішує модуль: у картці B1 немає підписанта й «діє на підставі».
- ПІБ — у порядку «Прізвище Ім'я По батькові»: з нього підпис «Олена КОВАЛЬ» (`signatureName`), і під полем видно, як
  підпишуть документ. `PrintSignatures` друкує так само директора й бухгалтера профілю компанії.
- На аркуші: `partyClause(party, роль, t)` — «…, в особі …, що діє на підставі … (надалі «Замовник»)», `PrintPartyDetails` —
  реквізити й підписи сторін, `partyRequisiteLines` — рядки для `PrintParties`. `t` і підписи ролей — мовою аркуша
  (`usePrintSheet`, `print.sheet.party.customer`). Порожній реквізит не друкується, ФОП — без посади й «в особі».

### Документ із шаблону .docx (ADR-0087)

Генератор заповнює шаблон Word значеннями документа в браузері: людина вибирає шаблон проекту чи свій файл .docx,
бачить форму міток за сторонами, перегляд самого файла й завантажує той самий файл. Дія на картці документа модуля —
компонент проекту в слоті `actions` розширення (ADR-0086):

```tsx
// extensions/invoice-from-template.tsx — вантажиться ліниво, див. нижче
export function InvoiceFromTemplate({ record }: RecordSlotProps<Invoice>) {
  const document: TemplateDocument = {
    number: record.number,
    date: record.date,
    currency: record.currency,
    total: record.total,
    ...templateDetailOf(record),
    parties: {
      contractor: { details: record.supplier, label: { uk: "Постачальник", en: "Supplier" } },
      customer: { details: record.buyer, label: { uk: "Покупець", en: "Buyer" } },
    },
    fields: [{ key: "dueDate", label: { uk: "Сплатити до", en: "Due date" }, value: { date: record.dueDate } }],
  }
  return (
    <DocumentGeneratorButton
      document={document}
      templates={TEMPLATES}
      fileName={record.number ?? "Чернетка"}
      unavailableReason={isLoading ? t("contracts.partiesLoading") : undefined}
    />
  )
}

const TEMPLATES: DocumentTemplateOption[] = [
  { id: "contract", label: { uk: "Договір поставки", en: "Supply contract" }, load: () => fetch("/templates/contract.docx").then((r) => r.blob()) },
]
```

- Мітки: `{number}`, `{dateLong}`, `{total}`, `{totalInWords}`, `{customer.name}`, `{customer.clause}` («…, в особі …
  (надалі «Покупець»)»), `{contractor.signature}` («Олена КОВАЛЬ»), інші поля — `{fields.<ключ>}` (`{fields.dueDate}`:
  нова мітка кіта поле проекту не перекриє; ключ латиницею, кожен раз один); рядки — між
  `{#lines}` і `{/lines}` (`{no}`, `{name}`, `{quantity}`, `{unit}`, `{price}`, `{total}`…), умова —
  `{#customer.vatIpn}ІПН {customer.vatIpn}{/customer.vatIpn}`. Повний перелік — «Які мітки можна вставити» в генераторі.
- Невідома мітка, `{@…}` і помилка запису — перелік «Помилки в шаблоні» біля мітки, завантаження неактивне з причиною.
  Поки дані документа вантажаться (картка контрагента), дайте `unavailableReason`: форма й перегляд працюють, а
  завантаження чекає. Сума прописом у своїй валюті — `currencies`, як у друку.
- Межі шаблону: файл до 10 МБ, розпакований до 50 МБ, текст Word до 10 МБ і до 500 міток.
- Значення — мовою документа (мова компанії, як у друку, чи `language`), людина може виправити значення перед
  завантаженням; документ від цього не змінюється.
- Розширення збирається на старті застосунку, тож компонент дії вантажте ліниво, у своєму `Suspense` з неактивною
  кнопкою тієї самої назви (демо: `apps/demo/src/extensions/document-template-actions.tsx`). Бібліотеки генератора
  вантажаться лише після відкриття.
- `DocumentGenerator` — той самий генератор просто на сторінці (без діалогу).

### Закриті періоди (ADR-0069)

Компанія має одну дату закриття (`GET`/`PATCH /period-lock/current`, `lockedThrough` — останній закритий день). Документ із
датою по неї включно не створюється й не змінюється, чернетка теж: сервер відповідає `422` з кодом `period_locked` біля поля
дати, а в записі ставить `deniedActions` з причиною `period_locked` на всі дії, крім сторно. Сторно датується сьогодні.
Які документи йдуть за датою, вирішує модуль: облікові (рахунок, акт, накладна) — так, пропозиції й замовлення — ні.

```tsx
const posting = usePostingDate()

<PeriodLockBanner date={record.date} hint={t("invoices.periodLockHint")} />
<DocumentActionBar … />
// поле дати форми: { id: "date", description: posting.hint, render: … <DateInput … min={posting.min} /> }
```

- Налаштування — `PeriodLockSettings` (дата, «Закрити <місяць>», причина відкриття, роки компанії) і `PeriodLockExceptions`
  (виняток одній людині до часу з причиною) на сторінці налаштувань; права `period-lock:update`,
  `period-lock-exceptions:read|create|delete`.
- Бекенд без закритих періодів відповідає `404`: смуги немає, сторінка налаштувань пише, що сервер їх не тримає.
- Моки: `createPeriodLockMocks({ seeds })` один на застосунок, `handlers` — до обробників; документам модуля —
  `forResource({ resource, dateField, actions })`: `deniedActions` (злийте з позначками життєвого циклу, ті — останніми),
  `validateWrite` і `afterWrite` — в опції ресурсу, `afterTransition` — у `createTransitionHandlers`.

### Кошик (ADR-0095)

Сервер, що веде кошик, переносить запис туди на `DELETE /<ресурс>/:id` і тримає його `retentionDays` днів, потім видаляє
назавжди сам. `GET /trash/settings` каже строк і ресурси з кошиком, `GET /trash?resource=` віддає видалені записи ресурсу,
`POST /trash/<ресурс>/<id>/restore` повертає запис (контракт — SPEC §17, `lib/trash`). Бачить і відновлює той, хто може
видаляти: `<ресурс>:delete`, з `:own` — свої. Бекенд без кошика відповідає `404` на налаштування: кнопки «Кошик» немає,
видалення питає підтвердження, як і раніше.

```tsx
// Шапка списку: кнопка «Кошик» — лише з кошиком і правом
actions={[{ id: "trash", node: <TrashLink resource="organizations" to={paths.organizationsTrash} /> }]}

// Картка: з кошиком — без діалогу, «Перенесено в кошик» зі «Скасувати»; без нього — підтвердження
<DocumentDeleteAction resource="organizations" document={record} listPath={paths.organizations}
  name={record.name} texts={{ …, trashed: t("organization.delete.trashed") }} lockReason={lock.reason} />

// Маршрут `<список>/trash` — перед `/:id`
<TrashPage resource="organizations" schema={rowSchema} rowLabel={(o) => o.name}
  listTitle={t("organizations.title")} listPath={paths.organizations}
  backLabel={t("organization.back")} recordHref={paths.organization} />
```

- Масове видалення лишає підтвердження: допишіть до опису `useTrashKeptFor(resource)` («Відновити їх можна з кошика
  протягом 30 днів»), без кошика він `undefined`.
- Модулі B1, B3 і K2 підключають кошик самі: маршрути `…/trash`, кнопка «Кошик», «Видалити» на картках організації й
  контакту (дія `delete` у типі розширення: сховати — як інші дії шапки).
- Рядки — `useErpUiT(ukTrash)` у своєму коді (ADR-0094). API — `authProvider.trash` (`getSettings`, `list`, `restore`):
  провайдер на `createAuthProvider` отримує його сам, написаний вручну додає (`CHANGELOG.md`).
- Моки: `createTrashMocks()` один на застосунок, `handlers` — до обробників; ресурсу — опція `trash: { bin, deleted? }` у
  `createResourceHandlers` і `create<Модуль>Mocks`. Зв'язок, який видалення звільняє (`afterDelete`), відновлення займає
  знову: `trashLinks(() => [mockLinkSlot(db, "parentId", "childId")])`, зайнятий — `409 restore_conflict`. Сценарії —
  ресурс `trash` (`empty`, `conflict` і загальні).

### Модуль B3 «Пропозиції й замовлення» (ADR-0065…ADR-0067)

Перший модуль документа на рушії хвилі 2: пропозиції й замовлення (список, картка, форма, друк, масові дії), «Створити
замовлення» з прийнятої пропозиції, потік документів на картках і «Копіювати документ». Перевірено тестовим проектом на v1.3.0.

```ts
// src/modules.ts
import { createSalesModule } from "@/modules/B3-sales"
import { salesExtension } from "@/extensions/B3-sales"

export const salesModule = createSalesModule({
  basePath: "/sales",
  extension: salesExtension,
  clients: { resource: "organizations", labelField: "name", descriptionField: "code", href: contactsModule.paths.organization },
})
// маршрути — salesModule.routes, навігація — salesModule.nav (пункти з access), сценарії — salesModule.resources

// src/mocks/handlers.ts — нумерація, задачі й потік документів — по одному на застосунок
import { createDocumentFlowHandlers } from "@/lib/mock-document-flow"
import { createJobHandlers } from "@/lib/mock-jobs"
import { createNumberingMocks } from "@/lib/mock-numbering"
import { createSalesMocks, salesNumberingSeeds } from "@/modules/B3-sales/mocks"
const options = { companies: ["my-company"], clients: (companyId) => myOrganizations(companyId) }
const seeds = salesNumberingSeeds(options)   // серії `quotes` і `orders`
const numbering = createNumberingMocks({ series: seeds.series, counters: seeds.counters })
const sales = createSalesMocks({ ...options, numbering, extension: salesMockExtension })
const flow = createDocumentFlowHandlers({ sources: [...otherFlowSources, ...sales.flowSources] })
setupWorker(...createPlatformHandlers({}), ...createJobHandlers(), ...numbering.handlers, ...flow, ...sales.handlers)
```

- Права: `quotes` з `read`, `create`, `update`, `delete` і діями графа `submit`, `accept`, `decline`, `order` («Створити замовлення»,
  сервер вимагає ще й `orders:create`), `cancel`, `amend`; `orders` з `read`, `create`, `update`, `delete`, `submit`, `complete`,
  `cancel`, `amend`; плюс дії розширення. Масова дія — те саме право. Дія без права неактивна з причиною.
- Статуси пропозиції: «Чернетка», «Надіслано», «Прийнято», «Відхилено», «Скасовано»; «Термін минув» — позначка надісланої з минулим
  «Дійсна до», а не статус. Замовлення: «Чернетка», «Підтверджено», «Виконано», «Скасовано», позначка «Прострочено».
- Змінити можна лише чернетку. Проведену змінюють через «Скасувати» з причиною й «Виправити»: нова чернетка з тим самим клієнтом,
  рядками й полями розширення. Пропозицію, з якої створено нескасоване замовлення, не скасувати.
- Клієнти — ресурс клієнтів проекту в опції `clients`, за замовчуванням `organizations` модуля B1; сам модуль B1 не
  імпортується. Товар у рядку — необов'язковий `lineItem` з ресурсу проекту; одиниці, податки й типові значення рядка — ресурси A6
  за назвами, без них рядок пишеться вільним текстом.
- Бекенду: `GET /quotes` без рядків, `GET /quotes/:id` з `lines` і `totals`, суми рахує сервер; `POST /quotes/:id/<дія>`,
  `POST /quotes/:id/order` → 201 нове замовлення; `POST /quotes/bulk/<дія>` → задача; `GET /quotes/:id/flow`; так само `/orders`.
  Бекенд без `/flow` ховає секцію: `quotes.sections.hide: ["flow"]` і так само `orders`. Повний контракт — `README.md` модуля.
- Розширення `SalesExtension` (`quotes`, `orders`): `fields`, `statuses` і `transitions` (свій статус і дія до нього), `columns`,
  `filters`, `tabs`, `recordFields`, `sections` (`lines`, `flow`), `actions` (`edit`, `copy`, `delete`, `print`), `aside`, `history`,
  `editLock`, `form`; `strings`. Проект без замовлень ховає `quotes.transitions.hide: ["order"]`.
- Рахунки модуля K2: опція `invoices: { href: invoicesPaths(basePath).invoice }` фабрики дає на замовленні «Виставити рахунок»
  (право `orders:invoice`, сервер вимагає ще й `sales-invoices:create`), а моки — `createSalesMocks({ invoices: { create:
  invoices.fromOrder, hasActive: invoices.hasActive } })`. Без опції дії немає. Поля розширення з тим самим ключем переходять із
  пропозиції в замовлення й із замовлення в рахунок, якщо значення підходить полю нового документа (ADR-0070).

### Модуль K2 «Рахунки клієнтам» (ADR-0070, ADR-0071, ADR-0072, ADR-0073, ADR-0084)

Обліковий документ: закритий період (ADR-0069) його стосується. Список, картка, форма, «Копіювати», друк «Рахунок на оплату» з
QR-кодом оплати НБУ, масові дії, «Виставити рахунок» із замовлення B3 (один рахунок на замовлення), рахунок у валюті компанії з
сумою в базовій валюті поруч і фільтром «Валюта» у списку, кредит-ноти на підставі виставлених рахунків (окремий пункт меню),
оплати модуля K4 і статус «Оплачено», з оплатами й опцією `aging` — «Борги клієнтів» (старіння боргу).

```ts
// src/modules.ts
import { createInvoicesModule, invoicesPaths } from "@/modules/K2-invoices"
export const invoicesModule = createInvoicesModule({
  basePath: "/finance",
  extension: invoicesExtension,
  clients: {
    resource: "organizations",
    labelField: "name",
    href: contactsModule.paths.organization,
    party: (organization) => ({ name: organization.name, code: organization.code, iban: organization.iban }),
  },
  sources: { order: salesModule.paths.order, quote: salesModule.paths.quote },
  currencies: { resource: "currencies" }, // валюти компанії модуля A1; без опції — лише базова валюта
  // оплати модуля K4; без опції рахунок про оплати не знає; без refunds — без «Повернути переплату»
  payments: { resource: "sales-payments", register: paymentsPaths("/finance").newPayment, href: paymentsPaths("/finance").payment,
    refunds: { resource: "sales-refunds", register: paymentsPaths("/finance").newRefund, href: paymentsPaths("/finance").refund } },
  aging: { buckets: [30, 60, 90] }, // «Борги клієнтів»: межі кошиків, днів після «Сплатити до»; за замовчуванням досить aging: {}
})
// у B3: createSalesModule({ …, invoices: { href: invoicesPaths("/finance").invoice } })

// src/mocks/handlers.ts — після createPeriodLockMocks і нумерації; моки B3 — після рахунків
const invoices = createInvoicesMocks({ ...options, numbering, periodLock, releaseOrder: (removed) => sales.releaseOrderInvoice(removed),
  rates: { baseCurrency: () => "UAH", rateOn: company.rateOn } }) // company = createCompanyMocks(...) модуля A1
const sales = createSalesMocks({ ...options, numbering, invoices: { create: invoices.fromOrder, hasActive: invoices.hasActive } })
const flow = createDocumentFlowHandlers({ sources: [...sales.flowSources, ...invoices.flowSources] })
```

- Права: `sales-invoices` з `read`, `create`, `update`, `delete` і діями графа `submit` («Виставити»), `cancel`, `reverse`, `amend`,
  `creditNote` («Створити кредит-ноту», ще й `sales-credit-notes:create`); `sales-credit-notes` з `read`, `create`, `update`,
  `delete`, `submit`, `cancel`, `reverse`, `amend`; плюс дії розширення. Серії номерів — `sales-invoices` і `sales-credit-notes`
  (`invoicesNumberingSeeds` дає обидві).
- Статуси: «Чернетка», «Виставлено», «Оплачено», «Скасовано», «Сторновано», «Сторно»; «Прострочено» — позначка виставленого з
  минулою «Сплатити до». «Оплачено» ставить сервер за оплатами модуля K4 (нижче), а не дія графа.
- Сторно — новий проведений рахунок із датою сьогодні (перший відкритий день), тими самими рядками й `totals`, `total` з мінусом.
- Сторони — знімки `PartyDetails` (ADR-0068): постачальник з профілю компанії, покупець — з запису клієнта функцією `clients.party`.
- Рахунок у валюті (ADR-0071): сервер віддає блок `exchange` (`lib/currency-conversion`): курс на дату рахунку чи останній перед
  нею, підсумок у базовій валюті (`total × курс`, половина від нуля). Чернетка — свіжий курс, «Виставити» закріплює, сторно — за
  курсом першого з мінусом; курсу немає — рахунок однаково виставляють. Сума в базовій валюті — поруч, а не замість суми документа:
  у списку під сумою, на картці поле «У базовій валюті» з курсом. Самі нічого не перераховуйте в браузері.
- Кредит-нота (ADR-0072) — окремий документ на підставі виставленого рахунку: кілька до рахунку, разом не більші за рахунок
  (перевіряє сервер за кількістю кожного рядка), бухгалтер лише прибирає рядки й зменшує кількість; ціни, знижки й податок — з
  рахунку, сума рядка — частка рядка рахунку. Валюта й курс — рахунку; рахунок у закритому періоді — кредит-нота датою сьогодні.
  Статус рахунку не змінюється: на картці поле «Кредит-ноти»; рахунок із виставленою кредит-нотою не скасовують і не сторнують.
  Бекенд без кредит-нот — `invoices.transitions.hide: ["creditNote"]` у розширенні й без права `sales-credit-notes:read`.
- QR-код оплати друкується лише у виставленого рахунку в гривнях із правильними IBAN, кодом і назвою постачальника (без переносу
  рядка); інакше над аркушем пояснення, чого бракує. Сума QR — борг: виставлено мінус кредит-ноти мінус оплачено; борг нуль — QR
  немає, а під «Разом» аркуша — «Кредит-ноти», «Оплачено», «Повернено» й «До сплати» (ADR-0074, ADR-0083). «Посилання на
  оплату» на картці рахунку в гривнях, що чекає оплати, — діалог із тим самим QR-кодом і посиланням `bank.gov.ua/qr/…`, яке
  копіюють і надсилають клієнту (ADR-0083). Валютні реквізити вписують у блок постачальника самого рахунку. Формат — НБУ 003 (`lib/payment-qr`); перед першим проектом перевірте код скануванням у
  кількох банківських застосунках.
- «Борги клієнтів» (ADR-0084, з `payments` і `aging`): рядок на клієнта й валюту за рахунками з боргом > 0 на сьогодні, кошики
  днів після «Сплатити до» за межами `aging.buckets`, «Разом» і «Разом у базовій валюті» за курсом кожного рахунку (без
  переоцінки). Групує сервер: `GET /sales-invoices/aging?buckets=30,60,90`. Бекенд без звіту — без опції `aging`.
- Бекенду: `GET /sales-invoices`, `GET /sales-invoices/:id` з `lines` і `totals`, `POST`/`PATCH` із `supplier` і `buyer` цілими,
  `POST /sales-invoices/:id/<дія>`, `POST /sales-invoices/bulk/<дія>`, `GET /sales-invoices/:id/flow`, `POST /orders/:id/invoice`,
  з `aging` — `GET /sales-invoices/aging`; фільтр `currency` у `GET /sales-invoices`;
  кредит-ноти — `POST /sales-invoices/:id/creditNote`, `GET /sales-credit-notes`, `GET`/`PATCH`/`DELETE /sales-credit-notes/:id`
  (у чернетці `basis` — залишки рядків рахунку), `POST /sales-credit-notes/:id/<дія>`, `GET /sales-credit-notes/:id/flow`.
  Повний контракт — `README.md` модуля.

### Модуль K4 «Оплати» (ADR-0073, ADR-0083)

Оплата клієнта за рахунками K2: проведений документ одразу з номером серії «ОП-…», на один чи кілька рахунків того самого
клієнта. Обліковий документ: закритий період його стосується. Список, картка, форма «Зареєструвати оплату»; з картки рахунку —
та сама форма з клієнтом і рахунком, сума — борг. Розділ «Повернення» — гроші, повернуті клієнту за рахунком із переплатою
(кредит-ноту виставили після оплати): окремий документ серії «ПВ-…» з тими самими списком, карткою й формою; з картки рахунку —
«Повернути переплату», сума — переплата.

```ts
// src/modules.ts — фабрики K2 і K4 одна від одної не залежать: лише адреси
import { createPaymentsModule, paymentsPaths } from "@/modules/K4-payments"
export const paymentsModule = createPaymentsModule({
  basePath: "/finance",
  extension: paymentsExtension,
  clients: { resource: "organizations", labelField: "name", href: contactsModule.paths.organization },
  invoices: { resource: "sales-invoices", href: invoicesPaths("/finance").invoice },
})

// src/mocks/handlers.ts — засів серії оплат від засіву рахунків, моки K4 — після моків K2
const paymentSeeds = paymentsNumberingSeeds({ invoices: invoicePaymentSeed(options), companies, rates })
const invoices = createInvoicesMocks({ ...options, numbering, periodLock, rates,
  payments: { paidTotal: (invoiceId) => payments.paidTotal(invoiceId), refundedTotal: (invoiceId) => payments.refundedTotal(invoiceId) } })
const payments = createPaymentsMocks({ invoices: invoices.forPayments, numbering, periodLock, rates })
const flow = createDocumentFlowHandlers({ sources: [...invoices.flowSources, ...payments.flowSources] })
```

- Права: `sales-payments` з `read`, `create` («Зареєструвати оплату»), `cancel`, `reverse`; `sales-refunds` з `read`, `create`
  («Повернути переплату»), `cancel`, `reverse`; плюс дії розширення. Серії номерів — `sales-payments` і `sales-refunds`
  (`paymentsNumberingSeeds` дає обидві).
- Борг рахунку — «виставлено мінус кредит-ноти мінус оплачено»; рахує сервер. Переплати й авансу немає: сума кожному рахунку не
  більша за борг, сума оплати дорівнює сумі рознесення. Часткова оплата статусу рахунку не змінює: на картці — «Оплачено» й «До
  сплати». Рахунок з оплатою, що діє, не скасовують і не сторнують.
- Повернення не більше за переплату рахунку (`exceeds_overpayment`), сума повернення дорівнює сумі рознесення. Борг рахунку з
  поверненнями — «виставлено мінус кредит-ноти мінус оплачено плюс повернено»; статус рахунку повернення не змінює, на картці —
  рядок «Повернено». Рахунок із поверненням, що діє, теж не скасовують і не сторнують.
- Помилкова оплата: у відкритому періоді — «Скасувати» з причиною, у закритому — «Сторнувати» (сторно сьогодні, сума з мінусом).
- Форма шле `requestId` — один на форму: повтор того самого запиту сервер має повертати ту саму оплату, а не створювати другу.
- Бекенду: `GET /sales-payments`, `GET /sales-payments/:id`, `POST /sales-payments` з `requestId` і `allocations`,
  `GET /sales-payments/open-invoices?clientId=`, `POST /sales-payments/:id/<дія>`, `GET /sales-payments/:id/flow`; у картці
  рахунку — `paidTotal`, статус `paid`, `deniedActions` `has_payments`. Повернення — ті самі запити `/sales-refunds`,
  рахунки з переплатою — `GET /sales-refunds/overpaid-invoices?clientId=`, у картці рахунку — `refundedTotal`. Повний контракт —
  `README.md` модуля.

### Наявний бекенд через адаптер (ADR-0021)

Бекенд за контрактом кіта (ADR-0002, ADR-0003) адаптера не потребує: `createApiClient({ baseUrl })` і провайдери кіта. Адаптер — для наявного бекенду з іншим API, який ми не змінюємо. Приклад — адаптер тестового проекту (крок 1.6).

- **Де.** `src/adapters/<бекенд>/` — файли проекту, `shadcn add` їх не чіпає. Модулі й моки про адаптер не знають.
- **Перемикач.** `VITE_BACKEND=mocks|api|<бекенд>` (ключ — у `.env.example`, назва адаптера — у `BACKENDS` у `vite.config.ts`): у розробці без змінної — моки, збірка без неї зупиняється; з бекендом MSW не стартує й панелі сценаріїв немає (розділ 5, «Моки поза продакшном»). Бекенд — через проксі Vite на тому ж домені (`server.proxy` і `preview.proxy`, адреса — зі змінної середовища), тоді CORS не потрібен.
- **Транспорт.** Свій `fetch` для `createApiClient`: `Authorization: Bearer`, одне спільне оновлення токена на всі паралельні 401 і один повтор запиту, помилки бекенду → `{ code, message, fieldErrors? }` кіта (`ApiError`, `Retry-After` зберігайте). Відповіді бекенду перевіряйте zod-схемами: розбіжність — явна помилка `server`, не тихі порожні дані.
- **Вхід, вихід і профіль.** Поки в `createAuthProvider` немає опцій (ADR-0021), вхід перекладає міст: окремий `fetch` для клієнта кіта відповідає на `/auth/methods`, `/auth/login`, `/auth/logout` і `/me` у форматі кіта, а сам іде в бекенд. Профіль бекенду → `Me` з правами `<ресурс>:<дія>`; способи входу, яких бекенд не має, вимикає відповідь `/auth/methods`.
- **Провайдер.** Беріть `createAuthProvider` і перевизначайте своє: `{ ...kitAuth, logout }`, під-API — `{ ...kitAuth, admin: { ...kitAuth.admin, blockUser } }`. Тоді новий метод кіта приходить сам, це мінорна версія (ADR-0021, доповнення A2c4). Написаний повністю вручну провайдер додає метод за `CHANGELOG.md`. API платформи (`account`, `admin`, `audit`, `webhooks`, `invitations`, `timeline`…) складає `createPlatformApis` з `@/lib/platform-api`; більшість із них вантажить свій код при першому виклику, а методи — звичайні поля, тож `{ ...kitAuth.admin, blockUser }` працює так само (ADR-0092). Свій API проекту, якого перший екран не потребує, загорніть у `lazyApi` звідти ж: другий аргумент перелічує всі методи типу, кожен повертає `Promise`; чанк, що не завантажився, `useApiErrorMessage` показує текстом «Оновіть сторінку».

  ```ts
  // src/adapters/reports.ts: код звітів вантажиться при першому виклику, а не з першим екраном
  import { lazyApi } from "@/lib/platform-api"
  import type { ReportsApi } from "./reports-api"

  export const reports = lazyApi<ReportsApi>(
    () => import("./reports-api").then((m) => m.createReportsApi(client)),
    { list: true, run: true },
  )
  ```
- **Дані.** Обгортка над `createDataProvider`: перевизначте лише ресурси й методи, що відрізняються (`getList`, `getOne`, `create`, `update`, `delete`…); `id` — рядком; немає `version` — стала `version: 1`, і бекенду її не шліть. Чого бекенд не має (ресурси, поля, вкладки), ховайте окремим файлом розширення модуля поверх розширення проекту, а не показуйте порожнім; рядки «Подробиць» картки — `detailRows: { hide }`, журнал змін, якого бекенд не веде, — `history: false` (з v0.3.0).
- **Реальний час.** Без `GET /events` не ставте `<RealtimeSync />` (розділ «Реальний час і «Редагує …»»). Канал іде тим самим `fetch` адаптера, тож заголовок `Authorization` він отримує сам.
- **Токени.** Лише в пам'яті вкладки, не в `localStorage` (ADR-0021, п. 5). Якщо бекенд віддає refresh лише в тілі відповіді, після перезавантаження сторінки — вхід заново (кіт поверне на ту саму адресу), або httpOnly cookie через проксі чи доробку бекенду (рішення власника).
- **Перевірка.** Модульні тести адаптера на підставному `fetch`; контрактні тести zod-схемами проти запущеної копії бекенду (окремий скрипт, напр. `pnpm test:pilot-api`) і e2e з бекендом (`pnpm e2e:pilot-api`) — окремо від звичайних `pnpm test`, `pnpm e2e` і CI. Локальна копія бекенду — Docker з тестовими даними й скриптом наповнення, порти лише на `127.0.0.1`.
- **README проекту** називає, чого адаптер не дає (конфлікти версій, масові дії, історія, вихід на сервері тощо) і вади бекенду, які видно з кодом.

### Сервер на TypeScript: схеми й правила з кіта (ADR-0093)

Бекенд проекту на TypeScript бере ті самі zod-схеми й функції правил, що й інтерфейс і моки: підсумки документа, нумерацію, межу прав ролей, закритий період, рознесення оплати. Тоді після оновлення кіта сервер рахує так само, як екрани, без ручних копій.

- **Що брати.** Файли чистого шару контрактів: `contract.ts` і `resources.ts` модулів, правила модулів і утиліти з розділу «Чистий шар контрактів» каталогу (`docs/erp-ui/CATALOG.md`). Вони імпортують лише `zod` і одне одного, зокрема типами: серверу не потрібні React, i18next чи ra-core. Решта файлів кіта (компоненти, хуки, `lib/format`, `lib/statuses`) — для інтерфейсу.
- **Де лежать.** Бекенд у тому самому репозиторії, що й інтерфейс, бере їх із теки інтерфейсу (`apps/admin/src/modules/…`, `apps/admin/src/lib/…`; адмінка — окремим пакетом, розділ 1, «Адмінка в монорепо з сервером»): оновлює їх та сама команда кіта, typecheck сервера з цими шляхами перевіряє CI кіта. Окремого елемента реєстру для серверного пакета поки немає.
- **Шляхи й запуск.** Файли шару імпортують одне одного як `@/lib/…`, модуль — ще `./resources`, без розширення файла. У `tsconfig.json` бекенду (`apps/server`) — `"moduleResolution": "bundler"`, `"paths": { "@/lib/*": ["../admin/src/lib/*"], "@/modules/*": ["../admin/src/modules/*"] }` і `"DOM"` у `lib`: кілька файлів шару називають типи браузера (`Window` і `MessageEvent` у `lib/session`, ключі доступу в `lib/passkey`), хоч на сервері їх не викликають. Запуск і збірка — інструментом, що розуміє `paths` і імпорт без розширення (tsx, esbuild, збирач бекенду); вбудоване в Node зняття типів і `NodeNext` цього не вміють. `zod` — та сама мажорна версія, що в інтерфейсі. Під час імпорту Node 26 друкує `ExperimentalWarning` про `localStorage` (`lib/company-scope` читає збережену компанію): це попередження, не помилка.
- **Розширення проекту.** Схема з полями й статусами клієнта — та сама функція контракту з даними розширення: `invoiceSchemaFor({ fields, lineFields, statuses })`, `mergeTransitions(…)` для графа дій. Файл розширення (`src/extensions/K2-invoices.ts(x)`) може мати компоненти, тож дані для сервера тримайте окремим файлом без компонентів, який імпортують і розширення, і бекенд.

  ```ts
  // apps/admin/src/extensions/K2-invoices.data.ts: поля й статуси клієнта без компонентів
  import type {
    InvoiceSchemaExtension,
    InvoiceStatus,
  } from "@/modules/K2-invoices/contract"

  export const invoicesData = {
    fields: [{ id: "project", type: "text", label: { uk: "Проект", en: "Project" } }],
    statuses: { hide: ["reversed"] },
  } satisfies InvoiceSchemaExtension<InvoiceStatus>

  // apps/server/src/invoices.ts: та сама схема відповіді, що в інтерфейсі й моках
  import { invoiceSchemaFor } from "@/modules/K2-invoices/contract"
  import { invoicesData } from "../../admin/src/extensions/K2-invoices.data"

  const invoiceSchema = invoiceSchemaFor(invoicesData)
  ```
- **Свій файл правил**, який має брати сервер, імпортує з кіта лише файли шару: `@/lib/format-core`, а не `@/lib/format`; `@/lib/statuses-core`, а не `@/lib/statuses`. Старі шляхи реекспортують ті самі функції для інтерфейсу.

## 6. Вхід і акаунт

```sh
node scripts/erp-ui-kit.mjs update v1.5.0 --add auth,erp/auth-routes   # усі екрани входу й безпеки (потрібен пакунок data)
```

Що показати на сторінці входу, вирішує бекенд (`GET /auth/methods`, ADR-0010): пароль, код на email чи в SMS, ключ доступу, Google, Apple, будь-який OIDC, реєстрація, відновлення. Маршрути — поза брамою сесії (розділ 4), усі одним викликом `createAuthRoutes` з `erp/auth-routes` (ADR-0029):

```tsx
const auth = createAuthRoutes({ afterLogin: "/", afterSignUp: "/onboarding", title: t("app.title") })
// auth.routes — лінивими чанками:
// /login          → LoginScreen
// /login/forgot   → ForgotPasswordScreen
// /login/reset    → ResetPasswordScreen (token з листа)
// /login/invite   → AcceptInviteScreen (token з листа)
// /login/link     → EmailLinkScreen (token з листа)
// /signup         → SignUpScreen
// /auth/callback  → SsoCallbackScreen

// Екран входу — заздалегідь, коли браузер вільний (whenIdle з @/lib/lazy): після виходу чи кінця
// сесії він з'явиться без спінера, а першому екрану застосунку прогрів не заважає.
useEffect(() => whenIdle(() => auth.preload()), [auth])   // auth — у useMemo
```

`auth.preload()` без адреси вантажить екран входу, `auth.preload(pathname)` — екран для адреси (напр. гість відкрив посилання з листа `/login/reset?token=…`: чанк цього екрана ще до першого рендеру).

Токен із листа (`?token=…`) екран одразу прибирає з рядка адреси й записів історії вкладки (адреса замінюється) і тримає у вкладці (`sessionStorage`), поки екран відкрито: оновлення сторінки його не губить і в адресу не повертає; перехід з екрана, вхід і вихід його стирають (ADR-0030). Свій екран з токеном — через `useEmailLinkToken("reset" | "invite" | "link")` з `hooks/use-email-link-token` над межею помилок екрана, а не `useSearchParams`.

Перший запит сторінки з токеном JS не прибере. З hash-роутером (`/#/login/reset?token=…`) частина після `#` на сервер і в `Referer` не йде. З роутером на шляхах (`/login/reset?token=…`) — заголовок `Referrer-Policy: no-referrer` на HTML-відповіді й маскування параметра `token` у журналах сервера, проксі й CDN; аналітику й моніторинг — ініціалізувати так, щоб адреса з `token` у них не потрапляла.

- Інші адреси — `createAuthRoutes({ paths: { forgot: "/password/forgot" } })` (`AUTH_ROUTE_PATHS` — усі за замовчуванням). Вхід — завжди `/login`: туди ra-core веде гостя й після виходу. Кожен екран — у своїй межі помилок (чанк, що не завантажився, — «Оновити сторінку» й «Спробувати ще» з h1). Після входу — туди, звідки ra-core перенаправив, або `afterLogin`. Логотип, підвал і своя перевірка «не бот» замість Turnstile — `logo`, `footer`, `renderCaptcha`.
- Моки за замовчуванням вмикають усі способи входу (`DEFAULT_MOCK_METHODS`). Проект, де змонтовано лише `/login`, передає в `createPlatformHandlers` `methods: { passwordless: [], providers: [], passwordReset: false, signUp: false }`, інакше екран входу веде на сторінки, яких немає.
- Охорону сесії (`SessionGuard`: попередження перед кінцем сесії, вихід у всіх вкладках) ставить `SessionGate` сам. Автовихід через бездіяльність — за політикою сервера (`idleTimeoutMinutes` з `GET /auth/methods`; поки її не завантажено, діє лише термін сесії сервера); свій термін — `<SessionGate idleMinutes={30}>`, лише термін сесії сервера — `idleMinutes={null}`.
- Налаштування безпеки (сторінка «Безпека акаунта», ADR-0011):
  - `FactorsSection` — застосунок із QR, SMS, email, ключі доступу, резервні коди;
  - `ChangePasswordForm`, `ChangeEmailForm`, `AccountDataSection` з `erp/account-security`;
  - `SessionsSection`, `TrustedDevicesSection`, `SignInAlertsSwitch`, `SignInHistory` з `erp/account-devices`.
- Профіль (ADR-0012): `ProfilePhoto` і `ProfileForm` з `erp/profile-form` — фото з обрізанням, ім'я, посада, контактний телефон, часовий пояс (`TimezoneSelect`), підпис.
- Токени API для інтеграцій: `ApiTokensSection` з `erp/api-tokens` (права й ресурси дає бекенд, токен показується один раз).
- Адміністратору (права `security:*`, `users:update`):
  - `SecurityPolicyForm` з `erp/security-policy-form` — обов'язковий другий крок, способи входу, пароль, сесія, дозволені адреси;
  - `RecoveryRequestsSection` і `useResetFactors()` з `erp/reset-factors` — запити «втратив доступ до другого кроку» й скидання з причиною.
- Сповіщення: `NotificationSettingsForm` з `erp/notification-settings-form` (події й канали дає бекенд).
- Адміністратору (ADR-0013):
  - `AuditLog` з `erp/audit-log` (право `audit:read`); `<AuditLog filter={{ targetType: "invoices", targetId }} />` — історія запису;
  - історія на картці (ADR-0045): `<RecordHistory target={{ type: "invoices", id, name }} />` з `erp/record-history` — блок з кнопкою «Уся історія», що відкриває шухляду з усіма змінами й виділеними словами. Своя кнопка чи рядок журналу: `const history = useRecordHistorySheet({ actionLabels })`, `history.open(target)`, `{history.sheet}`, у журналі — `<AuditLog onRecordHistory={history.open} />`. Показ змін окремо — `AuditChanges` з `erp/audit-changes`, розрахунок — `diffAuditValues` з `lib/value-diff`. Бекенд пише `target` у кожну зміну запису й віддає `changes[].from` і `to`, різницю кіт рахує сам;
  - `WebhooksSection` з `erp/webhooks-section` (права `webhooks:*`);
  - у списку користувачів — `useUserAccessSheet({ onChange, returnFocus })` і `UserBlockedBadge`, на сторінці — `ActiveSessionsSection` з `erp/user-access`; у панелі доступу — і ролі людини. `returnFocus` — куди піти фокусу, коли людину вилучили й рядка більше немає;
  - «Вилучити з компанії» (ADR-0041): кнопка з'являється сама, коли бекенд віддає `canRemove` у `GET /users/:id/access`. Людина лишається в інших своїх компаніях, обліковий запис і другий крок не змінюються; остання компанія лишає запис без компаній. Своя панель на `useUserAccessActions` передає `onRemoved`, бо картки людини більше немає.
  - «стеля» доступу (ADR-0034, ADR-0040): вийти на всіх пристроях, завершити сесію, заблокувати, розблокувати й скинути другий крок можна лише людині, якою адміністратор керує в кожній її компанії: має там `users:update` і всі її права (ADR-0040 п. 9; адміністратор платформи — за «стелею» ADR-0034; рівного — можна); панель доступу кіта сама показує ці дії неактивними з причиною. Свої кнопки над доступом людини — з `useAccessCeiling(roleIds)` з `erp/user-access-data`: `<UserAccessButtons access={access} onAction={start} {...useAccessCeiling(access.roles)} />` (так само `UserSessionsList`); бекенд відповідає 403 до повторного підтвердження, а права людини рахує в усіх її компаніях;
- Команда й компанія (ADR-0014):
  - `RolesEditor` з `erp/roles-editor` (права `roles:*`) — ролі й матриця прав; каталог ресурсів і дій віддає бекенд; частини — `RoleDetail` (`erp/role-detail`), `RoleMatrix` (`erp/role-matrix`), `RolePicker` і `useRoles` (`erp/role-picker`, старий імпорт з `roles-editor` працює); вибрана роль в адресі — `<RolesEditor selectedId={role.value} onSelect={role.onValueChange} />` з `useSearchParamState("role")` (`hooks/use-tab-param`), так робить сторінка модуля A2; роль щойно змінив інший адміністратор (409) — попередження й свіжі дані, незбережені зміни лишаються (ADR-0033);
  - «стеля» (ADR-0032): дати, змінити, скопіювати чи видалити можна лише свої права — панелі кіта показують ролі й права понад стелю лише для перегляду з причиною, у порядку клавіші Tab (`ceiling={me.permissions}` у `RolePicker`, `RoleMatrix`, `RoleDetail`; ADR-0033), бекенд відповідає 403 і віддає права стиснено (усі дії ресурсу — `<ресурс>:*`);
  - `InvitationsSection` з `erp/invitations-section` (право `users:create`) — запрошення колег; прийняття — `AcceptInviteScreen`, перевірка токена — `POST /auth/invite/check` з `{ token }` у тілі (невідомий токен — 410, не 404), старий `GET /auth/invite?token=` — запасний до 2.0 (`lib/invite-check`); бекенд у момент перевірки й прийняття перевіряє, що автор запрошення досі може дати його ролі (інакше 410 без причини; при прийнятті — у тій самій транзакції, що створює обліковий запис), після повтору автор — той, хто повторив, повтор і відкликання запрошення з роллю понад свої права — 403: секція сама показує такі дії неактивними з причиною (за каталогом ролей, `roles:read`), а на 404 і 409 — тост і свіжий список (ADR-0035). Адреса з обліковим записом приймає запрошення входом: бекенд віддає в перевірці `account` (`new`, `existing`, `current`, `other`), а `POST /auth/invite/accept` { token } приймає лише сесією власника адреси й повертає `companyId`; без поля `account` екран показує форму нового облікового запису, а адаптер зі своїм шляхом прийняття перевизначає `joinInvite`. `taken` і `invited` — лише в компанії запиту, токен — не менше 256 біт, зберігати хеш. Надсилання й повтор просять пароль ще раз останньою перевіркою, усе це вже робить секція (ADR-0040); свої кнопки над списком ролей — з `useRolesCeiling()` з `erp/user-access-data`, а не власна перевірка;
  - `<PermissionGate resource="invoices" action="delete">…</PermissionGate>` з `erp/permission-gate` — показати лише з правом (бекенд однаково перевіряє); з `record={invoice}` — і коли запис дії не забороняє;
  - права на рівні запису (ADR-0037): сервер кладе в запис `deniedActions` — `{ "update": "shared" }` (дія → код причини), що з цим записом не можна тому, хто питає; без поля діють права ролі. Кнопку над записом будуйте з `useRecordAccess({ resource, action, record })` з `hooks/use-record-access`: `canAccess` — показати дію, інакше `<DeniedAction reason={recordReason ?? "Немає права …"}>` (причина запису, а без права ролі — ваш текст); у колонці списку — `useRecordDenialReason()` один раз і функція в комірці. `useCanAccess({ resource, action, record })` ra-core теж поважає позначку. Код `shared` кіт пояснює сам, свій код проекту — загальним текстом. Бекенд обчислює поле на кожну відповідь із записом (список, картка, `POST`, `PATCH`, `current` 409), з тіла запиту його не бере і далі відповідає 403 на заборонену дію; моки кіта ставлять `shared` спільним записам для всіх, крім адміністратора платформи;
  - «Свої / Усі» в ролях (ADR-0038): право `<ресурс>:<дія>:own` — дія лише над своїми записами (де людина відповідальна), `<ресурс>:<дія>` — над усіма. Каталог прав позначає дію з вибором `own: true` — тоді `RoleMatrix` показує поруч з увімкненою дією перемикач «Свої | Усі». `hasPermission`, `useCanAccess` і `PermissionGate` вважають `:own` правом ролі: кнопку показують, а чужий запис закриває позначка `deniedActions` з кодом `own`. Обсяг дії в коді — `permissionScope(permissions, resource, action)` з `lib/roles` (`"all"`, `"own"`, `null`). Бекенд приймає `:own` лише для дій із вибором і перевіряє «стелю» з обсягом: «Свої» дає той, хто має дію хоч на свої, «Усі» дає, знімає й звужує лише той, хто має «Усі»;
  - «свої» записи (ADR-0039): бекенд кладе в запис `responsibleId` і сам вирішує, що людині видно й можна: чужий запис для `read:own` не віддає на жодному шляху читання (картка, `PATCH`, `DELETE` — 404), для `update:own` і `delete:own` мітить `deniedActions: { update: "own", delete: "own" }` і відповідає 403. Кіт правил не обчислює: код `own` пояснює сам, кнопки будуються, як у будь-якій позначці. У модулі B1 «Відповідальний» — поле модуля; проект без нього ховає поле ключем `responsibleId` у `columns`, `filters`, `recordFields` і `form` файлу розширення. Моки свого ресурсу: `createResourceHandlers({ responsibleField: "responsibleId", deniedActions: (actor, record) => … })` — без `responsibleField` «своїх» записів немає й `:own` дає 403; функція `deniedActions` — свій код проекту (закритий період, проведений документ);
  - у топбарі — `<InboxBell onNavigate={navigate} onShowAll={() => navigate("/notifications")} />`, сторінка — `<NotificationInbox onNavigate={navigate} />` з `erp/notification-inbox`;
  - `CompanyProfileForm`, `CompanyImages`, `CompanyBranchesSection` з `erp/company-settings` (змінювати — `company:update`, решта бачить).
- Політику виконує вхід сам: налаштування другого кроку під час входу (`FactorSetupStep`), новий пароль після терміну, 403 `ip_not_allowed`. Для SMS у `FactorSetupStep`/`useFactorSetup` можна передати `phone={{ Input: PhoneInput, validate: validatePhone }}` — на сторінці входу без нього легше пакунок.
- Чутливі дії обгортайте `useReauth().guard(action)` — діалог «Підтвердьте, що це ви» з'явиться сам на 403 `reauth_required`; «Скасувати» в ньому лишає ту саму помилку, а `useAuthErrorText` пише для неї «Дію не виконано: підтвердження скасовано» (`isReauthCancelled`). Бекенд відповідає так останньою перевіркою: кому однаково відмовлять, пароль не просять. Підтвердження потребує дія, що дає комусь права: запрошення, повтор, призначення ролей, зміна складу прав ролі (ADR-0040).
- «Увійти як…»: у списку користувачів — `useImpersonation({ onStarted })`, в оболонці — `<AppShell banner={<ImpersonationBanner onStopped={…} />}>`.
- Бренд (white-label): бекенд віддає `branding` у `GET /auth/methods` за доменом; екрани входу показують його самі. У корені застосунку — `useBrandAppearance(useCompanyProfile(Boolean(me)).data?.palette)` (`hooks/use-company-profile`), щоб палітра компанії чи бренду була типовою й після входу.
- Клієнт API: `createApiClient({ getLanguage: () => getAppearance().language })` — сервер пише листи й місця входу мовою інтерфейсу.
- Після зміни власних ролей чи «Увійти як…» профіль перечитує `useRefreshMe()` з `hooks/use-me`: `invalidateQueries(ME_QUERY_KEY)` для цього не годиться, authProvider кешує профіль.
- Моки: `createPlatformHandlers({ …, securityPolicy, roles, permissionResources, apiResources, auditSeeds, webhookEvents, webhookSeeds, notificationChannels, notificationEvents, inboxSeeds, companyProfiles })`; `subscribeMockEvents` — `users.roles_changed` і `users.joined`, щоб оновити свій список людей; `createResourceHandlers({ …, label, fieldLabels })` — зміни записів ідуть у журнал аудиту й на вебхуки.
- Записи модуля в застосунку з компаніями: передайте компанію (`createContactsMocks({ companyOf })`), бо запис без компанії спільний, його змінює лише адміністратор платформи, а в решти «Змінити» неактивна (ADR-0036). Сегменти засіву лишаються спільними: `companyOf` їх не зачіпає, нові сегменти створюються в компанії.
- Компанія запиту в моках (ADR-0036): ресурси, масові дії, журнал, вебхуки, налаштування компанії й токени API беруть права в компанії запиту, а компанію — за членством: `X-Company-Id` компанії, де людина не працює, — 403, без заголовка — компанія сесії; запис, задача, підписка й токен іншої компанії — 404; `companyId` у тілі `POST` і `PATCH` не діє. Запис без компанії — спільний: компанії його бачать, а змінює лише адміністратор платформи — людина з `isPlatformAdmin: true` у `MockUser` (`*` у ролі компанії дає всі права лише в ній); фікстурам модуля B1 у застосунку з компаніями передайте `companyOf`. Застосунок з компаніями — за початковими людьми моків (`createPlatformHandlers({ users })`): засів, де є люди з компаніями й без, — застосунок з компаніями, і люди поза компаніями в ньому без прав (вхід і профіль працюють). Тести для застосунку без компаній засівають лише людей без компаній. Адміністратор платформи у своїй компанії діє за роллю там; заблокувати його, змінити ролі чи «Увійти як…» у нього адміністратор компанії не може. Журнал компанії — її події, події облікових записів її людей (входи, пароль, другий крок, вихід, блокування) і події застосунку (політика). Засів журналу й вебхуків у застосунку з компаніями позначайте: `auditSeeds: [{ …, companyId: "my-co" }]` чи `{ …, accountId: "u-1" }` для входів, `webhookSeeds: [{ …, companyId: "my-co" }]`; журнал без позначки бачать усі компанії, підписку без позначки (застосунку) — лише платформа. Відмова «стелі» з'являється в журналі невдалою подією (`details.code: "beyond_ceiling"`).
- Політика безпеки — одна на застосунок (ADR-0036): у застосунку з компаніями її змінює лише адміністратор платформи з `security:update` у компанії запиту, `SecurityPolicyForm` для решти — лише перегляд із поясненням (сервер каже `canUpdate` у `GET /security-policy`, без поля — за правом `security:update`). e2e змін політики входять людиною з `isPlatformAdmin: true`.
- Бекенд: `X-Session-Expires-At` у кожній відповіді (і в `Access-Control-Expose-Headers`, якщо API на іншому домені); Turnstile перевіряється на сервері; «Увійти як…» і скидання другого кроку пишуться в аудит із причиною; токени API зберігаються лише хешем; політика (другий крок, пароль, адреси) перевіряється на сервері; журнал аудиту пише сервер і віддає його в межах компанії, відмову «стелі» теж пише; вебхуки — підписки компанії, з підписом HMAC і повторами (ADR-0013, ADR-0036); запис, задача, підписка й токен іншої компанії — 404, компанія запиту — за членством; адміністратор платформи — позначка облікового запису, а не роль компанії: лише він заходить у чужу компанію, змінює спільне (записи й підписки без компанії) і політику (ADR-0036); заблокований не входить жодним способом; що з конкретним записом не можна, сервер каже полем `deniedActions` і однаково відмовляє 403 (ADR-0037); «Свої / Усі»: `:own` у ролях лише для дій каталогу з `own: true`, «стеля» з обсягом (ADR-0038); права перевіряються з ролей на кожному запиті, вбудовані й свої ролі не змінюються, токен запрошення зберігається хешем, реквізити перевіряються як на клієнті (ADR-0014).

## 7. Вигляд

Палітра, тема, щільність і сайдбар задаються атрибутами `<html>` (SPEC §6.2):

```html
<html lang="uk" data-palette="sapphire" class="dark" data-density="compact" data-sidebar="dark">
```

Палітри: `sapphire`, `graphite` (основні), `indigo`, `teal`, `terracotta`. Без класу `dark` — світла тема. Утиліта
`dark:` діє лише на екрані й не всередині `data-theme="light"` (ADR-0082).

Рух (SPEC §6.6, ADR-0009) — лише функціональний і лише з токенів:

- тривалості `duration-fast` (150 мс: кольори, меню, підказки), `duration-base` (200 мс: панелі, розгортання), `duration-slow` (250 мс: шторки); криві `ease-standard`, `ease-enter` (поява), `ease-exit` (зникнення);
- не `transition-all` (анімує й розкладку), а конкретні властивості: `transition-colors`, `transition-opacity`, `transition-[width]`;
- `prefers-reduced-motion` вимикає рух сам, окремо нічого робити не треба.

Швидкість (SPEC §18.5): відгук на дії ≤ 200 мс і перший екран ≤ 2,5 с на телефоні середнього класу. Тримають її ліниві сторінки, одна мова в пам'яті й важкі частини, що вантажаться при відкритті.

## 8. Оновлення

Одна команда кіта в проекті (ADR-0029; ставиться з `base`, файл — `scripts/erp-ui-kit.mjs`):

```sh
node scripts/erp-ui-kit.mjs update vX.Y.Z --dry-run   # що зміниться, нічого не записує
node scripts/erp-ui-kit.mjs update vX.Y.Z             # оновити всі встановлені елементи кіта
node scripts/erp-ui-kit.mjs update vX.Y.Z --add erp/command-palette   # і поставити новий
node scripts/erp-ui-kit.mjs update vX.Y.Z --prune     # і видалити незмінені файли-сироти
node scripts/erp-ui-kit.mjs check                     # файли кіта не правлені (у pnpm lint і CI)
node scripts/erp-ui-check-tokens.mjs                  # лише токени тем у src над стилями з components.json (у pnpm lint і CI)
```

- Що робить `update`: вимагає чисте git усього репозиторію (оновлення видно окремо в `git diff`, повернути — `git restore .` з кореня репозиторію) і незмінені файли кіта → бере SHA коміту тегу (`gh api repos/VasulenkoIllia/erp-ui/commits/refs/tags/vX.Y.Z`) і архів саме цього коміту (`…/tarball/<SHA>`, ~1,5 МБ; тайм-аут 120 с, повтори через 5 і 30 с після збою мережі, 5xx чи 429; на 401, 404 і вичерпаному ліміті — зупинка з поясненням) → перелік архіву до розпакування: символьне чи жорстке посилання — зупинка → перевіряє, що це кіт і та версія, рахує відбиток реєстру → `shadcn build` закріпленою CLI проекту → звіт `add --dry-run` (зміниться, нові, без змін; які залежності додасться) → зупинка, якщо тег той самий, а вміст інший, чи файл, що перезапишеться, має позначку локальної правки; попередження, якщо перезапишеться файл, якого немає в `kit-files.json` (ваш файл на шляху нового файла кіта: перенесіть його під іншу назву; файл, що його git ігнорує, — з приміткою, бо `git restore` його не поверне; скіл і `docs/erp-ui/` — без попередження) → `add --overwrite --yes` (лише файли) → залежності, яких у проекті немає → нові відбитки в `kit-files.json` → наприкінці — розділи «Що зробити в проекті» з `CHANGELOG.md` кіта між версією проекту й новою (і в `--dry-run`): їх проект робить руками; розділи без цього пункту названо окремим рядком — зміни поведінки шукайте в них. Напряму з GitHub CLI робить на модуль тисячі запитів з тайм-аутом 15 с і без повтору, тож команда так не робить (крок 1.7b).
- `kit-files.json` — `kit` (версія), `sha` (коміт версії), `fingerprint` (відбиток реєстру: `registry.json` і всі його файли), `items` (встановлені елементи: наступне оновлення бере їх звідси), `files` (відбитки файлів кіта), `own` (див. нижче), `orphans` (сироти, див. нижче), `checksum` (контрольна сума решти полів; ADR-0078). Комітьте його разом з оновленням і руками не правте: `check` зупиниться. Сума ловить випадкову правку (зник елемент, конфлікт злиття), а не підробку: перерахувати її може будь-хто. Прибрали елемент зі списку `items` навмисно — запустіть `update`, він запише нову суму. Маніфест попередньої версії команди (без `sha` і `checksum`) `check` приймає з нагадуванням; нові поля запише наступний `update`, зокрема до тієї самої версії.
- Той самий тег з іншим SHA: якщо вміст інший (тег пересунули), `update` зупиняється до запису «та сама версія, інший вміст» — не оновлюйтесь до нього й спитайте автора кіта; SHA кожного випуску — рядок «Коміт тегу» під заголовком версії в `CHANGELOG.md` на `main` у GitHub (не копія в архіві чи проекті). Якщо вміст той самий (історію переписали), — лише попередження й новий SHA. Якщо SHA минулого встановлення не записано (його ставила попередня версія команди), звірити нема з чим: команда попереджає й друкує SHA, який записує, — порівняйте його з `CHANGELOG.md`. Теги `v*` не пересувають і не видаляють (правило тегів GitHub): помилку випуску виправляє нова патч-версія.
- Файли, які проект доповнює сам (`src/index.css`, `docs/erp-ui/CLAUDE.project.md`), команда не перевіряє: якщо проект їх змінював, лишає версію проекту й показує різницю з новою версією кіта — перенесіть потрібне вручну. Файли, які git ігнорує (напр. `.claude/` у `.git/info/exclude`), у відбитки не входять.
- Файлів, яких у новій версії немає (сироти), команда без `--prune` не видаляє: називає їх у звіті й наприкінці (`? шлях`), пам'ятає в `orphans`, і `check` про них попереджає. Приберіть імпорти з них, потім `update vX.Y.Z --prune` видалить ті, яких проект не змінював (`--dry-run --prune` — що видалиться): лише звичайні файли проекту, які відстежує git. Змінені лишаються сиротами: перенесіть потрібне у свій файл і видаліть сам. Змінену сироту, яку нова версія кіта повертає, `update` не перезаписує, а зупиняється. `--prune`, SHA й контрольна сума — з команди v1.4.0.
- Залежності (з v1.0.1, крок fix-kit-deps): залежності, які вже є в `package.json` проекту, команда не змінює — ні діапазон, ні встановлену версію в lock-файлі. Ставить лише ті, яких у проекті немає (новий елемент чи нова залежність елемента), з діапазоном кіта, менеджером пакетів проекту (за lock-файлом). Якщо встановлена версія не в діапазоні кіта (напр. кіт перейшов на нову мажорну бібліотеки), звіт називає її (`! назва: кіт чекає …`) і лишає версію проекту: оновіть її самі, якщо збірка чи тести впадуть, — що змінилось, каже `CHANGELOG.md` кіта. Причина: CLI shadcn 4.22.0 під час `add` ставить кожну залежність елемента з версією заново (`pnpm add назва@діапазон`), навіть наявну, і переписує діапазон проекту (у кроці 1.9 — `~4.14.0` → `^4.14.0`), а версію поза діапазоном кіта підняв би, зокрема до нової мажорної. Тому команда забирає залежності з елементів перед `add` і ставить їх сама. Менеджер пакетів — з поля `packageManager` у `package.json`, інакше за найближчим lock-файлом (у проекті чи вище — корінь воркспейсу, але не вище кореня git-репозиторію); не вдалося визначити, а ставити треба, — зупинка до запису файлів (npm команда не вгадує). Зупиняється команда й тоді, коли звіт `--dry-run` обіцяє залежності, коли `add` усе ж змінив `package.json` чи lock-файл (інша версія CLI) і коли після встановлення наявний діапазон змінився чи нова залежність не встановилась. Попередження про версії поза діапазоном кіта команда повторює наприкінці.
- З v1.0.0 на v1.0.1 — командою v1.0.1: три її файли з тегу в тимчасову теку й запуск звідти, як нижче для першого запуску, але `update v1.0.1` без `--items` (список уже в `kit-files.json`). Команда v1.0.0 ще віддає залежності CLI shadcn і переписала б діапазони. Далі — `node scripts/erp-ui-kit.mjs update vX.Y.Z`, як звичайно.
- Після оновлення — `pnpm typecheck`, `pnpm lint`, тести, збірка й e2e; що змінилось — `CHANGELOG.md` кіта. Мажорна версія — лише при несумісній зміні токенів чи публічного API (`CHANGELOG.md`). У мінорній і патч-версії файли розширення й адаптера змінювати не треба, крім названого в `CHANGELOG.md` (як у v0.3.0: стара анотація типу статусів і точні назви кнопок у тестах).
- Перший раз у проекті без команди (кіт до v1.0.0): завантажте її з тегу в тимчасову теку й запустіть звідти — вона сама стане у `scripts/` разом із `base`. Список `--items` — елементи, які стоять у проекті (README проекту):

  ```sh
  git status --short   # чисте дерево
  T="$(mktemp -d)"
  for f in $(gh api "repos/VasulenkoIllia/erp-ui/contents/registry/tools?ref=v1.5.0" \
      --jq '.[].name | select(startswith("erp-ui-kit"))'); do
    gh api "repos/VasulenkoIllia/erp-ui/contents/registry/tools/$f?ref=v1.5.0" \
      -H "Accept: application/vnd.github.raw" > "$T/$f"
  done
  node "$T/erp-ui-kit.mjs" update v1.5.0 --items base,data,mocks,auth,modules/B1-contacts
  rm -rf "$T"
  ```

  Цикл бере всі файли команди тегу: до v1.0.1 їх два, у v1.0.1–v1.3.0 — три, з v1.4.0 — п'ять (ще `erp-ui-kit-manifest` і `erp-ui-kit-changelog`).

  З v1.3.0 на v1.4.0 — так само командою v1.4.0 з тимчасової теки, але `update v1.4.0` без `--items`: тоді маніфест одразу отримає SHA, відбиток, контрольну суму й сироти. Стара команда теж оновить, але сироти назве лише посеред звіту й не запам'ятає, а SHA й суму запише наступний `update`.

  З v1.4.0 на v1.5.0 — звичайною командою проекту, `node scripts/erp-ui-kit.mjs update v1.5.0`: у команді v1.4.0 уже є все потрібне, а що зробити руками, вона надрукує наприкінці з розділу [1.5.0] `CHANGELOG.md`.

  Відбитки проекту в старому форматі (`{ kit, files }`, як у тестовому проекті) команда читає: перевіряє за ними, що файли кіта не правлені, і перезаписує в новому.
- Файли кіта в проекті не правляться — ні модулів, ні спільних шарів (`ui`, `erp`, `templates`, `lib`, `hooks`; ADR-0076). Бракує можливості компонента — PR у кіт; чекати не можна — свій компонент під іншою назвою в коді проекту. Файл кіта, який усе ж змінили, `check` і перевірка перед оновленням покажуть як змінений: перенесіть правку (у розширення, у кіт чи у свій компонент) і поверніть файл (`git checkout -- <файл>` чи попередня версія кіта). Позначки `// erp-ui: local override` більше немає: файл із нею `update` не перезаписує, а зупиняється зі списком.
- Модуль оновлюється тією самою командою: його файли в проекті не правляться, тож зміни в них — лише кіта, а відмінності клієнта лишаються у файлі розширення (§5, ADR-0020). Несумісна зміна типу розширення — мажорна версія, що змінити — у розділі версії «Що зробити в проекті» в `CHANGELOG.md`: після `update` `pnpm typecheck`, як правило, падає у файлах розширення (`src/extensions/`) — так і має бути, файли модуля не правте (зміну поведінки без помилки TypeScript розділ теж називає). Поправте лише файли розширення, далі — `pnpm typecheck`, пошук старої назви в `src/` (обов'язковий: об'єкт без типу, де поруч є інші ключі розширення, TypeScript пропускає мовчки), тести, збірка й e2e. Зручно двома комітами: «кіт X.0.0» (як встановлено) і «розширення за розділом». Розширення оголошуйте з типом (`const organizations: OrganizationsExtension = {…}` чи `satisfies`), тоді TypeScript покаже кожне місце.
- Гілка чи коміт кіта до випуску (перевірити зміну на своєму проекті, як у 1.7c): `update <гілка чи SHA> --from <тека копії кіта>` — команда бере з копії лише реєстр і файли, на які він посилається (`git archive`, ~4 МБ). Такий стан проекту в `main` не мерджиться.
- Версія CLI shadcn — та сама для встановлення й оновлення: закріпіть її в `devDependencies` проекту без `^` — ту, з якою перевірено тег кіта (`shadcn` у `pnpm-lock.yaml` тегу; для v1.3.0–v1.5.0 — `"shadcn": "4.21.4"`, працює й 4.22). `shadcn init` ставить найновішу CLI (у `dependencies` з `^`, а закріплену раніше версію переписує), тож закріплюйте після `init`, як у розділі 1 (`pnpm remove shadcn && pnpm add -D -E shadcn@<версія>`). Команда бере CLI проекту (`node_modules/.bin/shadcn`); закріплення `add` не знімає: з v1.0.0 `base` і `tokens` не несуть залежності `shadcn`, а з v1.0.1 залежності елементів ставить команда, лише відсутні. Нову версію CLI беріть окремим кроком: оновили CLI → `update` тієї ж версії кіта → `git diff` показує лише перетворення CLI. Звіт `--dry-run` команда читає з формату CLI 4.22: інший формат — помилка з повним звітом, а не порожній список.
- Вразливості CLI shadcn (перевірка 15.11.2026, `pnpm audit` чистого встановлення). Пакет `shadcn` — це CLI і стилі `shadcn/tailwind.css`, які `src/index.css` кіта імпортує під час збірки; JavaScript пакета в збірку застосунку не йде. Через залежності CLI 4.21.4 `pnpm audit` показує три вразливості: `zod` 3.x (висока: перевірка завеликого набору даних з'їдає пам'ять, GHSA-mrhx-c7xc-m3w5), `minimatch` 10 через `ts-morph` (середня: шаблон шляху з дуже великою кількістю частин вичерпує ресурси, GHSA-g3hv-75wg-m249), `deepmerge` 4.3.1 (низька: підміна прототипу в результаті об'єднання, виправлення немає, GHSA-gcqx-w48m-w2h4); у CLI 4.23.0 лишаються дві останні. Діють вони лише на машині розробника й у CI під час `shadcn add` і `update` і лише на чужих даних: команда кіта дає CLI тільки архів кіта за SHA коміту тегу. Залежності застосунку з діапазонами кіта (`pnpm audit --prod`, CLI у `devDependencies`) вразливостей не мали. Що робити: CLI — у `devDependencies` з точною версією (вище); залежності застосунку перевіряйте `pnpm audit --prod`; CLI не запускайте на реєстрах і шаблонах з невідомих джерел; нову версію CLI беріть, коли кіт назве її в `CHANGELOG.md`, окремим кроком, як вище.
- Директива `"use client"`: з v0.3.1 у файлах кіта її немає (крок fix-use-client). При оновленні з v0.3.0 чи старішої вона один раз зникає з файлів кіта, де ще стоїть (`git diff --numstat` такого файлу — 0 доданих і 2 прибрані рядки).
- Без команди (напр. один файл для перегляду): `pnpm exec shadcn add <реєстр із тегу>/<елемент>.json --diff <шлях>` — різниця одного файлу (`--diff` без шляху показує лише перші п'ять файлів, навіть незмінних).

## 9. Чого не робити

- Не копіювати компоненти руками з репозиторію — лише командою кіта (`node scripts/erp-ui-kit.mjs update <версія> --add <елемент>`): так працюють оновлення й перевірка `check`.
- Не правити файли модуля під клієнта — лише файл розширення проекту (ADR-0020).
- Не створювати обробники моків поза `src/mocks/` і не вмикати MSW повз умову `import.meta.env.VITE_BACKEND === "mocks"`; не збирати для сервера без `VITE_BACKEND` (розділ 5, ADR-0079).
- Не писати кольори, розміри й шрифти повз токени. Потрібен новий токен — він додається в erp-ui.
- Не писати тексти інтерфейсу в коді й не форматувати числа чи дати вручну — лише i18n і `lib/format`.
- Не ставити поверх стилів erp-ui інші shadcn-стилі чи компоненти з інших реєстрів напряму. Вони спершу перебудовуються в реєстрі (ADR-0006).
