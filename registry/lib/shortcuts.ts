/**
 * Єдиний реєстр гарячих клавіш (SPEC §10, PF06, ADR-0042): кожна клавіша кіта описана тут один раз,
 * довідка «?» (erp/shortcuts-help) показує цей самий перелік, тож вона не розходиться з кодом.
 *
 * - Клавіші на весь застосунок слухає `useShortcut` (hooks/use-shortcut).
 * - Клавіші всередині компонента (грід, картки, редагування клітинки) обробляє сам компонент: він
 *   питає реєстр через `isShortcutKey`, а модифікатори перевіряє своїми правилами, як і раніше.
 * - Напрямок руху стрілками лишається в компоненті (`moveInGrid`): реєстр знає клавіші, а не кроки.
 * - Записи, які обробляє Base UI (Esc у діалозі, стрілки в палітрі), лише описують поведінку для
 *   довідки: їхні клавіші перевіряють тести самих компонентів.
 * - Друкований символ без модифікатора (`isCharacterShortcut`) людина може вимкнути (WCAG 2.1.4):
 *   вибір лежить у цьому браузері.
 *
 * Підпис кожної клавіші — `shortcuts.items.<ключ SHORTCUTS>` у мовних пакетах.
 */

/** Одне поєднання. `key` — значення `event.key`. */
export interface KeyCombo {
  key: string
  /** ⌘ на Mac, Ctrl деінде; спрацьовує будь-який із двох. */
  mod?: boolean
  /** Саме Ctrl, зокрема на Mac (Ctrl+Home у гріді). */
  ctrl?: boolean
}

export interface ShortcutDefinition {
  /** Поєднання, які показує довідка; спрацьовує будь-яке. */
  keys: readonly KeyCombo[]
  /** Працюють так само, але в довідці не показуються: CapsLock, «=» на клавіші «+». */
  aliases?: readonly KeyCombo[]
  /** Спрацьовує й у полі вводу (палітра); інакше поле вводу клавішу не віддає. */
  inFields?: boolean
}

/** Клавіша проекту в довідці: підпис уже перекладено проектом. */
export interface ProjectShortcut extends ShortcutDefinition {
  id: string
  label: string
}

export const SHORTCUT_GROUPS = [
  "general",
  "dialogs",
  "palette",
  "table",
  "cards",
  "cell",
  "avatar",
] as const
type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number]

/** Порядок ключів у групі — порядок рядків довідки. */
export const SHORTCUTS = {
  help: { group: "general", keys: [{ key: "?" }] },
  palette: {
    group: "general",
    keys: [{ key: "k", mod: true }],
    aliases: [{ key: "K", mod: true }],
    inFields: true,
  },
  sidebar: { group: "general", keys: [{ key: "b", mod: true }] },

  dialogClose: { group: "dialogs", keys: [{ key: "Escape" }] },

  paletteMove: {
    group: "palette",
    keys: [{ key: "ArrowUp" }, { key: "ArrowDown" }],
  },
  paletteRun: { group: "palette", keys: [{ key: "Enter" }] },
  paletteClose: { group: "palette", keys: [{ key: "Escape" }] },

  gridMove: {
    group: "table",
    keys: [
      { key: "ArrowUp" },
      { key: "ArrowDown" },
      { key: "ArrowLeft" },
      { key: "ArrowRight" },
    ],
  },
  gridRowEdge: { group: "table", keys: [{ key: "Home" }, { key: "End" }] },
  gridEdge: {
    group: "table",
    keys: [
      { key: "Home", ctrl: true },
      { key: "End", ctrl: true },
    ],
  },
  gridPage: { group: "table", keys: [{ key: "PageUp" }, { key: "PageDown" }] },
  gridEnter: { group: "table", keys: [{ key: "Enter" }, { key: "F2" }] },
  gridExit: { group: "table", keys: [{ key: "Escape" }] },

  cardsNext: {
    group: "cards",
    keys: [{ key: "PageDown" }, { key: "ArrowDown" }],
  },
  cardsPrevious: {
    group: "cards",
    keys: [{ key: "PageUp" }, { key: "ArrowUp" }],
  },

  cellEdit: { group: "cell", keys: [{ key: "F2" }] },
  cellSave: { group: "cell", keys: [{ key: "Enter" }] },
  cellCancel: { group: "cell", keys: [{ key: "Escape" }] },

  avatarMove: {
    group: "avatar",
    keys: [
      { key: "ArrowUp" },
      { key: "ArrowDown" },
      { key: "ArrowLeft" },
      { key: "ArrowRight" },
    ],
  },
  avatarZoomIn: {
    group: "avatar",
    keys: [{ key: "+" }],
    aliases: [{ key: "=" }],
  },
  avatarZoomOut: { group: "avatar", keys: [{ key: "-" }] },
} as const satisfies Record<
  string,
  ShortcutDefinition & { group: ShortcutGroup }
>

export type ShortcutId = keyof typeof SHORTCUTS

const combosOf = (shortcut: ShortcutDefinition) => [
  ...shortcut.keys,
  ...(shortcut.aliases ?? []),
]

/** Клавіша з реєстру в компоненті, який сам вирішує, що робити з модифікаторами. */
export function isShortcutKey(
  shortcut: ShortcutDefinition,
  key: string,
): boolean {
  return combosOf(shortcut).some((combo) => combo.key === key)
}

