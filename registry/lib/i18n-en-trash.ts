/**
 * Trash strings in English (PF16, ADR-0095). Ukrainian — lib/i18n-uk-trash.
 */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukTrash } from "@/registry/lib/i18n-uk-trash"

export const enTrash = {
  trash: {
    open: "Trash",
    pageTitle: "Trash: {{list}}",
    lead_one:
      "Deleted records stay here for {{count}} day, then the server deletes them for good.",
    lead_other:
      "Deleted records stay here for {{count}} days, then the server deletes them for good.",
    keptFor_one: "They can be restored from the trash within {{count}} day.",
    keptFor_other: "They can be restored from the trash within {{count}} days.",
    listLabel: "Deleted records",
    empty: "The trash is empty",
    emptyHint:
      "Deleted records land here. They can be restored until their time runs out.",
    unsupported:
      "This app's server doesn't keep a trash: deleted records aren't kept.",
    unnamed: "Record {{id}}",
    deletedAt: "Deleted {{date}}",
    deletedBy: "Deleted by: {{name}}",
    purgeAt: "Gone for good {{date}}",
    purgeSoon: "Gone for good soon: {{date}}",
    restore: "Restore",
    restoreFor: "Restore: {{name}}",
    restored: "Restored: {{name}}",
    openRestored: "Open",
    restoreGone:
      "This record is no longer in the trash: it was restored or its time ran out",
    restoreConflict:
      "Can't restore: while the record was in the trash, another record took its place (the same name or code, a new document from the same source)",
    shown: "Showing {{shown}} of {{total}}",
    more: "Show more",
    moved: "Moved to the trash",
    undoFailed: "Couldn't bring the record back: {{reason}}",
    undoOtherCompany:
      "The record was deleted in another company: switch to it and restore the record from the trash",
  },
} satisfies ErpUiTranslation<typeof ukTrash>
