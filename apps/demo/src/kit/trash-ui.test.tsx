import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext, useGetOne } from "@/registry/lib/ra-core"
import type * as React from "react"
import { MemoryRouter, Route, Routes } from "react-router"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"
import { z } from "zod"

import { DocumentDeleteAction } from "@/registry/erp/document-delete-action"
import { TrashLink } from "@/registry/erp/trash-link"
import { TrashView } from "@/registry/erp/trash-view"
import { createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { createAuthProvider } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { createTrashMocks } from "@/registry/lib/mock-trash"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createQueryClient } from "@/registry/lib/query-client"
import { Toaster } from "@/registry/ui/sonner"

/**
 * Крок PF16 (ADR-0095): кошик в інтерфейсі — рядки з автором і строком, відновлення з фокусом на
 * сусідній рядок, 409 словами кошика, стани; «Видалити» без підтвердження зі «Скасувати», без кошика —
 * з підтвердженням; кнопка «Кошик» лише з кошиком і правом.
 */
const BASE = "http://erp.test/api/v1"

const noteSchema = recordBaseSchema.extend({
  name: z.string(),
  sku: z.string(),
})
type Note = z.infer<typeof noteSchema>
const rowSchema = z.object({ name: z.string(), sku: z.string() })

const trash = createTrashMocks({ baseUrl: BASE })

const notes = createResourceHandlers<Note>({
  baseUrl: BASE,
  resource: "notes",
  schema: noteSchema,
  data: () => [
    { id: "n1", version: 1, name: "Перша", sku: "A-1" },
    { id: "n2", version: 1, name: "Друга", sku: "A-2" },
    { id: "n3", version: 1, name: "Третя", sku: "A-3" },
    { id: "n4", version: 1, name: "Четверта", sku: "A-4" },
  ],
  unique: ["sku"],
  trash: {
    bin: trash.bin,
    deleted: [
      { id: "n2", daysAgo: 2 },
      { id: "n3", daysAgo: 28 },
    ],
  },
})

const tags = createResourceHandlers<Note>({
  baseUrl: BASE,
  resource: "tags",
  schema: noteSchema,
  data: () => [{ id: "t1", version: 1, name: "Тег", sku: "T-1" }],
})

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: `Людина ${id}`,
  email: `${id}@test.example`,
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [
      user("admin", ["notes:*", "tags:*"]),
      user("reader", ["notes:read", "tags:read"]),
    ],
  }),
  ...trash.handlers,
  ...notes.handlers,
  ...tags.handlers,
)

const DELETE_TEXTS = {
  button: "Видалити нотатку",
  denied: "Видаляти нотатки може адміністратор",
  done: "Нотатку видалено",
  title: "Видалити нотатку?",
  description: "Нотатка зникне назавжди.",
  confirm: "Видалити",
  trashed: "Нотатку перенесено в кошик",
}

/** Картка запису з «Видалити»: після видалення — список. */
function NoteCard({ resource, id }: { resource: string; id: string }) {
  const { data } = useGetOne<Note>(resource, { id })
  if (!data) return null
  return (
    <DocumentDeleteAction
      resource={resource}
      document={data}
      listPath="/list"
      texts={DELETE_TEXTS}
      name={data.name}
      lockReason={undefined}
    />
  )
}

/** Кнопка в сповіщенні — клавішею: sonner на pointerdown бере `setPointerCapture`, якого jsdom не має. */
async function pressToastButton(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  screen.getByRole("button", { name }).focus()
  await user.keyboard("{Enter}")
}

function renderAt(node: React.ReactNode, id = "admin") {
  signInMock(id)
  const client = createApiClient({ baseUrl: BASE })
  const authProvider = createAuthProvider(client, { baseUrl: BASE })
  render(
    <MemoryRouter initialEntries={["/screen"]}>
      <CoreAdminContext
        authProvider={authProvider}
        dataProvider={createDataProvider(client)}
        queryClient={createQueryClient()}
      >
        <Routes>
          <Route path="/screen" element={node} />
          <Route path="/list" element={<p>Список нотаток</p>} />
          <Route path="/notes/:id" element={<p>Картка нотатки</p>} />
        </Routes>
        <Toaster />
      </CoreAdminContext>
    </MemoryRouter>,
  )
}

