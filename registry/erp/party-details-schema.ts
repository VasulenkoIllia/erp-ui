import * as React from "react"
import { z } from "zod"

import { uaIdIssueKey } from "@/registry/erp/ua-id-input"
import { COMPANY_KINDS, type CompanyKind } from "@/registry/lib/company"
import {
  isPartyFieldShown,
  LEGAL_ONLY_PARTY_FIELDS,
  type PartyDetails,
  type PartyField,
} from "@/registry/lib/document-parties"
import { useErpUiT, type ErpUiTranslate } from "@/registry/lib/i18n"
import { validateUaId, type UaIdKind } from "@/registry/lib/ua-ids"

/**
 * Перевірки сторони документа для форми (UI45, ADR-0068): назва обов'язкова, коди з контрольною цифрою
 * за видом (`lib/ua-ids`), пошта; решта необов'язкові, модуль додає свої вимоги. Поля юрособи у ФОП
 * у знімок не йдуть: перемкнули вид — збережене чисте, а повернули — введене знову видно.
 */

/** Код сторони: ЄДРПОУ юрособи, РНОКПП ФОП. */
export const partyCodeKind = (kind: CompanyKind): UaIdKind =>
  kind === "fop" ? "rnokpp" : "edrpou"

/** Текст помилки ідентифікатора; порожній — не вказано. */
function uaIdIssue(
  t: ErpUiTranslate,
  kind: UaIdKind,
  value: string,
): string | null {
  const issue = value ? validateUaId(kind, value) : null
  return issue ? t(uaIdIssueKey(kind, issue)) : null
}

/** Схема сторони з текстами мовою інтерфейсу: `z.object({ customer: schema, … })` у формі модуля. */
export function partyDetailsFormSchema(t: ErpUiTranslate) {
  const text = z.string().trim()
  const shape = {
    kind: z.enum(COMPANY_KINDS),
    name: text.min(1, t("validation.required")),
    code: text,
    vatIpn: text,
    iban: text,
    bankName: text,
    address: text,
    phone: text,
    email: text,
    signerPosition: text,
    signerName: text,
    representedBy: text,
    basis: text,
  } satisfies Record<PartyField, z.ZodType<string>>
  return z
    .object(shape)
    .superRefine((party, ctx) => {
      const issues: [PartyField, string | null][] = [
        ["code", uaIdIssue(t, partyCodeKind(party.kind), party.code)],
        ["vatIpn", uaIdIssue(t, "vatIpn", party.vatIpn)],
        ["iban", uaIdIssue(t, "iban", party.iban)],
        [
          "email",
          party.email && !z.email().safeParse(party.email).success
            ? t("auth.fieldErrors.invalid")
            : null,
        ],
      ]
      for (const [path, message] of issues)
        if (message) ctx.addIssue({ code: "custom", path: [path], message })
    })
    .transform((party): PartyDetails =>
      isPartyFieldShown("representedBy", party.kind)
        ? party
        : {
            ...party,
            ...Object.fromEntries(
              LEGAL_ONLY_PARTY_FIELDS.map((field) => [field, ""]),
            ),
          },
    )
}

/** Схема сторони мовою інтерфейсу; та сама, поки мова не змінилась. */
export function usePartyDetailsSchema() {
  const t = useErpUiT()
  return React.useMemo(() => partyDetailsFormSchema(t), [t])
}
