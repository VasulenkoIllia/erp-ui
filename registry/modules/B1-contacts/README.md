# B1 «Контакти й компанії»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0026, ADR-0027): організації (юрособи й ФОП) з реквізитами, адресами й банківськими рахунками, контакти — представники організацій і приватні особи, сегменти. Списки — шаблон List Report, картки — Object Page.

- **Організації** — список з вкладками за статусом, фільтрами «Тип» і «Сегменти», пошуком за назвою чи кодом, закріпленням угорі й запам'ятаним розміром сторінки; картка з вкладками «Реквізити» (з «Копіювати»), «Адреси», «Рахунки», «Контактні особи» й історією з журналу аудиту. Створення — «Створити організацію» в шапці списку, зміна — «Змінити» в шапці картки: форма в діалозі (назва, тип, ЄДРПОУ чи РНОКПП з контрольною цифрою за типом, статус, телефон, email, місто, сегменти) з полями розширення.
- **Контакти** — список з вкладками «Усі», «Представники організацій», «Приватні особи», фільтром «Сегменти», пошуком за ім'ям, телефоном чи email; картка з подробицями й вибором організації (`erp/record-picker`) з пошуком на сервері. Форма створення й зміни (ім'я, організація, посада, телефон, email, сегменти) з полями розширення; організацію, якої ще немає, створюють просто з вибору («Створити…» відкриває форму організації поверх форми контакту).
- **Сегменти** — довідник з пошуком і сортуванням за назвою; «Створити сегмент» і назва в рядку відкривають форму в діалозі (назва обов'язкова, до 60 символів, не повторюється). У формах організації й контакту сегменти вибирають мультивибором (`erp/multi-select`) з того самого довідника, що й фільтр «Сегменти».

## Встановлення

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/modules/B1-contacts
```

Файли модуля стають у `src/modules/B1-contacts/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components/…`, `src/lib/…`, `src/hooks/…`). Файли модуля в проекті не правляться: так оновлення модуля не конфліктує з правками під клієнта.

## Підключення

```ts
// src/modules.ts
import { createContactsModule } from "@/modules/B1-contacts"
import { contactsExtension } from "@/extensions/B1-contacts"

export const contactsModule = createContactsModule({ basePath: "/crm", extension: contactsExtension })
```

- Маршрути — `contactsModule.routes` (React Router: `useRoutes(contactsModule.routes)` чи `<Route>` з них) під `Suspense` і межею помилок застосунку; сторінки — лінивими чанками. `basePath: "/crm"` дає `/crm/contacts`, `/crm/contacts/:id`, `/crm/organizations`, `/crm/organizations/:id`, `/crm/segments`, а `/crm` веде на список контактів. Форми створення й зміни — теж окремими чанками: вантажаться, коли браузер вільний, а поки чанк вантажиться чи не завантажився, діалог показує назву форми, спінер чи «Спробувати ще».
- Навігація — `contactsModule.nav` (`id`, підпис `{ uk, en }`, адреса, іконка); підпис мовою інтерфейсу — `localizedText(item.label, language)`.
- Заздалегідь завантажити сторінку за адресою — `contactsModule.preload(pathname)` (наведення чи фокус на посиланні).
- Права й ресурси — `contactsModule.resources`: `contacts`, `organizations`, `segments` з діями `read`, `create`, `update`, `delete` (`<ресурс>:<дія>`, ADR-0014). Змінити організацію контакту — `contacts:update`; без права поле лише для читання. «Створити» й «Змінити» — `<ресурс>:create` і `<ресурс>:update`; без права кнопка неактивна з причиною.
- Рядки модуля — свій простір імен `B1-contacts`: українські приходять зі сторінками модуля, англійські — окремим чанком за потреби. Застосунку нічого реєструвати не треба.

## Розширення під клієнта

Усе, чим клієнт відрізняється, — у файлі проекту `src/extensions/B1-contacts.ts` (тип `ContactsExtension`):

- `organizations` і `contacts`: `fields` (нові поля: схема, підписи, значення для моків), `columns` (`change` — назва, ширина, пріоритет колонки модуля без заміни), `form` (поле розширення у формі — `add` з місцем, підказкою `description` і `wide`; обов'язкове поле мусить бути у формі; `change` — підпис чи підказка поля модуля), `filters`, `tabs` (вкладки списку з фільтром даними), `recordFields` (поля шапки картки), `sections` (вкладки й секції картки — компоненти проекту), `actions` (дії шапки з правом `access`);
- `organizations.statuses` — статуси організації: додати (`mockEvery` — кожен N-й запис фікстур), перейменувати (ключ модуля в `add`), сховати з вибору; новий статус стає й вкладкою списку;
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Ключі модуля для `hide`, `move`, `change` і `place` — типи `OrganizationColumnId`, `ContactColumnId`, `OrganizationFormFieldId`, `ContactFormFieldId`, `OrganizationSectionId` тощо (`extension.ts`): модуль перейменує ключ — TypeScript покаже місце у файлі розширення. Назву в списку (посилання на картку), назву й тип організації та ім'я контакту у формі розширення не ховає. Повний приклад — `apps/demo/src/extensions/B1-contacts.ts` у репозиторії erp-ui.

## Контракт API

`contract.ts` — схеми zod і опис ресурсів (ADR-0002):

- `GET /organizations` — список без вкладених колекцій; `GET /organizations/:id` — з `addresses` і `bankAccounts` (ADR-0019); `iban` — основний рахунок.
- `GET /contacts`; контакти організації — `?organizationId=<id>`, приватні — `?organizationId=null`, представники — `?organizationId_ne=null`.
- `GET /segments` — довідник (перші 100 за назвою); фільтр за сегментами — «хоч один із» (`segments=seg-key&segments=seg-new`). `POST /segments`, `PATCH /segments/:id` — назва; таку саму назву в компанії (без урахування регістру й пробілів по краях) сервер не приймає: 422 `fieldErrors: { name: "duplicate" }`.
- Закріплення — `PUT`/`DELETE /<ресурс>/:id/pin`, розмір сторінки — `/me/list-settings/<ресурс>` (ADR-0024).
- Створення — `POST /organizations`, `POST /contacts` з полями форми (разом із полями розширення); відповідь — створений запис з `id` і `version`.
- Зміна — `PATCH` лише змінених полів і `version`; конфлікт — 409 з `current` (форма показує порівняння змінених полів), помилки полів — 422 `fieldErrors` з кодами `required`, `duplicate`, `tooLong`, `invalid`.
- `iban` організації веде сервер (основний рахунок із `bankAccounts`): форма його не надсилає.
- Поля й статуси розширення входять у схему через `organizationSchemaFor(extension)` і `contactSchemaFor(extension)`.

## Моки

```ts
import { createContactsMocks } from "@/modules/B1-contacts/mocks"
import { contactsMockExtension } from "@/extensions/B1-contacts-fields"

const contacts = createContactsMocks({ extension: contactsMockExtension, locale: "uk" })
setupWorker(...platformHandlers, ...contacts.handlers)
```

- Фікстури (`fixtures.ts`) — українською чи англійською (`locale`), коди ЄДРПОУ й РНОКПП і IBAN з дійсними контрольними цифрами; `companyOf` — компанія користувача для запису.
- Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — для кожного ресурсу окремо (`setScenario(scenario, "contacts")`, панель розробника `DevPanel`).
- Моки беруть лише дані розширення без компонентів (`ContactsMockExtension`): файл полів проекту окремо від компонентів слотів.

## Оновлення

```sh
npx shadcn@latest add VasulenkoIllia/erp-ui/modules/B1-contacts#vX.Y.Z --diff
```

`--diff` показує лише зміни кіта: файли модуля в проекті не правились. Несумісна зміна типу розширення — мажорна версія кіта, що змінити — у розділі «Як оновити розширення» в `CHANGELOG.md`.