const notesTrash = (
  <TrashView
    resource="notes"
    schema={rowSchema}
    rowLabel={(note) => note.name}
    rowDescription={(note) => `Код ${note.sku}`}
    recordHref={(id) => `/notes/${id}`}
  />
)

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  localStorage.clear()
  trash.reset()
  notes.db.reset()
  tags.db.reset()
  resetScenarios()
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("TrashView", () => {
  it("рядки новіші першими: назва, опис, строк; за три дні до кінця — попередження словами", async () => {
    renderAt(notesTrash)
    const list = await screen.findByRole("list", { name: "Видалені записи" })
    const rows = within(list).getAllByRole("listitem")
    expect(
      rows.map(
        (row) => within(row).getByText(/^(Перша|Друга|Третя)$/).textContent,
      ),
    ).toEqual(["Друга", "Третя"])
    expect(within(rows[0]).getByText("Код A-2")).toBeTruthy()
    expect(within(rows[0]).getByText(/^Зникне назавжди/)).toBeTruthy()
    expect(within(rows[1]).getByText(/^Скоро зникне назавжди/)).toBeTruthy()
    expect(
      screen.getByText(
        "Видалені записи лежать тут 30 днів, потім сервер видаляє їх назавжди.",
      ),
    ).toBeTruthy()
  })

  it("«Відновити»: сповіщення з «Відкрити», рядок зникає, фокус — на сусідній рядок", async () => {
    const user = userEvent.setup()
    renderAt(notesTrash)
    await user.click(
      await screen.findByRole("button", { name: "Відновити: Друга" }),
    )
    expect(await screen.findByText("Відновлено: Друга")).toBeTruthy()
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Відновити: Друга" }),
      ).toBeNull()
    })
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Відновити: Третя" }),
    )
    expect(notes.db.all().map((note) => note.id)).toContain("n2")
    await pressToastButton(user, "Відкрити")
    expect(await screen.findByText("Картка нотатки")).toBeTruthy()
  })

  it("місце зайняв інший запис — причина словами кошика, рядок лишається", async () => {
    const user = userEvent.setup()
    setScenario("conflict", "trash")
    renderAt(notesTrash)
    await user.click(
      await screen.findByRole("button", { name: "Відновити: Третя" }),
    )
    expect(
      await screen.findByText(/^Відновити не можна: поки запис лежав у кошику/),
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Відновити: Третя" }),
    ).toBeTruthy()
  })

  it("порожній кошик, немає права, бекенд без кошика", async () => {
    setScenario("empty", "trash")
    renderAt(notesTrash)
    expect(await screen.findByText("Кошик порожній")).toBeTruthy()
  })

  it("без права видаляти — немає доступу", async () => {
    renderAt(notesTrash, "reader")
    expect(await screen.findByText(/немає доступу|Немає доступу/)).toBeTruthy()
  })

  it("бекенд без кошика (404) — пояснення, а не помилка", async () => {
    server.use(
      http.get(`${BASE}/trash`, () =>
        HttpResponse.json({ code: "not_found", message: "x" }, { status: 404 }),
      ),
    )
    renderAt(notesTrash)
    expect(
      await screen.findByText(
        "Сервер цього застосунку не веде кошика: видалені записи не зберігаються.",
      ),
    ).toBeTruthy()
  })
})

describe("«Видалити» з кошиком і без нього", () => {
  it("з кошиком — без підтвердження, «Скасувати» повертає запис", async () => {
    const user = userEvent.setup()
    renderAt(<NoteCard resource="notes" id="n1" />)
    await user.click(
      await screen.findByRole("button", { name: "Видалити нотатку" }),
    )
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(await screen.findByText("Нотатку перенесено в кошик")).toBeTruthy()
    expect(await screen.findByText("Список нотаток")).toBeTruthy()
    expect(trash.entries("notes").map((entry) => entry.record.id)).toContain(
      "n1",
    )
    await pressToastButton(user, "Скасувати")
    expect(await screen.findByText("Відновлено: Перша")).toBeTruthy()
    expect(notes.db.all().map((note) => note.id)).toContain("n1")
  })

  it("без кошика — підтвердження з наслідком і видалення назавжди", async () => {
    const user = userEvent.setup()
    renderAt(<NoteCard resource="tags" id="t1" />)
    await user.click(
      await screen.findByRole("button", { name: "Видалити нотатку" }),
    )
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Нотатка зникне назавжди.")).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: "Видалити" }))
    expect(await screen.findByText("Нотатку видалено")).toBeTruthy()
    expect(tags.db.all()).toEqual([])
  })

  it("налаштування кошика не прочитались — видалення з підтвердженням", async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${BASE}/trash/settings`, () =>
        HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }),
      ),
    )
    renderAt(<NoteCard resource="notes" id="n1" />)
    // Налаштування читаються з одним повтором: кнопка з'являється після нього.
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Видалити нотатку" },
        { timeout: 5_000 },
      ),
    )
    expect(await screen.findByRole("alertdialog")).toBeTruthy()
  })
})

describe("TrashLink", () => {
  it("з кошиком і правом — посилання; без кошика ресурсу чи без права — нічого", async () => {
    renderAt(
      <>
        <TrashLink resource="notes" to="/notes-trash" />
        <TrashLink resource="tags" to="/tags-trash" />
        <p>Готово</p>
      </>,
    )
    const link = await screen.findByRole("link", { name: "Кошик" })
    expect(link.getAttribute("href")).toBe("/notes-trash")
    await waitFor(() => {
      expect(screen.getAllByRole("link")).toHaveLength(1)
    })
  })

  it("без права видаляти — кнопки немає", async () => {
    renderAt(
      <>
        <TrashLink resource="notes" to="/notes-trash" />
        <p>Готово</p>
      </>,
      "reader",
    )
    await screen.findByText("Готово")
    await waitFor(() => {
      expect(trash.entries("notes")).toHaveLength(2)
    })
    expect(screen.queryByRole("link", { name: "Кошик" })).toBeNull()
  })
})
