/**
 * Document party strings in English (UI45, ADR-0068). Ukrainian — lib/i18n-uk-party.
 */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukParty } from "@/registry/lib/i18n-uk-party"

export const enParty = {
  partyDetails: {
    kind: "Type",
    name: "Full name",
    nameHint: {
      legal: "As in documents: Zoriana Logistics LLC",
      fop: "As in documents: Sole proprietor Olena Kovalenko",
    },
    vatIpnHint: "Leave empty if the party is not a VAT payer",
    address: "Address",
    signer: "Signatory",
    signerPosition: "Signatory's title",
    signerName: "Signatory (full name)",
    signerNameHint: "Surname, first name, patronymic",
    signature: "Signature on documents: {{name}}",
    representedBy: "Represented by (genitive case)",
    representedByHint: "Title and full name as written in the document",
    basis: "Acting under",
    basisHint:
      "Articles of association, State Register extract, Power of attorney No. 12 of 01.10.2026",
    filled_one: "Filled {{count}} empty field. What you entered is unchanged.",
    filled_other:
      "Filled {{count}} empty fields. What you entered is unchanged.",
    nothingToFill: "No empty fields to fill: nothing has changed.",
    role: "Our company in the document",
    roles: {
      customer: "Customer",
      contractor: "Contractor",
    },
    ours: "{{role}}: our company",
  },
} satisfies ErpUiTranslation<typeof ukParty>
