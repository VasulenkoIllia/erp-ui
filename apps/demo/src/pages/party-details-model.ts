import type { Language } from "@/registry/lib/i18n"
import {
  emptyPartyDetails,
  type PartyDetails,
} from "@/registry/lib/document-parties"

/**
 * Дані сторінки «Реквізити сторін» (UI45, ADR-0068): контрагенти «з картки» (вигадані, коди й IBAN з
 * правильною контрольною цифрою) і текст договору мовою аркуша.
 */

export interface DemoCounterparty {
  id: string
  party: PartyDetails
}

export const DEMO_COUNTERPARTIES: readonly DemoCounterparty[] = [
  {
    id: "vitr",
    party: {
      kind: "legal",
      name: "ТОВ «Північний вітер»",
      code: "41234569",
      vatIpn: "412345626519",
      iban: "UA223052990000026001234567890",
      bankName: "АТ «Тестовий банк»",
      address: "61000, м. Харків, вул. Вітряна, 7",
      phone: "+380577654321",
      email: "office@vitr.example",
      signerPosition: "Генеральний директор",
      signerName: "Мельник Андрій Петрович",
      representedBy: "генерального директора Мельника Андрія Петровича",
      basis: "Статуту",
    },
  },
  {
    id: "bondar",
    party: {
      ...emptyPartyDetails("fop"),
      name: "ФОП Бондар Ірина Олегівна",
      code: "3124567896",
      iban: "UA443220010000026007654321001",
      bankName: "АТ «Демо Банк»",
      address: "65000, м. Одеса, вул. Морська, 3",
      email: "bondar@fop.example",
      signerName: "Бондар Ірина Олегівна",
      basis: "Виписки з ЄДР",
    },
  },
]

/** Перший контрагент із помилками в коді й пошті: стан «помилка біля поля». */
export const INVALID_PARTY: PartyDetails = {
  ...DEMO_COUNTERPARTIES[0].party,
  code: "41234560",
  email: "office@",
}

/** Текст договору мовою аркуша: назва й вступ зі сторонами. */
export const CONTRACT_TEXT: Record<
  Language,
  { title: string; preamble: (customer: string, contractor: string) => string }
> = {
  uk: {
    title: "Договір про надання послуг",
    preamble: (customer, contractor) =>
      `${customer}, з однієї сторони, та ${contractor}, з іншої сторони, уклали цей договір про таке.`,
  },
  en: {
    title: "Service agreement",
    preamble: (customer, contractor) =>
      `${customer}, on the one hand, and ${contractor}, on the other hand, have concluded this agreement as follows.`,
  },
}