const isLatinLetter = (key: string) => /^[a-z]$/i.test(key)
const isNonAscii = (key: string) => key.length === 1 && key.charCodeAt(0) > 0x7f
const isUpperCase = (key: string) => key !== key.toLowerCase()

/**
 * На кирилиці браузер дає «л», а не «k», тому для нелатинської літери дивимось на фізичну клавішу.
 * Лише для нелатинських: у Dvorak «k» на іншому місці, і там важить літера, а не місце. Shift
 * враховуємо окремо, бо іврит і тайська регістру не мають, а Ctrl+Shift має поводитись, як на
 * латиниці. З Alt не порівнюємо: AltGr (Ctrl+Alt) і Option на Mac друкують символ, це набір тексту.
 */
function isSameLetter(event: KeyboardEvent, key: string): boolean {
  if (event.key === key) return true
  const isShifted = event.shiftKey || isUpperCase(event.key)
  return (
    isLatinLetter(key) &&
    isNonAscii(event.key) &&
    !event.altKey &&
    isShifted === isUpperCase(key) &&
    event.code === `Key${key.toUpperCase()}`
  )
}

function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  if (!isSameLetter(event, combo.key)) return false
  if (combo.mod) return event.metaKey || event.ctrlKey
  if (combo.ctrl) return event.ctrlKey && !event.metaKey
  return !event.ctrlKey && !event.metaKey && !event.altKey
}

/** Натискання відповідає поєднанню з реєстру (Shift при `mod` не заважає, як і раніше). */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition,
): boolean {
  return combosOf(shortcut).some((combo) => matchesCombo(event, combo))
}

/** Поле вводу чи редактор у фокусі: гарячі клавіші оболонки їм не заважають (Ctrl+B — жирний). */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/** Де друкований символ має своє значення: пошук у списку, меню, діалог, клітинка з редактором. */
const OWNS_CHARACTERS =
  "[role=combobox], [role=listbox], [role=menu], [role=dialog], [role=alertdialog], [data-grid-skip]"

const CHARACTER_KEYS_STORAGE_KEY = "erp-ui:character-shortcuts"

/** Вибір, коли сховище недоступне (приватний режим): вимикач мусить діяти й там, до кінця вкладки. */
let choiceWithoutStorage: boolean | undefined
const characterListeners = new Set<() => void>()

/** Читається щоразу зі сховища: вибір, зроблений в іншій вкладці, діє одразу. */
export function areCharacterShortcutsEnabled(): boolean {
  if (choiceWithoutStorage !== undefined) return choiceWithoutStorage
  try {
    return localStorage.getItem(CHARACTER_KEYS_STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

export function setCharacterShortcutsEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(CHARACTER_KEYS_STORAGE_KEY)
    else localStorage.setItem(CHARACTER_KEYS_STORAGE_KEY, "off")
    choiceWithoutStorage = undefined
  } catch {
    choiceWithoutStorage = enabled
  }
  for (const listener of characterListeners) listener()
}

/** Подія `storage` приходить із інших вкладок: довідка там теж покаже новий вибір. */
export function subscribeCharacterShortcuts(listener: () => void) {
  characterListeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    characterListeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** Є поєднання із символом без модифікатора: WCAG 2.1.4 вимагає вимикача, у меню й пошуку він свій. */
export function isCharacterShortcut(shortcut: ShortcutDefinition): boolean {
  return combosOf(shortcut).some(
    ({ key, mod, ctrl }) => key.length === 1 && !mod && !ctrl,
  )
}

/** Чи може клавіша на весь застосунок спрацювати там, де зараз фокус. */
export function canFireShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition,
): boolean {
  if (shortcut.inFields) return true
  if (isEditableTarget(event.target)) return false
  if (!isCharacterShortcut(shortcut)) return true
  // Компонент уже забрав символ собі (літера на полі вибору відкриває пошук).
  if (event.defaultPrevented || event.isComposing) return false
  if (event.target instanceof Element && event.target.closest(OWNS_CHARACTERS))
    return false
  return areCharacterShortcutsEnabled()
}

export function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iP(hone|ad)/.test(navigator.userAgent)
  )
}

const KEY_LABELS = new Map([
  ["ArrowUp", "↑"],
  ["ArrowDown", "↓"],
  ["ArrowLeft", "←"],
  ["ArrowRight", "→"],
  ["Escape", "Esc"],
])

const upperLetter = (key: string) =>
  isLatinLetter(key) ? key.toUpperCase() : key
const keyLabel = (key: string) => KEY_LABELS.get(key) ?? upperLetter(key)

/** Підпис поєднання: «⌘K» на Mac, «Ctrl K» деінде, «Ctrl Home», «↑». */
export function comboLabel(combo: KeyCombo, isMac: boolean): string {
  const key = keyLabel(combo.key)
  if (combo.mod) return isMac ? `⌘${key}` : `Ctrl ${key}`
  return combo.ctrl ? `Ctrl ${key}` : key
}

/** Значення `aria-keyshortcuts` за поєднаннями з реєстру (WAI-ARIA 1.2). */
export function ariaKeyShortcuts(
  shortcut: ShortcutDefinition,
  isMac: boolean,
): string {
  return shortcut.keys
    .map((combo) => {
      const key = upperLetter(combo.key)
      if (combo.mod) return `${isMac ? "Meta" : "Control"}+${key}`
      return combo.ctrl ? `Control+${key}` : key
    })
    .join(" ")
}
