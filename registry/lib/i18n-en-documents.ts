/**
 * Document lifecycle strings in English (PF03, ADR-0057). Ukrainian — lib/i18n-uk-documents.
 */
import type { ukDocuments } from "@/registry/lib/i18n-uk-documents"

export const enDocuments: typeof ukDocuments = {
  documentStates: {
    draft: "Draft",
    submitted: "Submitted",
    cancelled: "Cancelled",
  },
  documentActions: {
    label: "Document actions",
    submit: "Submit",
    cancel: "Cancel",
    amend: "Amend",
    reverse: "Reverse",
    none: "No actions are available in this status",
    noPermission: "You don't have permission for this action",
    refused: "“{{action}}” wasn't done. {{reason}}",
    failed: "“{{action}}” wasn't done. {{message}}",
    done: {
      submit: "Document submitted",
      cancel: "Document cancelled",
      amend: "Amended copy created",
      reverse: "Reversal document created",
      other: "Done: “{{action}}”",
    },
    confirm: {
      submit: {
        title: "Submit the document?",
        action: "Submit document",
        description:
          "A submitted document can't be changed. Mistakes are fixed by cancelling or reversing it.",
      },
      cancel: {
        title: "Cancel the document?",
        action: "Cancel document",
        description:
          "The document becomes void but stays in the list. You can create an amended copy afterwards.",
      },
      reverse: {
        title: "Reverse the document?",
        action: "Reverse document",
        description:
          "The document stays submitted, and a reversal document that offsets it is created next to it.",
      },
      other: {
        title: "{{action}}?",
        action: "{{action}}",
        description: "The document status will change.",
      },
    },
    reason: "Reason",
    reasonOptional: "Reason (optional)",
    reasonRequired: "Enter a reason",
    keep: "Don't do it",
    conflict: {
      title: "Someone else changed the document",
      description:
        "While you were viewing the document, someone changed it. Compare the values before you go on.",
      mine: "You saw",
      theirs: "Now",
      version: "Version",
      reload: "Show the current version",
    },
  },
  documentFlow: {
    label: "Document flow",
    current: "This document",
    forbidden: "No access",
    deleted: "Deleted",
    links: {
      basedOn: "Based on {{number}}",
      amendedFrom: "Amended copy of {{number}}",
      reversalOf: "Reversal of {{number}}",
    },
    empty:
      "No related documents yet. Documents created from this one will appear here.",
    loading: "Loading related documents",
    updating: "Updating related documents",
    error: "Couldn't load related documents.",
    offline: "No connection, so related documents didn't load.",
    denied: "You don't have permission to see related documents.",
    refresh: "Couldn't refresh related documents. Showing the previous ones.",
    truncated:
      "Not all related documents are shown. Find the rest in the document lists.",
  },
}
