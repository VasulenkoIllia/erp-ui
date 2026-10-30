/** Рядки довідки гарячих клавіш (ADR-0042) англійською — ті самі ключі, що в `i18n-uk-shortcuts.ts`. */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukShortcuts } from "@/registry/lib/i18n-uk-shortcuts"

export const enShortcuts = {
  shortcuts: {
    title: "Keyboard shortcuts",
    description:
      "All the keys of the application. Table and card keys work while the table or cards have focus.",
    off: "off",
    or: "or",
    characterKeys: "App-wide single-character keys, such as ?",
    characterKeysHint:
      "Turn them off if they fire by accident, for example during voice input. The help stays in the command palette.",
    macNote:
      "On a Mac laptop: Home is Fn ←, End is Fn →, PageUp is Fn ↑, PageDown is Fn ↓, and F2 is Fn F2.",
    groups: {
      general: "General",
      dialogs: "Dialogs and menus",
      palette: "Command palette",
      table: "Table",
      cards: "Cards",
      cell: "Editing a cell",
      avatar: "Profile photo",
      project: "This application",
    },
    items: {
      help: "Show keyboard shortcuts",
      palette: "Open search and commands",
      sidebar: "Collapse or expand the menu",
      dialogClose: "Close a dialog or menu",
      paletteMove: "Choose a command",
      paletteRun: "Run the command",
      paletteClose: "Close the palette",
      gridMove: "Move to the next cell",
      gridRowEdge: "To the start or end of the row",
      gridEdge: "To the first or last cell of the table",
      gridPage: "One screen up or down",
      gridEnter: "Enter the cell",
      gridExit: "Back to the cell",
      cardsNext: "Next card",
      cardsPrevious: "Previous card",
      cellEdit: "Start editing",
      cellSave: "Save the value",
      cellCancel: "Cancel the change",
      avatarMove: "Move the photo",
      avatarZoomIn: "Zoom in",
      avatarZoomOut: "Zoom out",
    },
    keys: {
      arrowUp: "up arrow",
      arrowDown: "down arrow",
      arrowLeft: "left arrow",
      arrowRight: "right arrow",
      plus: "plus",
      minus: "minus",
      question: "question mark",
    },
  },
} satisfies ErpUiTranslation<typeof ukShortcuts>
