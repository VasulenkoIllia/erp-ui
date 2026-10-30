import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ShortcutKeys } from "@/registry/erp/shortcut-keys"
import { ShortcutsHelp } from "@/registry/erp/shortcuts-help"
import { useShortcut } from "@/registry/hooks/use-shortcut"
import { isGridNavigationKey, moveInGrid } from "@/registry/lib/data-table-core"
import { en } from "@/registry/lib/i18n-en"
import { uk } from "@/registry/lib/i18n-uk"
import {
  ariaKeyShortcuts,
  areCharacterShortcutsEnabled,
  canFireShortcut,
  comboLabel,
  isShortcutKey,
  matchesShortcut,
  isCharacterShortcut,
  setCharacterShortcutsEnabled,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  subscribeCharacterShortcuts,
  type ShortcutId,
} from "@/registry/lib/shortcuts"

const press = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init)

afterEach(() => {
  localStorage.clear()
})

describe("matchesShortcut: поведінка наявних клавіш", () => {
  it("палітра: Ctrl чи ⌘, CapsLock і Shift не заважають", () => {
    const { palette } = SHORTCUTS
    expect(matchesShortcut(press({ key: "k", ctrlKey: true }), palette)).toBe(
      true,
    )
    expect(matchesShortcut(press({ key: "k", metaKey: true }), palette)).toBe(
      true,
    )
    expect(matchesShortcut(press({ key: "K", ctrlKey: true }), palette)).toBe(
      true,
    )
    expect(
      matchesShortcut(
        press({ key: "K", ctrlKey: true, shiftKey: true }),
        palette,
      ),
    ).toBe(true)
    expect(matchesShortcut(press({ key: "k" }), palette)).toBe(false)
  })

  it("сайдбар: лише мала b, Ctrl+Shift+B лишається браузеру", () => {
    const { sidebar } = SHORTCUTS
    expect(matchesShortcut(press({ key: "b", ctrlKey: true }), sidebar)).toBe(
      true,
    )
    expect(
      matchesShortcut(
        press({ key: "B", ctrlKey: true, shiftKey: true }),
        sidebar,
      ),
    ).toBe(false)
  })

  it("символ без модифікатора не спрацьовує з Ctrl, ⌘ чи Alt", () => {
    const { help } = SHORTCUTS
    expect(matchesShortcut(press({ key: "?", shiftKey: true }), help)).toBe(
      true,
    )
    for (const modifier of ["ctrlKey", "metaKey", "altKey"])
      expect(matchesShortcut(press({ key: "?", [modifier]: true }), help)).toBe(
        false,
      )
  })
})

describe("matchesShortcut: нелатинська розкладка", () => {
  it("українська: Ctrl+K і Ctrl+B за фізичною клавішею", () => {
    expect(
      matchesShortcut(
        press({ key: "л", code: "KeyK", ctrlKey: true }),
        SHORTCUTS.palette,
      ),
    ).toBe(true)
    expect(
      matchesShortcut(
        press({ key: "и", code: "KeyB", metaKey: true }),
        SHORTCUTS.sidebar,
      ),
    ).toBe(true)
  })

  it("регістр як на латиниці: CapsLock і Shift на кирилиці", () => {
    expect(
      matchesShortcut(
        press({ key: "Л", code: "KeyK", ctrlKey: true }),
        SHORTCUTS.palette,
      ),
    ).toBe(true)
    expect(
      matchesShortcut(
        press({ key: "И", code: "KeyB", ctrlKey: true, shiftKey: true }),
        SHORTCUTS.sidebar,
      ),
    ).toBe(false)
  })

  it("без модифікатора кирилиця не спрацьовує", () => {
    expect(
      matchesShortcut(press({ key: "л", code: "KeyK" }), SHORTCUTS.palette),
    ).toBe(false)
  })

  it("AltGr і Option друкують символ: це набір тексту, а не клавіша", () => {
    expect(
      matchesShortcut(
        press({ key: "ł", code: "KeyK", ctrlKey: true, altKey: true }),
        SHORTCUTS.palette,
      ),
    ).toBe(false)
    expect(
      matchesShortcut(
        press({ key: "˚", code: "KeyK", metaKey: true, altKey: true }),
        SHORTCUTS.palette,
      ),
    ).toBe(false)
  })

  it("письмо без регістру: Ctrl+B працює, Ctrl+Shift+B лишається браузеру", () => {
    expect(
      matchesShortcut(
        press({ key: "נ", code: "KeyB", ctrlKey: true }),
        SHORTCUTS.sidebar,
      ),
    ).toBe(true)
    expect(
      matchesShortcut(
        press({ key: "נ", code: "KeyB", ctrlKey: true, shiftKey: true }),
        SHORTCUTS.sidebar,
      ),
    ).toBe(false)
  })

  it("Dvorak: важить літера, а не місце клавіші", () => {
    expect(
      matchesShortcut(
        press({ key: "t", code: "KeyK", ctrlKey: true }),
        SHORTCUTS.palette,
      ),
    ).toBe(false)
  })
})

