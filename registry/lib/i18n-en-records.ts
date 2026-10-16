/**
 * Рядки кіта для вибору запису й значень із «Копіювати» (ADR-0023) англійською — ті самі ключі, що в
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
  copyableValue: {
    copy: "Copy: {{label}}",
    empty: "Not specified",
  },
} satisfies ErpUiTranslation<typeof ukRecords>
