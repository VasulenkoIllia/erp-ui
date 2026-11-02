import type {
  ExtensionStatusChanges,
  ExtensionTransitionChanges,
} from "@/registry/lib/statuses"

import type { DocumentStatus, DocumentTransitionId } from "@/data/documents"

/** Розширення документів проекту (ADR-0020, п. 2): свої статуси й дозволені переходи. */
export interface DocumentsExtension {
  readonly statuses?: ExtensionStatusChanges<DocumentStatus>
  readonly transitions?: ExtensionTransitionChanges<DocumentTransitionId>
}

/**
 * Приклад проекту: чернетку спершу перевіряє керівник. Новий статус «На перевірці», дія «На
 * перевірку» з чернетки, а «Провести» — ще й із перевірки (`change` дії модуля без заміни).
 */
export const documentsExtension: DocumentsExtension = {
  statuses: {
    add: [
      {
        id: "review",
        label: { uk: "На перевірці", en: "In review" },
        tone: "warning",
        place: { after: "draft" },
      },
    ],
  },
  transitions: {
    add: [
      {
        id: "sendToReview",
        label: { uk: "На перевірку", en: "Send for review" },
        from: ["draft"],
        to: "review",
        place: { after: "submit" },
      },
    ],
    change: [{ id: "submit", from: ["draft", "review"] }],
  },
}
