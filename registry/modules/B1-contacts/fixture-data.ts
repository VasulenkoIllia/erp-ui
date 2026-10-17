/**
 * Довідники фікстур B1 (`fixtures.ts`): назви, міста, вулиці, банки, сегменти, імена й посади
 * українською й англійською, транслітерація назв для англійських даних.
 */
import type { FixtureLocale } from "./fixtures"

export const ORGANIZATION_NAMES = [
  "ТОВ «Дніпро Трейд»",
  "ПП «Агросвіт»",
  "ФОП Коваленко О. В.",
  "ТОВ «Карпатська вода»",
  "АТ «Полтавський молочник»",
  "ТОВ «Смарт Логістик»",
  "ФОП Шевчук І. М.",
  "ТОВ «Буковина Агро»",
  "ПрАТ «Слобожанський прилад»",
  "ТОВ «Одеса Порт Сервіс»",
  "ТОВ «Зелена долина»",
  "ТОВ «Львівська кава»",
  "ПП «Вінницькі ковбаси»",
  "ТОВ «Київбуд-Сервіс»",
  "ФОП Мельник Т. С.",
  "ТОВ «Черкаси Енерго»",
  "АТ «Хортиця Трейд»",
  "ТОВ «Рівне Меблі»",
  "ФОП Бондаренко Н. Ю.",
  "ТОВ «Сумська пекарня»",
  "ТОВ «Житомир Ліс»",
  "ПП «Чернігівський пивовар»",
  "ТОВ «Тернопіль Агрохім»",
  "ФОП Ткаченко В. А.",
  "ТОВ «Миколаїв Шиппінг»",
  "ТОВ «Ужгород Вина»",
  "ПрАТ «Кременчук Авто»",
  "ТОВ «Херсон Фрукт»",
  "ФОП Кравченко Л. І.",
  "ТОВ «Хмельницький текстиль»",
  "ТОВ «Луцьк Пласт»",
  "ТОВ «Івано-Франківськ Кераміка»",
  "ФОП Олійник Д. П.",
  "ТОВ «Полісся Деревообробка»",
  "ТОВ «Дунай Логістика»",
  "ТОВ «Слобожанщина Зерно»",
  "ПП «Подільський мед»",
  "ТОВ «Волинь Цукор»",
]

/** Організаційно-правові форми англійською: «ТОВ «Дніпро Трейд»» → «Dnipro Treid LLC». */
const LEGAL_FORMS_EN: Record<string, string> = {
  ТОВ: "LLC",
  ПП: "PE",
  АТ: "JSC",
  ПрАТ: "PrJSC",
}

export const CITIES = {
  uk: [
    "Київ",
    "Львів",
    "Харків",
    "Одеса",
    "Дніпро",
    "Вінниця",
    "Полтава",
    "Чернівці",
  ],
  en: [
    "Kyiv",
    "Lviv",
    "Kharkiv",
    "Odesa",
    "Dnipro",
    "Vinnytsia",
    "Poltava",
    "Chernivtsi",
  ],
} as const

export const STREETS = {
  uk: [
    "вул. Хрещатик",
    "просп. Свободи",
    "вул. Сумська",
    "вул. Дерибасівська",
    "просп. Яворницького",
    "вул. Соборна",
    "вул. Пушкінська",
    "вул. Головна",
  ],
  en: [
    "Khreshchatyk St",
    "Svobody Ave",
    "Sumska St",
    "Derybasivska St",
    "Yavornytskoho Ave",
    "Soborna St",
    "Pushkinska St",
    "Holovna St",
  ],
} as const

export const POSTAL_CODES = [
  "01001",
  "79000",
  "61000",
  "65000",
  "49000",
  "21000",
  "36000",
  "58000",
]

/** Банки за кодом (МФО) у IBAN. */
export const BANKS = [
  { code: "305299", uk: "АТ КБ «ПриватБанк»", en: "PrivatBank JSC" },
  { code: "322001", uk: "АТ «Універсал Банк»", en: "Universal Bank JSC" },
  { code: "300528", uk: "АТ «ОТП Банк»", en: "OTP Bank JSC" },
  { code: "380805", uk: "АТ «Райффайзен Банк»", en: "Raiffeisen Bank JSC" },
]

export const SEGMENTS = [
  { id: "seg-client", uk: "Клієнт", en: "Client" },
  { id: "seg-supplier", uk: "Постачальник", en: "Supplier" },
  { id: "seg-partner", uk: "Партнер", en: "Partner" },
  { id: "seg-key", uk: "Ключовий", en: "Key account" },
  { id: "seg-new", uk: "Новий", en: "New" },
] as const

export const FIRST_NAMES = [
  "Олена",
  "Іван",
  "Марта",
  "Андрій",
  "Ірина",
  "Тарас",
  "Наталія",
  "Богдан",
  "Софія",
  "Олег",
  "Юлія",
  "Дмитро",
]
export const LAST_NAMES = [
  "Коваль",
  "Шевченко",
  "Бондар",
  "Мельник",
  "Ткачук",
  "Кравець",
  "Олійник",
  "Лисенко",
  "Гончар",
  "Савчук",
  "Романюк",
  "Петренко",
]
export const POSITIONS = {
  uk: [
    "Директор",
    "Головний бухгалтер",
    "Менеджер із закупівель",
    "Юрист",
    "Офіс-менеджер",
    "Фінансовий директор",
  ],
  en: [
    "Director",
    "Chief accountant",
    "Procurement manager",
    "Lawyer",
    "Office manager",
    "Chief financial officer",
  ],
} as const

const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  "'": "",
  "’": "",
}

/** Латиницею за КМУ 2010: «Буковина Агро» → «Bukovyna Ahro». */
export function latin(text: string): string {
  return [...text]
    .map((ch) => {
      const lower = ch.toLocaleLowerCase("uk")
      const mapped = TRANSLIT[lower]
      if (mapped === undefined) return ch
      return ch === lower
        ? mapped
        : mapped.charAt(0).toUpperCase() + mapped.slice(1)
    })
    .join("")
}

export function localizedOrganizationName(
  name: string,
  locale: FixtureLocale,
): string {
  if (locale === "uk") return name
  const fop = /^ФОП\s+(.+)$/.exec(name)
  if (fop?.[1]) return `${latin(fop[1])}, sole proprietor`
  const legal = /^(\S+)\s+«(.+)»$/.exec(name)
  if (legal?.[1] && legal[2])
    return `${latin(legal[2])} ${LEGAL_FORMS_EN[legal[1]] ?? latin(legal[1])}`
  return latin(name)
}

/** «ТОВ «Дніпро Трейд»» → dnipro-treid.example для адреси пошти. */
export function domainOf(name: string): string {
  const core = /«(.+)»/.exec(name)?.[1] ?? name.replace(/^ФОП\s+/, "")
  const slug = latin(core.toLocaleLowerCase("uk"))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${slug}.example`
}
