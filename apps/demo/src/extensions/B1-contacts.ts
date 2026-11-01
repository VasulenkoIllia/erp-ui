import { lazyWithPreload } from "@/registry/lib/lazy"
import type {
  ContactsExtension,
  OrganizationsExtension,
} from "@/registry/modules/B1-contacts"

import { timelineModule } from "@/timeline-module"

import { contactsMockExtension } from "./B1-contacts-fields"

/**
 * Розширення модуля B1 «Контакти й компанії» під клієнта (ADR-0020, ADR-0025) — так виглядає файл
 * проекту `src/extensions/B1-contacts.ts`. Файли модуля (`registry/modules/B1-contacts`, у проекті —
 * `src/modules/B1-contacts`) для цього не змінювались:
 * - організації: поле «Платник ПДВ» — колонка після коду, фільтр, поле шапки картки й прапорець у
 *   формі після коду; статус «Призупинена» — бейдж, вкладка списку й вибір у формі, а статус модуля
 *   «Неактивна» — інша назва без заміни (`change`, `B1-contacts-fields.ts`); вкладка проекту
 *   «Нотатки» в картці після «Реквізитів»; колонка «Місто» — інша назва, а поле форми — підказка без
 *   заміни (`change`);
 * - контакти: поле «Зручний канал» — колонка після email, фільтр, поле шапки й вибір у формі з
 *   підказкою; вкладка списку «Ключові» за сегментом;
 * - рядки модуля: пояснення під назвою списку контактів;
 * - стрічка запису модуля N1 на обох картках замість «Історії» (ADR-0054).
 */
const organizations: OrganizationsExtension = {
  ...contactsMockExtension.organizations,
  aside: timelineModule.aside,
  columns: {
    add: [
      { id: "vatPayer", place: { after: "code" }, minWidth: 8, priority: 4 },
    ],
    // Колонка модуля без заміни: інша назва, вміст і поведінка — від модуля.
    change: [
      { id: "city", header: { uk: "Місто клієнта", en: "Client city" } },
    ],
  },
  form: {
    add: [{ id: "vatPayer", place: { after: "code" } }],
    change: [
      {
        id: "city",
        description: {
          uk: "Як у виписці з ЄДР: для рахунків і договорів.",
          en: "As in the state register extract: used in invoices and contracts.",
        },
      },
    ],
  },
  filters: { add: [{ id: "vatPayer" }] },
  recordFields: {
    add: [{ id: "vatPayer", place: { after: "type" } }],
  },
  sections: {
    add: [
      {
        id: "notes",
        title: { uk: "Нотатки", en: "Notes" },
        // Не React.lazy: збій чанка той запам'ятовує назавжди, і «Спробувати ще» секції не допоможе.
        component: lazyWithPreload(() =>
          import("./organizations-notes").then((notes) => notes.default),
        ),
        place: { after: "requisites" },
      },
    ],
  },
}

export const contactsExtension: ContactsExtension = {
  organizations,
  contacts: {
    ...contactsMockExtension.contacts,
    aside: timelineModule.aside,
    columns: {
      add: [
        {
          id: "channel",
          place: { after: "email" },
          minWidth: 9,
          priority: 8,
          // Не влазить — ховається: значення є в шапці картки, а рядок списку не подвоюється.
          overflow: "hide",
        },
      ],
    },
    filters: { add: [{ id: "channel" }] },
    form: {
      add: [
        {
          id: "channel",
          place: { after: "email" },
          description: {
            uk: "Як клієнтові зручніше отримувати рахунки й нагадування.",
            en: "How the client prefers to receive invoices and reminders.",
          },
        },
      ],
    },
    tabs: {
      add: [
        {
          id: "key",
          label: { uk: "Ключові", en: "Key accounts" },
          filter: { segments: "seg-key" },
        },
      ],
    },
    recordFields: { add: [{ id: "channel" }] },
  },
  strings: {
    uk: {
      contacts: {
        lead: "Люди, з якими працює студія: представники клієнтів і приватні особи. Шпилька закріплює контакт угорі списку лише для вас.",
      },
    },
    en: {
      contacts: {
        lead: "People the studio works with: client representatives and private persons. The pin keeps a contact at the top of the list for you only.",
      },
    },
  },
}
