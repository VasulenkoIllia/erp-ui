/**
 * Організації для сторінки «Вибір і реквізити» (UI40, UI43): довідник, у якому шукає вибір компанії
 * контакту. Зразок даних модуля B1 «Контакти й компанії» (крок 1.4 переносить їх у модуль).
 */
import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"
import { edrpouCheckDigit, rnokppCheckDigit } from "@/registry/lib/ua-ids"

import { INVOICE_CLIENTS } from "./invoices"

export const ORGANIZATION_TYPES = ["legal", "fop"] as const

export const organizationSchema = recordBaseSchema.extend({
  name: z.string().min(1),
  /** Юрособа — ЄДРПОУ (8 цифр), ФОП — РНОКПП (10). */
  type: z.enum(ORGANIZATION_TYPES),
  code: z.string(),
  iban: z.string(),
  /** E.164: +380… */
  phone: z.string(),
  email: z.string(),
  city: z.string(),
  companyId: z.string().nullable(),
})
export type Organization = z.infer<typeof organizationSchema>

/** Більше за перші 20 варіантів вибору — видно підказку «Уточніть пошук». */
const MORE_NAMES = [
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

const CITIES = [
  "Київ",
  "Львів",
  "Харків",
  "Одеса",
  "Дніпро",
  "Вінниця",
  "Полтава",
  "Чернівці",
]

/** Коди банків (МФО) у IBAN фікстур. */
const BANK_CODES = ["305299", "322001", "300528", "380805"]

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
}

/** «ТОВ «Дніпро Трейд»» → dnipro-trade.example для адреси пошти фікстури. */
function domainOf(name: string): string {
  const core = /«(.+)»/.exec(name)?.[1] ?? name.replace(/^ФОП\s+/, "")
  const latin = [...core.toLocaleLowerCase("uk")]
    .map((ch) => TRANSLIT[ch] ?? (/[a-z0-9]/.test(ch) ? ch : "-"))
    .join("")
  return `${latin.replace(/-+/g, "-").replace(/^-|-$/g, "")}.ua`
}

/** IBAN UA з контрольними цифрами ISO 13616 (mod 97). */
function ibanOf(bankCode: string, account: string): string {
  const bban = `${bankCode}${account.padStart(19, "0")}`
  // «UA00» в кінець, літери — числами: U = 30, A = 10.
  const check = 98 - Number(BigInt(`${bban}301000`) % 97n)
  return `UA${String(check).padStart(2, "0")}${bban}`
}

const pad = (n: number, length: number) => String(n).padStart(length, "0")

export function makeOrganizations(): Organization[] {
  return [...INVOICE_CLIENTS, ...MORE_NAMES].map((name, i) => {
    const isFop = name.startsWith("ФОП")
    const body = isFop
      ? pad(301_234_560 + i * 7919, 9)
      : pad(4_123_400 + i * 613, 7)
    const check = isFop ? rnokppCheckDigit(body) : edrpouCheckDigit(body)
    return {
      id: `org-${pad(i + 1, 3)}`,
      version: 1,
      name,
      type: isFop ? "fop" : "legal",
      code: `${body}${String(check)}`,
      iban: ibanOf(
        BANK_CODES[i % BANK_CODES.length] ?? "305299",
        `26000${pad(52_341 + i * 97, 10)}`,
      ),
      phone: `+38067${pad(1_204_310 + i * 4_271, 7)}`,
      email: `office@${domainOf(name)}`,
      city: CITIES[i % CITIES.length] ?? "Київ",
      companyId: i % 5 === 4 ? "kovalenko" : "zoriana",
    }
  })
}