describe("canFireShortcut", () => {
  const fired = (target: Element, shortcut: ShortcutId, cancelable = true) => {
    const event = new KeyboardEvent("keydown", {
      key: "?",
      bubbles: true,
      cancelable,
    })
    let allowed = false
    window.addEventListener(
      "keydown",
      (seen) => {
        allowed = canFireShortcut(seen, SHORTCUTS[shortcut])
      },
      { once: true },
    )
    document.body.append(target)
    target.dispatchEvent(event)
    target.remove()
    return allowed
  }
  const element = (tag: string, role?: string) => {
    const node = document.createElement(tag)
    if (role) node.setAttribute("role", role)
    return node
  }

  it("палітра працює й у полі вводу, сайдбар — ні", () => {
    expect(fired(element("input"), "palette")).toBe(true)
    expect(fired(element("input"), "sidebar")).toBe(false)
    expect(fired(element("textarea"), "sidebar")).toBe(false)
    expect(fired(element("select"), "sidebar")).toBe(false)
    expect(fired(element("button"), "sidebar")).toBe(true)
  })

  it("«?» не заважає полю, списку, меню й діалогу", () => {
    expect(fired(element("button"), "help")).toBe(true)
    expect(fired(element("input"), "help")).toBe(false)
    for (const role of ["combobox", "listbox", "menu", "dialog", "alertdialog"])
      expect(fired(element("div", role), "help")).toBe(false)
    const dialog = element("div", "dialog")
    dialog.append(element("button"))
    document.body.append(dialog)
    const inner = dialog.querySelector("button")
    let allowed = true
    window.addEventListener(
      "keydown",
      (seen) => {
        allowed = canFireShortcut(seen, SHORTCUTS.help)
      },
      { once: true },
    )
    inner?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", bubbles: true }),
    )
    dialog.remove()
    expect(allowed).toBe(false)
  })

  it("«?» не бере символ, який компонент уже забрав собі", () => {
    const field = element("button")
    field.addEventListener("keydown", (event) => {
      event.preventDefault()
    })
    expect(fired(field, "help")).toBe(false)
  })

  it("клавіша-символ проекту під тим самим захистом без окремої ознаки", () => {
    const projectKey = { keys: [{ key: "n" }] }
    const allowedOn = (target: Element) => {
      let allowed = false
      window.addEventListener(
        "keydown",
        (seen) => {
          allowed = canFireShortcut(seen, projectKey)
        },
        { once: true },
      )
      document.body.append(target)
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "n", bubbles: true }),
      )
      target.remove()
      return allowed
    }
    expect(isCharacterShortcut(projectKey)).toBe(true)
    expect(isCharacterShortcut(SHORTCUTS.palette)).toBe(false)
    expect(allowedOn(element("button"))).toBe(true)
    expect(allowedOn(element("div", "menu"))).toBe(false)
    setCharacterShortcutsEnabled(false)
    expect(allowedOn(element("button"))).toBe(false)
  })

  it("оболонка редактора клітинки, поки він вантажиться, символ не віддає", () => {
    const shell = element("div", "group")
    shell.setAttribute("data-grid-skip", "")
    expect(fired(shell, "help")).toBe(false)
  })

  it("вимкнена «?» не спрацьовує, Ctrl+K і далі працює", () => {
    setCharacterShortcutsEnabled(false)
    expect(fired(element("button"), "help")).toBe(false)
    expect(fired(element("button"), "palette")).toBe(true)
    setCharacterShortcutsEnabled(true)
    expect(fired(element("button"), "help")).toBe(true)
  })
})

