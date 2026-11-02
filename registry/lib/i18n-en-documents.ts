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
}
