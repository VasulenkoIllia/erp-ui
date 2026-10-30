import { describe, expect, it } from "vitest"

import {
  checkAll,
  checkField,
  fieldsOf,
  isRequisitesDone,
  patchOf,
  requisiteKeys,
  serverFieldErrors,
  type Fields,
} from "@/registry/erp/company-profile-values"
import { ApiError } from "@/registry/lib/api"
import type { CompanyProfile } from "@/registry/lib/company"
import type { ErpUiTranslate } from "@/registry/lib/i18n"

const t = ((key: string) => key) as ErpUiTranslate

const PROFILE: CompanyProfile = {
  id: "c1",
  name: "Зоряна",
  legalName: "ТОВ «Зоряна»",
  kind: "legal",
  edrpou: "32855961",
  vatPayer: false,
  logoUrl: null,
  stampUrl: null,
  branches: [],
}

const values = (changes: Partial<Fields> = {}): Fields => ({
  ...fieldsOf(PROFILE),
  ...changes,
})

describe("значення реквізитів", () => {
  it("код обов'язковий за типом компанії", () => {
    expect(checkField(t, "edrpou", values({ edrpou: "" }))).toBe(
      "auth.fieldErrors.required",
    )
    expect(checkField(t, "rnokpp", values({ kind: "fop" }))).toBe(
      "auth.fieldErrors.required",
    )
    expect(checkField(t, "rnokpp", values())).toBeUndefined()
  })

  it("ІПН обов'язковий лише платнику ПДВ", () => {
    expect(checkField(t, "vatIpn", values({ vatPayer: true }))).toBe(
      "auth.fieldErrors.required",
    )
    expect(checkField(t, "vatIpn", values())).toBeUndefined()
  })

  it("requisiteKeys: лише видимі поля за типом компанії й ПДВ", () => {
    const legal = requisiteKeys(values())
    expect(legal).toContain("edrpou")
    expect(legal).not.toContain("rnokpp")
    expect(legal).not.toContain("vatIpn")
    const fop = requisiteKeys(values({ kind: "fop", vatPayer: true }))
    expect(fop).toContain("rnokpp")
    expect(fop).not.toContain("edrpou")
    expect(fop).toContain("vatIpn")
  })

  it("isRequisitesDone: ті самі правила, що у формі", () => {
    expect(isRequisitesDone(t, PROFILE)).toBe(true)
    expect(isRequisitesDone(t, { ...PROFILE, legalName: " " })).toBe(false)
    expect(isRequisitesDone(t, { ...PROFILE, edrpou: undefined })).toBe(false)
    // Код не проходить контрольну суму: заповнене, але покласти в документи не можна.
    expect(isRequisitesDone(t, { ...PROFILE, edrpou: "32855962" })).toBe(false)
    // Прихований код іншого типу компанії нічого не вирішує.
    expect(isRequisitesDone(t, { ...PROFILE, rnokpp: "1" })).toBe(true)
    expect(isRequisitesDone(t, { ...PROFILE, vatPayer: true })).toBe(false)
  })

  it("checkAll дає лише помилки", () => {
    expect(checkAll(t, values())).toEqual({})
    expect(checkAll(t, values({ name: " " }))).toEqual({
      name: "auth.fieldErrors.required",
    })
  })

  it("patchOf обрізає пробіли, директор іде парою, порожня палітра — null", () => {
    expect(
      patchOf(values({ name: " Нова ", directorName: "Олена", palette: "" }), [
        "name",
        "directorName",
        "palette",
      ]),
    ).toEqual({
      name: "Нова",
      palette: null,
      director: { name: "Олена", position: "" },
    })
  })

  it("serverFieldErrors: код LC12 — своїм текстом, інші — через fieldError", () => {
    const failure = new ApiError(422, {
      code: "validation",
      message: "Validation failed",
      fieldErrors: { edrpou: "checksum", name: "taken", phone: "invalid" },
    })
    const errors = serverFieldErrors(
      t,
      failure,
      ["edrpou", "name"],
      (_failure, field) => `server:${field}`,
    )
    expect(errors.edrpou).toContain("checksum")
    expect(errors.name).toBe("server:name")
    expect(errors).not.toHaveProperty("phone")
  })

  it("serverFieldErrors: збій не про поля — порожньо", () => {
    expect(
      serverFieldErrors(t, new Error("network"), ["name"], () => "x"),
    ).toEqual({})
  })
})
