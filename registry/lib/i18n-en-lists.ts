/**
 * Рядки кіта для списків (ADR-0017) англійською — ті самі ключі, що в `i18n-uk-lists.ts`.
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
} satisfies ErpUiTranslation<typeof ukLists>
