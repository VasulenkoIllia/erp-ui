import { describe, expect, it } from "vitest"

import type { CompanyProfile } from "@/registry/lib/company"
import {
  emptyPartyDetails,
  fillEmptyPartyFields,
  otherPartyRole,
  partiesByRole,
  partyDetailsSchema,
  partyFromCompany,
  signatureName,
  type PartyDetails,
} from "@/registry/lib/document-parties"
import { validateUaId } from "@/registry/lib/ua-ids"

import { DEMO_COUNTERPARTIES, INVALID_PARTY } from "@/pages/party-details-model"

/**
 * Крок UI45 (ADR-0068): сторона документа — заповнення лише порожніх полів, сторона з профілю компанії,
 * підпис «Олена КОВАЛЬ» з ПІБ, ролі «Замовник / Виконавець».
 */

const LEGAL: PartyDetails = DEMO_COUNTERPARTIES[0].party
const FOP: PartyDetails = DEMO_COUNTERPARTIES[1].party

const COMPANY: CompanyProfile = {
  id: "zoriana",
  name: "Зоряна логістика",
  legalName: "ТОВ «Зоряна логістика»",
  kind: "legal",
  edrpou: "32855961",
  vatPayer: true,
  vatIpn: "143605704021",
  iban: "UA213223130000026007233566001",
  bankName: "АТ «Демо Банк»",
  address: "01001, м. Київ, вул. Зоряна, 1",
  director: { name: "Коваль Олена Вікторівна", position: "Директор" },
  logoUrl: null,
  stampUrl: null,
  branches: [],
}

describe("заповнення лише порожніх полів", () => {
  it("введене людиною лишається, порожнє береться з джерела", () => {
    const current = {
      ...emptyPartyDetails(),
      name: "ТОВ «Мій варіант»",
      basis: "Довіреності № 5",
      address: "   ",
    }
    const { values, filled } = fillEmptyPartyFields(current, LEGAL)
    expect(values.name).toBe("ТОВ «Мій варіант»")
    expect(values.basis).toBe("Довіреності № 5")
    // Лише пробіли — порожньо.
    expect(values.address).toBe(LEGAL.address)
    expect(values.code).toBe(LEGAL.code)
    expect(filled).not.toContain("name")
    expect(filled).not.toContain("basis")
    expect(filled).toHaveLength(10)
  })

  it("повторне заповнення нічого не змінює", () => {
    const once = fillEmptyPartyFields(emptyPartyDetails(), LEGAL).values
    expect(fillEmptyPartyFields(once, LEGAL)).toEqual({
      values: once,
      filled: [],
    })
  })

  it("вид іде разом із кодом: з джерела, лише поки код порожній", () => {
    const fromFop = fillEmptyPartyFields(emptyPartyDetails("legal"), FOP)
    expect(fromFop.values.kind).toBe("fop")
    expect(fromFop.filled[0]).toBe("kind")
    const typed = { ...emptyPartyDetails("legal"), code: "41234569" }
    expect(fillEmptyPartyFields(typed, FOP).values).toMatchObject({
      kind: "legal",
      code: "41234569",
    })
  })

  it("поля юрособи у ФОП не заповнюються", () => {
    const { values, filled } = fillEmptyPartyFields(
      { ...emptyPartyDetails("fop"), code: FOP.code },
      LEGAL,
    )
    expect(values.kind).toBe("fop")
    expect(values.signerPosition).toBe("")
    expect(values.representedBy).toBe("")
    expect(filled).not.toContain("signerPosition")
    expect(filled).not.toContain("representedBy")
  })
})

describe("сторона з профілю компанії", () => {
  it("юрособа: ЄДРПОУ, ІПН платника, підписант-директор", () => {
    expect(partyFromCompany(COMPANY)).toEqual({
      kind: "legal",
      name: "ТОВ «Зоряна логістика»",
      code: "32855961",
      vatIpn: "143605704021",
      iban: "UA213223130000026007233566001",
      bankName: "АТ «Демо Банк»",
      address: "01001, м. Київ, вул. Зоряна, 1",
      phone: "",
      email: "",
      signerPosition: "Директор",
      signerName: "Коваль Олена Вікторівна",
    })
  })

  it("ФОП без ПДВ: РНОКПП, без ІПН, підписант — ПІБ із назви", () => {
    const fop = partyFromCompany({
      ...COMPANY,
      kind: "fop",
      legalName: "ФОП Коваленко Олена Вікторівна",
      rnokpp: "1759013776",
      vatPayer: false,
      director: undefined,
    })
    expect(fop).toMatchObject({
      kind: "fop",
      code: "1759013776",
      vatIpn: "",
      signerPosition: "",
      signerName: "Коваленко Олена Вікторівна",
    })
  })
})

describe("підпис «Олена КОВАЛЬ»", () => {
  it.each([
    ["Коваль Олена Вікторівна", "Олена КОВАЛЬ"],
    ["  Коваль   Олена  ", "Олена КОВАЛЬ"],
    ["Коваль-Петренко Олена", "Олена КОВАЛЬ-ПЕТРЕНКО"],
    ["Мар'янчук Ігор Іванович", "Ігор МАР'ЯНЧУК"],
    ["Коваль", "КОВАЛЬ"],
    ["", ""],
    ["   ", ""],
  ])("%j → %j", (name, signature) => {
    expect(signatureName(name)).toBe(signature)
  })
})

describe("ролі й схема", () => {
  it("наша компанія — одна роль, контрагент — друга", () => {
    expect(otherPartyRole("customer")).toBe("contractor")
    expect(partiesByRole("contractor", "ми", "вони")).toEqual({
      customer: "вони",
      contractor: "ми",
    })
    expect(partiesByRole("customer", "ми", "вони")).toEqual({
      customer: "ми",
      contractor: "вони",
    })
  })

  it("відповідь сервера без нових полів — порожні, а не помилка", () => {
    expect(
      partyDetailsSchema.parse({ kind: "fop", name: "ФОП Бондар" }),
    ).toEqual({ ...emptyPartyDetails("fop"), name: "ФОП Бондар" })
  })

  it("коди демо-контрагентів правильні, а в стану з помилкою — ні", () => {
    expect(validateUaId("edrpou", LEGAL.code)).toBeNull()
    expect(validateUaId("vatIpn", LEGAL.vatIpn)).toBeNull()
    expect(validateUaId("iban", LEGAL.iban)).toBeNull()
    expect(validateUaId("rnokpp", FOP.code)).toBeNull()
    expect(validateUaId("iban", FOP.iban)).toBeNull()
    expect(validateUaId("edrpou", INVALID_PARTY.code)).toBe("checksum")
  })
})
