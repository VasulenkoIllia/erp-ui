import { render, renderHook, screen } from "@testing-library/react"
import { FileIcon } from "lucide-react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { PreloadableComponent } from "@/registry/lib/lazy"
import {
  createModule,
  createModuleContext,
  moduleNavItems,
  type ModuleContextValue,
  type ModuleNavItem,
} from "@/registry/lib/module"

/** Каркас модуля (ADR-0085): маршрути, перехід з адреси модуля, прогрів чанка, контекст і пункти меню. */
type NotesValue = ModuleContextValue<
  { readonly title?: string },
  NotesPaths
> & {
  readonly owner: string
}

interface NotesPaths {
  readonly notes: string
}

const [NotesContext, useNotesModule] = createModuleContext<NotesValue>(
  "X1-notes",
  "createNotesModule",
)

/** Сторінка, яка показує, що бачить з контексту модуля. */
function page(name: string) {
  function Page() {
    const { extension, owner, paths, preload } = useNotesModule()
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

  it("сторінка маршруту бачить значення фабрики й `preload`; адреса модуля веде на `home`", () => {
    const { module } = notesModule("/work", "/work/notes")
    const router = createMemoryRouter(module.routes, {
      initialEntries: ["/work"],
    })
    render(<RouterProvider router={router} />)
    expect(
      screen.getByText("list Нотатки Олена /work/notes function"),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe("/work/notes")
  })
})

describe("createModuleContext", () => {
  it("хук модуля поза маршрутами фабрики кидає помилку з назвою модуля", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => renderHook(() => useNotesModule())).toThrow(
      "X1-notes: page rendered outside routes of createNotesModule()",
    )
    vi.restoreAllMocks()
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
