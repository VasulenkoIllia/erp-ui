# A6 «Довідники»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0037, ADR-0047): списки значень, які компанія обирає в документах, і типові значення для нових документів.

- **Податки** — назва, ставка у відсотках, чи податок уже в ціні, зовнішні коди.
- **Одиниці виміру** — назва, скорочення для документів, скільки знаків після коми дозволено в кількості, зовнішні коди.
- **Умови оплати** — назва й частини оплати: відсоток, днів, від якої дати рахувати. Сума частин дорівнює 100%, вона видна під рядками під час вводу. Порядок частин міняють кнопки.
- **Теги** — назва й колір із токенів теми.
- **Причини** — назва, де застосовується (скасування, відмова, повернення, інше й види проекту), чи потрібен коментар.
- **Типові значення** — податок, одиниця й умови оплати, які підставляються в нові документи. Форма на сторінці з липкою панеллю збереження.

Кожен довідник — окрема сторінка на шаблоні List Report: пошук, фільтр стану, форма в діалозі. **Значення не видаляються**: «Вимкнути» в рядку прибирає його з нових виборів, старі документи його зберігають. Після вимкнення в тості є «Скасувати». Вимкнене значення перестає бути типовим, і «Скасувати» цього не повертає: типове значення треба вибрати знову. Тому значення, що стоїть типовим, має в рядку позначку «Типове», а його вимкнення спершу питає й пояснює наслідок. Без `dictionary-defaults:read` позначки немає, а вимкнення йде без питання.

Самого вибору значення в документах модуль не дає: документів у ньому немає. Модуль рахунків бере `GET /taxes?active=true` через `erp/record-picker`.

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/A6-dictionaries
```

Файли модуля стають у `src/modules/A6-dictionaries/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components`, `src/lib`, `src/hooks`). Файли модуля в проекті не правимо: зміни під клієнта — у файлі розширення.

## Підключення

```ts
// src/modules.ts
import { createDictionariesModule } from "@/modules/A6-dictionaries"
import { dictionariesExtension } from "@/extensions/A6-dictionaries"

export const dictionariesModule = createDictionariesModule({ basePath: "/settings", extension: dictionariesExtension })
```

- Маршрути — `dictionariesModule.routes` (React Router) під `Suspense` і межею помилок застосунку; сторінки — лінивими чанками. Адреса `basePath` веде на першу сторінку.
- Навігація — `dictionariesModule.nav`: окремий пункт на кожен довідник і «Типові значення», кожен із правом, яке йому потрібне (`access`). Адреси — `dictionariesModule.paths`.
- Права й ресурси — `dictionariesModule.resources`: `taxes`, `units`, `payment-terms`, `tags`, `reasons` (`read`, `create`, `update`), `dictionary-defaults` (`read`, `update`). Кому які — вирішує проект у своїх ролях. Форма типових значень бере перелік значень, тож тому, хто її змінює, потрібне ще `read` на довідники.
- `dictionariesModule.preload(pathname)` — наперед завантажити чанк сторінки.
- Рядки модуля — свій простір імен `A6-dictionaries`: українські приходять зі сторінками модуля, англійські — окремим чанком за потреби.

## Розширення під клієнта

Файл проекту `src/extensions/A6-dictionaries.ts` (тип `DictionariesExtension`):

- `taxes`, `units`, `paymentTerms`, `tags`, `reasons`: `page: false` — без сторінки й пункту навігації, а поле довідника зникає з типових значень; `fields` (нові поля: схема, підписи, значення для моків), `columns`, `filters`, `form` (куди стають поля у формі, що приховати чи перейменувати).
- `reasons.kinds` — види причин проекту: `add`, `change`, `hide`. Схований вид лишається підписаним у старих значеннях.
- `defaults`: `page: false` — без сторінки «Типові значення». Її немає й тоді, коли податки, одиниці й умови оплати приховані всі: вибирати нічого.
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

## Контракт API

`contract.ts` — схеми zod і опис (ADR-0002, ADR-0047). Компанія запиту — `X-Company-Id`, без нього — активна компанія сесії.

Спільне для `/taxes`, `/units`, `/payment-terms`, `/tags`, `/reasons`:

- `GET` (фільтр `active`, пошук `q`, сортування `name`), `GET /:id`, `POST`, `PATCH /:id` з `version`. Зміна зі старою `version` — 409. `DELETE` немає.
- `name` до 80 символів, не повторюється в довіднику компанії без урахування регістру: 422 `name: duplicate`. У причин — у межах виду.
- `active: false` — значення вимкнено. Значення, зміну якого забороняє сервер, — `deniedActions: { update: "<код>" }` (ADR-0037): кнопка неактивна, причину видно.

Поля значень:

- `taxes`: `rate` (0–100, не більше двох знаків), `included`, `externalCodes`.
- `units`: `shortName` (до 12 символів, не повторюється), `decimals` (0–3), `externalCodes`.
- `payment-terms`: `parts`, `externalCodes`. Частина — `percent` (більше 0, до 100, не більше двох знаків), `days` (0–365), `base` (`invoice`, `delivery`). Частин від 1 до 12, порядок зберігається, сума дорівнює 100, інакше 422 `parts`.
- `tags`: `tone` (`neutral`, `info`, `success`, `warning`, `destructive`).
- `reasons`: `kind` (`cancel`, `reject`, `return`, `other` чи вид проекту), `commentRequired`. Фільтр `kind`.
- `externalCodes` — об'єкт `{ "Система": "код" }`, `PATCH` замінює його цілком. До 20 пар, назва до 60 символів, код до 200, обидва непорожні: ті самі межі, що й у формі.

Типові значення:

- `GET /dictionary-defaults/current`, `PATCH /dictionary-defaults/current` з `version`: `taxId`, `unitId`, `paymentTermId` (`null` — не вибрано). Запис є завжди, адреса стала: компанію визначає запит. Вимкнене, чуже чи неіснуюче значення сервер відхиляє: 422 у відповідному полі. Моки цього не перевіряють: форма дає вибрати лише активне.
- Вимкнення значення прибирає його з типових: це робить сервер у тій самій транзакції й збільшує `version` налаштування. Вимкнене значення ніколи не лишається типовим. Увімкнення назад типового не повертає.

## Моки

```ts
import { createDictionariesMocks } from "@/modules/A6-dictionaries/mocks"
import { dictionariesMockExtension } from "@/extensions/A6-dictionaries-fields"

const dictionaries = createDictionariesMocks({ extension: dictionariesMockExtension, companies: ["company-1"] })
setupWorker(...createPlatformHandlers({}), ...dictionaries.handlers)
```

Сценарії (`success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline`) — для кожного ресурсу окремо, у панелі розробника чи `lib/mock-scenarios`. Сторінка типових значень читає один запис, а `empty` порожнить лише списки: для `dictionary-defaults` цей сценарій нічого не змінює, порожнього стану в сторінки немає. Моки відповідають і на `DELETE` та `POST` типових значень, бо їх дає спільний `createResourceHandlers`; контракт цих адрес не має.
