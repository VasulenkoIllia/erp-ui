/**
 * Board strings in English (UI07, ADR-0100). Ukrainian — lib/i18n-uk-board.
 */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukBoard } from "@/registry/lib/i18n-uk-board"

export const enBoard = {
  board: {
    cards_one: "{{value}} card",
    cards_other: "{{value}} cards",
    collapse: "Collapse the “{{column}}” column",
    expand_one: "{{column}}, {{value}} card, expand the column",
    expand_other: "{{column}}, {{value}} cards, expand the column",
    column: "Column",
    columnOption: "{{column}}: {{value}}",
    cell: "{{column}}, {{lane}}",
    otherLane: "Other",
    noCards: "No cards",
    loadMore: "Show more",
    shown: "Showing {{shown}} of {{total}}",
    limit: "Showing {{shown}} of {{total}}. Narrow the filter to see the rest.",
    columnFailed: "Couldn't load the “{{column}}” column",
    retry: "Try again",
    quickCreate: {
      open: "Add a card",
      openIn: "Add a card to the “{{column}}” column",
      label: "Name",
      submit: "Add",
      cancel: "Cancel",
      created: "Created “{{name}}” in the “{{column}}” column",
      failed: "Couldn't create the card: {{message}}",
    },
    card: {
      actions: "Actions: {{label}}",
      moveTo: "Move to…",
      moved: "“{{label}}” is now in the “{{column}}” column",
      moveFailed: "Couldn't move “{{label}}”: {{message}}",
      conflict:
        "Someone else has just changed “{{label}}”, so it wasn't moved. The board is up to date, try again.",
      lockedBy: "{{name}} is editing",
      lockedReason: "{{name}} is editing this card",
      noRight: "You can't move cards",
    },
  },
} satisfies ErpUiTranslation<typeof ukBoard>
