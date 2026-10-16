/**
 * Рядки кіта для списків (ADR-0017, ADR-0018, ADR-0024) англійською — ті самі ключі, що в `i18n-uk-lists.ts`.
 */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukLists } from "@/registry/lib/i18n-uk-lists"

export const enLists = {
  filterBar: {
    filters: "Filters",
    activeCount_one: "{{count}} active",
    activeCount_other: "{{count}} active",
    active: "Active filters",
    remove: "Remove filter “{{label}}”",
    clearAll: "Clear filters",
    clearDraft: "Clear",
    apply: "Apply",
    from: "From",
    to: "To",
    fromValue: "from {{value}}",
    toValue: "to {{value}}",
    between: "{{from}} to {{to}}",
    rangeIssue: "The start can't be after the end",
  },
  savedViews: {
    label: "List view",
    menu: "List views",
    standard: "Standard",
    modified: "modified",
    byDefault: "default",
    save: "Save changes to view",
    saveAs: "Save as new view…",
    rename: "Rename…",
    makeDefault: "Open by default",
    delete: "Delete view",
    loading: "Loading views…",
    loadFailed: "Couldn't load views",
    retry: "Try again",
    created: "View “{{name}}” saved",
    updated: "Changes saved to view “{{name}}”",
    renamed: "View renamed to “{{name}}”",
    defaultSet: "“{{name}}” will open by default",
    deleted: "View “{{name}}” deleted",
    restored: "View “{{name}}” restored",
    failed: "Couldn't save the view: {{message}}",
    deleteFailed: "Couldn't delete the view: {{message}}",
    dialog: {
      createTitle: "New view",
      createDescription:
        "The view remembers the tab, filters, search and sorting. Only you can see it.",
      renameTitle: "Rename view",
      name: "Name",
      isDefault: "Open this view by default",
      submit: "Save",
      cancel: "Cancel",
      duplicate: "A view with this name already exists",
      tooLong: "{{max}} characters at most",
    },
  },
  selection: {
    column: "Selection",
    selectPage: "Select rows on this page",
    selectAll: "Select all matching the filter",
    row: "Select {{label}}",
    selected: "{{value}} selected",
    selectedAll: "All {{value}} matching the filter selected",
    selectAllMatching: "Select all {{value}}",
    clear: "Clear selection",
  },
  jobs: {
    queued: "Queued…",
    progress: "{{done}} of {{total}}",
    done: "Done: {{value}}",
    partial: "Done {{done}} of {{total}}, failed: {{failed}}",
    failed: "Could not run: {{message}}",
    pollFailed: "No connection to the server, checking again",
    statusLost:
      "Couldn't get the job status: {{message}}. The job may have finished, refresh the list.",
    details: "Details",
    retry: "Retry ({{value}})",
    retryFailed: "Could not retry: {{message}}",
    failuresTitle: "Failed: {{value}}",
    failuresDescription:
      "The action did not change these records. Those you can retry were busy or changed while the job ran.",
    canRetry: "can be retried",
    andMore: "and {{value}} more",
    unknownReason: "Other reason ({{code}})",
    close: "Close",
  },
  editableCell: {
    edit: "edit",
    saving: "Saving…",
    failed:
      "Could not save “{{field}}”: {{message}}. The previous value is back.",
    retry: "Retry",
  },
  pins: {
    column: "Pin",
    pin: "Pin to top: {{name}}",
    action: "Pin to top",
    pinned: "{{name}}: pinned to the top of the list",
    unpinned: "{{name}}: unpinned",
    limit:
      "You have pinned as many records as you can. Unpin one to pin another.",
    failed: "Could not change the pin: {{message}}",
  },
  pageSize: {
    label: "Rows per page",
  },
} satisfies ErpUiTranslation<typeof ukLists>