describe("вимикач символьних клавіш", () => {
  it("тримає вибір у сховищі", () => {
    expect(areCharacterShortcutsEnabled()).toBe(true)
    setCharacterShortcutsEnabled(false)
    expect(areCharacterShortcutsEnabled()).toBe(false)
    setCharacterShortcutsEnabled(true)
    expect(areCharacterShortcutsEnabled()).toBe(true)
  })

  it("вибір з іншої вкладки доходить до відкритої довідки", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCharacterShortcuts(listener)
    window.dispatchEvent(new StorageEvent("storage"))
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    window.dispatchEvent(new StorageEvent("storage"))
    expect(listener).toHaveBeenCalledOnce()
  })

  it("сховище недоступне: вимикач усе одно діє", () => {
    const blocked = () => {
      throw new DOMException("заборонено", "SecurityError")
    }
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(blocked)
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(blocked)
    setCharacterShortcutsEnabled(false)
    expect(areCharacterShortcutsEnabled()).toBe(false)
    setItem.mockRestore()
    getItem.mockRestore()
    vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(blocked)
    setCharacterShortcutsEnabled(true)
    vi.restoreAllMocks()
    expect(areCharacterShortcutsEnabled()).toBe(true)
  })
})

describe("підписи", () => {
  it("Ctrl чи ⌘ за платформою, стрілки символами", () => {
    const [palette] = SHORTCUTS.palette.keys
    expect(comboLabel(palette, true)).toBe("⌘K")
    expect(comboLabel(palette, false)).toBe("Ctrl K")
    const [home] = SHORTCUTS.gridEdge.keys
    expect(comboLabel(home, true)).toBe("Ctrl Home")
    expect(comboLabel(SHORTCUTS.gridMove.keys[0], false)).toBe("↑")
    expect(comboLabel(SHORTCUTS.dialogClose.keys[0], false)).toBe("Esc")
  })

  it("aria-keyshortcuts як раніше: Meta+K і Control+K", () => {
    expect(ariaKeyShortcuts(SHORTCUTS.palette, true)).toBe("Meta+K")
    expect(ariaKeyShortcuts(SHORTCUTS.palette, false)).toBe("Control+K")
  })

  it("aria-keyshortcuts бере назви клавіш, а не символи з екрана", () => {
    expect(ariaKeyShortcuts(SHORTCUTS.paletteMove, false)).toBe(
      "ArrowUp ArrowDown",
    )
    expect(ariaKeyShortcuts(SHORTCUTS.gridEdge, false)).toBe(
      "Control+Home Control+End",
    )
  })

  it("скрінрідер чує модифікатор і біля символа зі словом", () => {
    render(<ShortcutKeys shortcut={{ keys: [{ key: "-", mod: true }] }} />)
    expect(screen.getByText("Ctrl мінус")).toBeInTheDocument()
  })

  it("на Mac скрінрідер чує Command словом, а не значок", () => {
    const userAgent = vi
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue("Macintosh")
    render(<ShortcutKeys shortcut={SHORTCUTS.palette} />)
    expect(screen.getByText("Command K")).toBeInTheDocument()
    expect(screen.getByText("⌘K")).toHaveAttribute("aria-hidden", "true")
    userAgent.mockRestore()
  })

  it("варіанти однієї дії розділені словом «або»", () => {
    const { container } = render(
      <ShortcutKeys shortcut={SHORTCUTS.gridEnter} />,
    )
    expect(container).toHaveTextContent("Enter або F2")
  })
})

