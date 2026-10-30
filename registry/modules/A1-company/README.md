# A1 «Компанія й валюти»

Модуль erp-ui (SPEC §14, §17; ADR-0014, ADR-0020, ADR-0025, ADR-0037, ADR-0043): картка поточної компанії, її валюти й курси.

- **Компанія** — картка на шаблоні Object Page: шапка (назва, тип, код, ПДВ, базова валюта, кількість філій), вкладки «Реквізити», «Логотип і печатка», «Філії», «Локалізація» й вкладки розширення; «Історія» з журналу аудиту (з `audit:read`) праворуч на широкому, останньою вкладкою на вузькому. Реквізити, зображення й філії — спільні частини кіта `erp/company-settings`, ті самі, що в налаштуваннях.
- **Локалізація** — базова валюта, мова документів, часовий пояс, місяць початку фінансового року. Без права змінювати — текстом.
- **Валюти** — список на List Report: код і назва, стан, найновіший курс і його дата. «Додати валюту» у діалозі, «Вимкнути» й «Увімкнути» у рядку; валюти не видаляються, бо на них спираються документи. Код веде на курси цієї валюти.
- **Курси валют** — таблиця: дата, валюта, курс до базової, джерело, фільтри за валютою, датою й джерелом, новіші згори. Форма в діалозі. Курс із зовнішнього джерела лише для перегляду, причину видно на кнопці.

Завантаження курсів із НБУ в модулі немає: джерело `nbu` заповнює бекенд, модуль лише показує його й не дає змінити такий курс (ADR-0043).

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/A1-company
```

Файли модуля стають у `src/modules/A1-company/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components`, `src/lib`, `src/hooks`). Файли модуля в проекті не правимо: зміни під клієнта — у файлі розширення.

## Підключення

```ts
// src/modules.ts
import { createCompanyModule } from "@/modules/A1-company"
import { companyExtension } from "@/extensions/A1-company"

export const companyModule = createCompanyModule({ basePath: "/settings", extension: companyExtension })
```

- Маршрути — `companyModule.routes` (React Router) під `Suspense` і межею помилок застосунку; сторінки — лінивими чанками. Адреса `basePath` веде на картку компанії.
- Навігація — `companyModule.nav`: «Компанія», «Валюти» й «Курси валют»; останні два — з правом, яке їм потрібне (`access`).
- Права й ресурси — `companyModule.resources`: `company` (читає кожен у компанії, `update` — реквізити й локалізація), `currencies` (`read`, `create`, `update`), `exchange-rates` (`read`, `create`, `update`, `delete`). Кому які — вирішує проект у своїх ролях. Форма й фільтр курсів беруть перелік валют, тож тому, хто додає курси, потрібне ще `currencies:read`.
- `companyModule.preload(pathname)` — наперед завантажити чанк сторінки.
- Рядки модуля — свій простір імен `A1-company`: українські приходять зі сторінками модуля, англійські — окремим чанком за потреби.

## Розширення під клієнта

Файл проекту `src/extensions/A1-company.ts` (тип `CompanyExtension`):

- `company`: `sections` (нові вкладки картки чи зміна наявних), `actions` (дії в шапці), `history: false` — без «Історії», якщо бекенд не веде журналу.
- `currencies`: `page: false` — без сторінок «Валюти» й «Курси валют» і їхніх пунктів навігації (одна валюта чи курси в іншій системі), `columns`.
- `rates`: `fields` (нові поля курсу: схема, підписи, значення для моків), `columns`, `filters`, `form` (куди стають поля у формі курсу, що приховати чи перейменувати).
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Поля розширення валюти немає: картки валюти немає, змінити таке поле було б ніде.

## Контракт API

`contract.ts` — схеми zod і опис (ADR-0002, ADR-0043):

- Компанія запиту — `X-Company-Id`, без нього — активна компанія сесії.
- Компанія — той самий `GET /company` і `PATCH /company`, що в `lib/auth`; `CompanyProfile` має необов'язкові `baseCurrency` (ISO 4217, за замовчуванням `UAH`), `language` (`uk`, `en`), `timezone` (IANA), `fiscalYearStartMonth` (1–12, за замовчуванням 1). Значення може бути й `null`. Неправильне — 422 з помилкою біля поля. Зміна базової валюти наявних курсів не перераховує: це робить бекенд, якщо потрібно.
- `GET /currencies`, `POST /currencies` (`code`), `PATCH /currencies/:id` (`active`, `version`): `id`, `version`, `code`, `active`, `latestRate`, `latestRateDate` (найновіший курс веде бекенд). Той самий код — 422 `code: duplicate`. Зміна зі старою `version` — 409. Видалення немає.
- `GET /exchange-rates` (фільтри `currency`, `date` як діапазон, `source`; сортування `date`, `currency`, `rate`), `POST`, `PATCH /:id`, `DELETE /:id`: `id`, `version`, `currency`, `date` (`YYYY-MM-DD`), `rate` (скільки базової валюти за 1 одиницю, більше за нуль, до шести знаків), `source`. Один курс на валюту й дату: 422 `date: duplicate`. `source` ставить сервер, форма його не надсилає.
- Курс не з `manual` — `deniedActions: { update: "source", delete: "source" }` і 403 на такі запити (ADR-0037). Інший код джерела модуль показує як є.
- Історія картки — журнал аудиту `targetType=company`, `targetId=<id>` у межах компанії запиту.

## Моки

```ts
import { createCompanyMocks } from "@/modules/A1-company/mocks"
import { companyMockExtension } from "@/extensions/A1-company-fields"

const company = createCompanyMocks({ extension: companyMockExtension, companies: ["company-1"] })
setupWorker(...createPlatformHandlers({ companyProfiles }), ...company.handlers)
```

Компанію дають моки платформи (`companyProfiles`), модуль їх не дублює. Сценарії (`success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline`) — для `currencies` і `exchange-rates` окремо, у панелі розробника чи `lib/mock-scenarios`. Те саме для `company`, крім `empty`: компанія є завжди.
