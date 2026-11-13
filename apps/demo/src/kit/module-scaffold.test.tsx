import { act, render, renderHook, screen } from "@testing-library/react"
import { FileIcon } from "lucide-react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { createI18n } from "@/registry/lib/i18n"
import {
  createModuleT,
  type ModuleStrings,
} from "@/registry/lib/i18n-namespaces"
import type { PreloadableComponent } from "@/registry/lib/lazy"
import {
  createModule,
  createModuleContext,
  moduleNavId,
  moduleNavItems,
  type ModuleContextValue,
  type ModuleNavItem,
} from "@/registry/lib/module"

/** Каркас модуля (ADR-0085): маршрути, перехід з адреси модуля, прогрів чанка, контекст і пункти меню. */
type NotesValue = ModuleContextValue<NotesExtension, NotesPaths> & {
  readonly owner: string
}

interface NotesExtension {
  readonly title?: string
  readonly strings?: ModuleStrings<NotesMessages>
}

interface NotesMessages {
  readonly title: string
  readonly lead: string
}

interface NotesPaths {
  readonly notes: string
}

const [NotesContext, useNotesModule] = createModuleContext<NotesValue>(
  "X1-notes",
  "createNotesModule",
)

/** Що бачать сторінки з контексту модуля, по виклику на рендер. */
const seen = vi.fn<(value: NotesValue) => void>()

/** Сторінка, яка показує, що бачить з контексту модуля. */
function page(name: string) {
  function Page() {
    const value = useNotesModule()
    seen(value)
    const { extension, owner, paths, preload } = value
    return (
      <p>
        {name} {extension.title} {owner} {paths.notes} {typeof preload}
      </p>
    )
  }
  return Object.assign(Page, {
    preload: vi.fn(() => Promise.resolve()),
  }) satisfies PreloadableComponent<object>
}

function notesModule(basePath = "/work", home?: string) {
  const pages = { list: page("list"), form: page("form"), card: page("card") }
  const paths = { notes: `${basePath}/notes` }
  const module = createModule({
    id: "X1",
    basePath,
    paths,
    pages: [
      { path: paths.notes, page: pages.list },
      { path: `${paths.notes}/new`, page: pages.form },
      { path: `${paths.notes}/:id`, page: pages.card },
    ],
    home,
    nav: [],
    resources: [],
    context: NotesContext,
    value: { extension: { title: "Нотатки" }, paths, owner: "Олена" },
  })
  return { module, pages }
}

describe("createModule", () => {
  it("сторінки — маршрутами в порядку опису, адреса модуля веде на `home`", () => {
    const { module } = notesModule("/work", "/work/notes")
    expect(module.routes.map((route) => route.path)).toEqual([
      "/work/notes",
      "/work/notes/new",
      "/work/notes/:id",
      "/work",
    ])
  })

  it("без `basePath` чи `home` — без переходу з адреси модуля", () => {
    expect(notesModule("", "/notes").module.routes).toHaveLength(3)
    expect(notesModule("/work").module.routes).toHaveLength(3)
  })

  it("прогріває чанк за тими самими маршрутами, що й роутер", () => {
    const { module, pages } = notesModule()
    module.preload("/work/notes/new?copy=1")
    expect(pages.form.preload).toHaveBeenCalledTimes(1)
    expect(pages.card.preload).not.toHaveBeenCalled()
    module.preload("/work/notes/42#lines")
    expect(pages.card.preload).toHaveBeenCalledTimes(1)
    module.preload("/work/other")
    module.preload("/work/notes/42/history")
    expect(pages.list.preload).not.toHaveBeenCalled()
    expect(pages.card.preload).toHaveBeenCalledTimes(1)
  })

  it("сторінка маршруту бачить значення фабрики й `preload`; адреса модуля веде на `home`", async () => {
    const { module } = notesModule("/work", "/work/notes")
    const router = createMemoryRouter(module.routes, {
      initialEntries: ["/work"],
    })
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByText("list Нотатки Олена /work/notes function"),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe("/work/notes")
  })

  it("одне значення контексту на всі сторінки модуля, `preload` — той самий, що в модуля", async () => {
    seen.mockClear()
    const { module } = notesModule()
    const router = createMemoryRouter(module.routes, {
      initialEntries: ["/work/notes"],
    })
    render(<RouterProvider router={router} />)
    await screen.findByText(/^list/)
    await act(() => router.navigate("/work/notes/7"))
    await screen.findByText(/^card/)
    const values = seen.mock.calls.map(([value]) => value)
    expect(new Set(values).size).toBe(1)
    expect(values[0]?.preload).toBe(module.preload)
  })
})