describe("реєстр не розходиться з кодом і мовними пакетами", () => {
  const ids = Object.keys(SHORTCUTS) as ShortcutId[]

  it("кожна клавіша має підпис і групу uk та en", () => {
    for (const id of ids) {
      expect(uk.shortcuts.items[id]).toBeTruthy()
      expect(en.shortcuts.items[id]).toBeTruthy()
      expect(SHORTCUT_GROUPS).toContain(SHORTCUTS[id].group)
    }
    for (const group of SHORTCUT_GROUPS) {
      expect(uk.shortcuts.groups[group]).toBeTruthy()
      expect(en.shortcuts.groups[group]).toBeTruthy()
      expect(ids.some((id) => SHORTCUTS[id].group === group)).toBe(true)
    }
  })

  it("клавіші гріда з реєстру справді рухають фокус", () => {
    const bounds = { rowCount: 10, colCount: 3, pageRows: 2 }
    const from = { row: 5, col: 1 }
    for (const shortcut of [
      SHORTCUTS.gridMove,
      SHORTCUTS.gridRowEdge,
      SHORTCUTS.gridPage,
      SHORTCUTS.gridEdge,
    ])
      for (const { key } of shortcut.keys) {
        expect(isGridNavigationKey(key)).toBe(true)
        expect(moveInGrid(from, key, key === "Home", bounds)).not.toBeNull()
      }
    expect(isGridNavigationKey("Enter")).toBe(false)
    expect(isGridNavigationKey("a")).toBe(false)
  })

  it("«=» на клавіші «+» збільшує фото, у довідці його немає", () => {
    expect(isShortcutKey(SHORTCUTS.avatarZoomIn, "=")).toBe(true)
    expect(SHORTCUTS.avatarZoomIn.keys.map(({ key }) => key)).toEqual(["+"])
  })
})

function HelpHarness({ extra }: { extra?: boolean }) {
  const [open, setOpen] = useState(false)
  const onPress = useCallback(() => {
    setOpen(true)
  }, [])
  useShortcut(SHORTCUTS.help, onPress)
  return (
    <>
      <input aria-label="Поле" />
      <button type="button">Кнопка</button>
      <ShortcutsHelp
        open={open}
        onOpenChange={setOpen}
        extra={
          extra
            ? [
                {
                  id: "invoice",
                  label: "Створити рахунок",
                  keys: [{ key: "i", mod: true }],
                },
              ]
            : undefined
        }
      />
    </>
  )
}

describe("ShortcutsHelp", () => {
  it("«?» відкриває довідку з групами реєстру; у полі вводу — ні", async () => {
    const user = userEvent.setup()
    render(<HelpHarness />)
    await user.click(screen.getByRole("textbox", { name: "Поле" }))
    await user.keyboard("?")
    expect(screen.queryByRole("dialog")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Кнопка" }))
    await user.keyboard("?")
    const dialog = await screen.findByRole("dialog", {
      name: "Гарячі клавіші",
    })
    expect(
      await within(dialog).findByRole("heading", { name: "Таблиця" }),
    ).toBeVisible()
    expect(within(dialog).getAllByRole("heading", { level: 3 }).length).toBe(
      SHORTCUT_GROUPS.length,
    )
    expect(
      within(dialog).getByText("Перейти на сусідню клітинку"),
    ).toBeVisible()
    // Символ — на екрані, слово — скрінрідеру.
    expect(within(dialog).getAllByText("стрілка вгору").length).toBeGreaterThan(
      0,
    )
  })

  it("перемикач вимикає «?»: рядок каже «вимкнено», клавіша не відкриває", async () => {
    const user = userEvent.setup()
    render(<HelpHarness />)
    await user.click(screen.getByRole("button", { name: "Кнопка" }))
    await user.keyboard("?")
    const dialog = await screen.findByRole("dialog", {
      name: "Гарячі клавіші",
    })
    const toggle = await within(dialog).findByRole("switch", {
      name: "Клавіші на весь застосунок з одним символом, як ?",
    })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    expect(toggle).not.toBeChecked()
    const row = within(dialog)
      .getByText("Показати гарячі клавіші")
      .closest("div")
    expect(row).toHaveTextContent("вимкнено")
    expect(areCharacterShortcutsEnabled()).toBe(false)

    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    await user.click(screen.getByRole("button", { name: "Кнопка" }))
    await user.keyboard("?")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("клавіші проекту — окремою групою наприкінці", async () => {
    render(<HelpHarness extra />)
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))
    })
    const dialog = await screen.findByRole("dialog", {
      name: "Гарячі клавіші",
    })
    const headings = await within(dialog).findAllByRole("heading", {
      level: 3,
    })
    expect(headings.at(-1)).toHaveTextContent("Цей застосунок")
    expect(within(dialog).getByText("Створити рахунок")).toBeVisible()
  })
})
