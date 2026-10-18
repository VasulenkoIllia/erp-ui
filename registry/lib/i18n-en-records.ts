/**
 * Рядки кіта для вибору запису, значень із «Копіювати» (ADR-0023), форми запису (ADR-0026) і
 * мультивибору з довідника (ADR-0027) англійською — ті самі ключі, що в
 * `i18n-uk-records.ts`.
 */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukRecords } from "@/registry/lib/i18n-uk-records"

export const enRecords = {
  recordPicker: {
    placeholder: "Select…",
    search: "Search: {{label}}",
    searchPlaceholder: "Start typing a name",
    searching: "Searching…",
    found_one: "{{count}} match",
    found_other: "{{count}} matches",
    more: "Showing {{shown}} of {{total}}. Refine the search.",
    empty: "No matches",
    emptyFor: "No matches for “{{query}}”",
    create: "Create “{{query}}”",
    createNew: "Create new…",
    createDenied: "You don't have permission to create records",
    loadingValue: "Loading…",
    missing: "Record not found",
    valueError: "Couldn't load the record",
    error: "Couldn't load the options",
    forbidden: "No access to this list",
    offline: "No connection to the server",
    retry: "Try again",
    clear: "Clear: {{label}}",
  },
  multiSelect: {
    placeholder: "Select…",
    search: "Search: {{label}}",
    searchPlaceholder: "Start typing",
    loading: "Loading…",
    found_one: "{{count}} option",
    found_other: "{{count}} options",
    selected: "Selected: {{count}}",
    empty: "The list is empty",
    emptyFor: "No matches for “{{query}}”",
    missing: "Not in the list",
    error: "Couldn't load the options",
    forbidden: "No access to this list",
    offline: "No connection to the server",
    retry: "Try again",
    clear: "Clear: {{label}}",
    done: "Done",
  },
  copyableValue: {
    copy: "Copy: {{label}}",
    empty: "Not specified",
  },
  recordForm: {
    save: "Save",
    create: "Create",
    cancel: "Cancel",
    notSet: "Not specified",
    discardTitle: "Close without saving?",
    discardDescription: "What you entered in the form will be lost.",
    discardConfirm: "Close without saving",
    discardCancel: "Back to the form",
    hiddenFields:
      "Could not save: there is an error in fields that are not on the form ({{fields}}). Contact your administrator.",
    reloaded:
      "The form now shows the values saved right now. Change them again if needed.",
    serverErrors: {
      duplicate: "Another record already has this value",
      tooLong: "The value is too long",
      invalid: "The server didn't accept this value. Please check it.",
    },
  },
} satisfies ErpUiTranslation<typeof ukRecords>