describe("createModuleContext", () => {
  it("хук модуля поза маршрутами фабрики кидає помилку з назвою модуля", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      expect(() => renderHook(() => useNotesModule())).toThrow(
        "X1-notes: page rendered outside routes of createNotesModule()",
      )
    } finally {
      quiet.mockRestore()
    }
  })
})

describe("createModuleT", () => {
  it("рядки модуля з перевизначеннями `strings` розширення з хука модуля", () => {
    createI18n()
    const useNotesT = createModuleT<NotesMessages>(
      "X1-notes",
      { title: "Нотатки", lead: "Усі нотатки" },
      () => Promise.resolve({ title: "Notes", lead: "All notes" }),
      useNotesModule,
    )
    function Heading() {
      const t = useNotesT()
      return (
        <h1>
          {t("title")}: {t("lead")}
        </h1>
      )
    }
    render(
      <NotesContext.Provider
        value={{
          extension: { strings: { uk: { lead: "Мої нотатки" } } },
          paths: { notes: "/notes" },
          owner: "",
          preload: () => undefined,
        }}
      >
        <Heading />
      </NotesContext.Provider>,
    )
    expect(
      screen.getByRole("heading", { name: "Нотатки: Мої нотатки" }),
    ).toBeTruthy()
  })
})

describe("moduleNavItems", () => {
  const nav: ModuleNavItem[] = [
    {
      id: "X1-notes",
      label: { uk: "Нотатки", en: "Notes" },
      href: "/notes",
      icon: FileIcon,
    },
    {
      id: "X1-archive",
      label: { uk: "Архів" },
      href: "/archive",
      icon: FileIcon,
      access: { resource: "notes", action: "delete" },
    },
  ]

  it("пункт із правом — лише тому, хто його має; підпис мовою інтерфейсу", () => {
    expect(moduleNavItems(nav, "en", ["notes:delete"])).toEqual([
      { id: "X1-notes", label: "Notes", href: "/notes", icon: FileIcon },
      { id: "X1-archive", label: "Архів", href: "/archive", icon: FileIcon },
    ])
    expect(
      moduleNavItems(nav, "uk", ["notes:read"]).map((item) => item.id),
    ).toEqual(["X1-notes"])
  })

  it("поки права не відомі, пунктів із правом немає", () => {
    expect(moduleNavItems(nav, "uk", undefined).map((item) => item.id)).toEqual(
      ["X1-notes"],
    )
  })
})

describe("moduleNavId", () => {
  const nav: ModuleNavItem[] = [
    {
      id: "X1-settings",
      label: "Налаштування",
      href: "/settings",
      icon: FileIcon,
    },
    { id: "X1-users", label: "Люди", href: "/settings/users", icon: FileIcon },
    { id: "X1-notes", label: "Нотатки", href: "/notes", icon: FileIcon },
  ]

  it("пункт сторінки чи її списку; з кількох — найдовша адреса", () => {
    expect(moduleNavId(nav, "/notes")).toBe("X1-notes")
    expect(moduleNavId(nav, "/notes/7/edit")).toBe("X1-notes")
    expect(moduleNavId(nav, "/settings/users/3")).toBe("X1-users")
    expect(moduleNavId(nav, "/settings/roles")).toBe("X1-settings")
  })

  it("адреса поза пунктами модуля — без активного пункту", () => {
    expect(moduleNavId(nav, "/notes-archive")).toBeUndefined()
    expect(moduleNavId(nav, "/")).toBeUndefined()
    // Пункт `/` — лише на самій головній: інакше він був би активним на кожній сторінці.
    const home: ModuleNavItem = {
      id: "X1-home",
      label: "Головна",
      href: "/",
      icon: FileIcon,
    }
    expect(moduleNavId([home], "/")).toBe("X1-home")
    expect(moduleNavId([home], "/notes")).toBeUndefined()
  })
})
