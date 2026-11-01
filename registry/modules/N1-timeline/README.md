# N1 «Стрічка запису»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0053, ADR-0054): стрічка на картках запису й сторінка «Мої справи».

- **Стрічка на картці** — нотатки й повідомлення, зміни полів, файли, підписники, заплановані дії. Частина кіта `erp/record-timeline`, контракт — `lib/timeline`. На картку її ставить сам проект.
- **Мої справи** — сторінка `paths.myActivities`: заплановані дії людини через усі записи, найближчий термін першим. Вкладки «Усі», «Прострочені», «Сьогодні», «Наступні» живуть в адресі. У рядку видно запис, термін і слово «Прострочено», дію можна виконати, змінити чи скасувати.

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/N1-timeline
```

Файли модуля стають у `src/modules/N1-timeline/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components`, `src/lib`, `src/hooks`). Файли модуля в проекті не правимо: зміни під клієнта — у файлі розширення.

## Підключення

```ts
// src/modules.ts
import { createTimelineModule } from "@/modules/N1-timeline"
import { timelineExtension } from "@/extensions/N1-timeline"

export const timelineModule = createTimelineModule({ extension: timelineExtension })
```

- Маршрути — `timelineModule.routes` (React Router) під `Suspense` і межею помилок застосунку; сторінка й стрічка — лінивими чанками. Адреса `basePath` веде на «Мої справи».
- Навігація — `timelineModule.nav`. Окремого права немає: досить `<ресурс>:read`, людина бачить лише свої дії на записах, які бачить.
- `timelineModule.preload(pathname)` — наперед завантажити чанк сторінки.
- Рядки модуля — свій простір імен `N1-timeline`. Рядки стрічки — у кіті (`timeline.*`).

## Стрічка на картці

Поки проект не поставив стрічку, картка живе без неї й не робить жодного запиту: бекенд без стрічки нічого не помітить. Модуль картки про N1 не знає, тож B1 не тягне за собою редактор тексту.

Картка модуля бере слот `aside` у своєму розширенні. Стрічка стає на місце «Історії», праворуч на широкому екрані й вкладкою на вузькому. Зміни полів у ній дає сервер записами `change`.

```ts
// src/extensions/B1-contacts.ts
import { timelineModule } from "@/modules"

export const contactsExtension: ContactsExtension = {
  contacts: { aside: timelineModule.aside },
  organizations: { aside: timelineModule.aside },
}
```

Своя картка на шаблоні Object Page:

```tsx
const slots = useRecordSlots({ record, resource: "invoices", aside: timelineModule.aside })

<ObjectPage aside={slots.aside} … />
```

Вміст слота живе, доки відкрита картка: перехід на іншу вкладку чи поворот екрана не стирає чернетку й не знімає захист незбережених змін. Поза шаблоном — `<timelineModule.Timeline resource="invoices" id={id} version={record.version} />` під `Suspense`.

`version` перечитує стрічку після зміни запису: без каналу подія не прийде, а зміна поля має бути видна одразу.

## Розширення під клієнта

Файл проекту `src/extensions/N1-timeline.ts` (тип `TimelineExtension`):

- `card.messages: false` — проект без пошти: лишаються нотатки, зникає й фільтр повідомлень.
- `card.files`, `card.followers`, `card.activities: false` — без файлів, підписників, запланованих дій.
- `card.mentions` — свій пошук людей чи `false`; `card.renderMention` — згадка посиланням на людину; `card.maxFileBytes` — найбільший файл.
- `card.label` — назва блоку; типово «Стрічка».
- `myActivities.perPage` — дій на сторінку, типово 20.
- `myActivities.recordHref` — адреса картки запису. Без неї назва запису в рядку лишається текстом: адреси карток знає проект.
- `myActivities: false` — бекенд без `GET /me/activities`: сторінки й пункту навігації немає.
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

## Контракт API

Адреси запису й подія `<ресурс>.timeline` — шапка `lib/timeline` (ADR-0053). Модуль додає одну адресу під `/api/v1`, для людини, що ввійшла:

- `GET /me/activities?dueFrom=&dueTo=&page=&perPage=` → `{ data, total }`: відкриті дії людини через усі записи, які вона бачить, найближчий термін першим.
- `dueFrom` і `dueTo` — календарні дати включно, обидві необов'язкові. Який сьогодні день у людини, рахує кіт: сервер часового поясу знати не мусить.
- Рядок — дія з `lib/timeline` і `record: { resource, id, title? }`. `title` — назва запису для людини, без неї кіт показує `id`.
- Запис, якого людина вже не бачить, у список не йде.
- `deniedActions` рядка — як на дії картки: рядок показує причину замість кнопок (ADR-0037).
- Змінюють дію адреси її запису, `PATCH /<ресурс>/<id>/activities/<activityId>`. Чужа версія — 409 із `current`, запису вже немає — 404: людина бачить пояснення, список перечитується.

Подія `<ресурс>.timeline` оновлює і «Мої справи». Без каналу сторінка опитує раз на хвилину, а після повернення на неї перечитує завжди.

## Моки

```ts
import { timelineTargetMock } from "@/lib/mock-timeline-store"
import { createTimelineFixtures } from "@/modules/N1-timeline/fixtures"
import { createTimelineMocks } from "@/modules/N1-timeline/mocks"

const timeline = createTimelineMocks({
  targets: [timelineTargetMock({ resource: "contacts", db, title: (contact) => contact.name })],
  seeds: createTimelineFixtures({ records: [{ resource: "contacts", id: "contact-001" }], people }),
})
setupWorker(...createPlatformHandlers(), ...timeline.handlers)
```

Сценарії (`success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline`) — ресурс `timeline`, у панелі розробника чи `lib/mock-scenarios`, на всіх адресах стрічки й на `GET /me/activities`. `empty` дає порожні списки, `conflict` — чуже збереження один раз на запис, тож «Зберегти мої зміни» далі проходить.
