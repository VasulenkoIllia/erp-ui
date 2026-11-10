/**
 * Кредит-нота модуля K2 для сторінок і компонентів (ADR-0072): статуси й граф дій, як у рахунку, свої
 * підписи й підтвердження, адреси сторінок. Нову кредит-ноту створює дія рахунку, тож адреси «нової» й
 * «Копіювати» немає.
 */
import {
  CREDIT_NOTE_STATUSES,
  CREDIT_NOTE_TRANSITIONS,
  CREDIT_NOTES,
} from "./contract"
import { DOCUMENT_TONES, type K2DocumentKind } from "./document-kind"

export const CREDIT_NOTE_KIND: K2DocumentKind = {
  resource: CREDIT_NOTES,
  key: "creditNote",
  statuses: CREDIT_NOTE_STATUSES.map((id) => ({
    id,
    tone: DOCUMENT_TONES[id],
  })),
  transitions: CREDIT_NOTE_TRANSITIONS,
  actionLabels: { submit: "creditNote.actions.submit" },
  confirms: { submit: "creditNote.confirm.submit" },
  mainPath: ["draft", "issued"],
  pathsOf: (paths) => ({
    list: paths.creditNotes,
    record: paths.creditNote,
    edit: paths.editCreditNote,
    print: paths.printCreditNote,
  }),
  extensionOf: (extension) => extension.creditNotes,
}
