import { QueryClient } from "@tanstack/react-query"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CoreAdminContext,
  type DataProvider,
  type GetListParams,
} from "ra-core"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  RecordPicker,
  type RecordPickerProps,
} from "@/registry/erp/record-picker"
import { ApiError } from "@/registry/lib/api"
import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { Dialog, DialogContent, DialogTitle } from "@/registry/ui/dialog"

/** Крок 1.3a (ADR-0023): вибір запису з пошуком на сервері (UI40). */

interface Org {
  id: string
  name: string
  code: string
}

const ORGS: Org[] = Array.from({ length: 45 }, (_, i) => ({
  id: `org-${String(i + 1)}`,
  name: i === 0 ? "ТОВ «Дніпро Трейд»" : `ТОВ «Організація ${String(i + 1)}»`,
  code: String(41_234_000 + i),
}))

/** Пошук `q` із фільтра запиту списку. */
function queryOf(params: GetListParams): string {
  const filter = params.filter as Record<string, unknown> | undefined
  return typeof filter?.q === "string" ? filter.q : ""
}

function fakeServer({ failList = false } = {}) {
  const getList = vi.fn((_resource: string, params: GetListParams) => {
    if (failList)
      return Promise.reject(
        new ApiError(500, { code: "internal", message: "boom" }),
      )
    const q = queryOf(params)
    const found = ORGS.filter((org) =>
      org.name.toLocaleLowerCase("uk").includes(q.toLocaleLowerCase("uk")),
    )
    const perPage = params.pagination?.perPage ?? 20
    return Promise.resolve({
      data: found.slice(0, perPage),
      total: found.length,
    })
  })
  const getOne = vi.fn((_resource: string, { id }: { id: unknown }) => {
    const org = ORGS.find((o) => o.id === id)
    return org
      ? Promise.resolve({ data: org })
      : Promise.reject(new ApiError(404, { code: "not_found", message: "no" }))
  })
  return { getList, getOne } as unknown as DataProvider & {
    getList: typeof getList
    getOne: typeof getOne
  }
}

/** Ширина вікна для `useBreakpoint`: десктоп — усі `min-width` збігаються, телефон — жоден. */
function mockWindow(isDesktop: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: isDesktop && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

type PickerOptions = Partial<RecordPickerProps<Org>> & {
  initial?: string | null
}

function renderPicker(
  dataProvider: DataProvider,
  { initial = null, ...props }: PickerOptions = {},
  permissions = ["orgs:*"],
  /** Поле у формі-діалозі: зміни відкриття діалогу. */
  onDialogChange?: () => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData<Me>(ME_QUERY_KEY, {
    id: "u1",
    name: "Оксана",
    email: "o@example.com",
    roles: [],
    permissions,
    companies: [],
    companyId: null,
    factors: [],
  })
  const onValueChange = vi.fn()
  const onBlur = vi.fn()
  function Field() {
    const [value, setValue] = useState(initial)
    return (
      <>
        <label htmlFor="org">Компанія</label>
        <RecordPicker<Org>
          id="org"
          resource="orgs"
          label="Компанія"
          value={value}
          onValueChange={(id, record) => {
            onValueChange(id, record)
            setValue(id)
          }}
          onBlur={onBlur}
          optionLabel={(org) => org.name}
          optionDescription={(org) => `ЄДРПОУ ${org.code}`}
          {...props}
        />
      </>
    )
  }
  render(
    <CoreAdminContext dataProvider={dataProvider} queryClient={queryClient}>
      {onDialogChange ? (
        <Dialog open onOpenChange={onDialogChange}>
          <DialogContent>
            <DialogTitle>Новий контакт</DialogTitle>
            <Field />
          </DialogContent>
        </Dialog>
      ) : (
        <Field />
      )}
    </CoreAdminContext>,
  )
  return { onValueChange, onBlur }
}

describe("RecordPicker: пошук на сервері й вибір", () => {
  it("відкриття — перша сторінка без q; пошук — із паузою; вибір ставить id і підпис", async () => {
    mockWindow(true)
    const server = fakeServer()
    const { onValueChange, onBlur } = renderPicker(server)
    const user = userEvent.setup()
    const field = screen.getByRole("combobox", { name: "Компанія" })
    expect(field).toHaveTextContent("Виберіть…")

    await user.click(field)
    expect(
      await screen.findByText("Показано 20 з 45. Уточніть пошук."),
    ).toBeInTheDocument()
    expect(server.getList).toHaveBeenLastCalledWith(
      "orgs",
      expect.objectContaining({
        filter: {},
        pagination: { page: 1, perPage: 20 },
      }),
    )

    await user.type(
      screen.getByRole("combobox", { name: "Пошук: Компанія" }),
      "дніпро",
    )
    await waitFor(() => {
      expect(server.getList).toHaveBeenLastCalledWith(
        "orgs",
        expect.objectContaining({ filter: { q: "дніпро" } }),
      )
    })
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1)
    })
    const option = screen.getByRole("option", { name: /ТОВ «Дніпро Трейд»/ })
    // Пауза: на кожну літеру окремого запиту немає.
    expect(server.getList.mock.calls.filter(([, p]) => queryOf(p)).length).toBe(
      1,
    )
    expect(option).toHaveTextContent("ЄДРПОУ 41234000")
    expect(screen.getByRole("status")).toHaveTextContent("Знайдено 1 запис")

    await user.click(option)
    expect(onValueChange).toHaveBeenCalledWith("org-1", ORGS[0])
    expect(field).toHaveTextContent("ТОВ «Дніпро Трейд»")
    // Щойно вибраний запис не перечитується.
    expect(server.getOne).not.toHaveBeenCalled()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it("Enter під час паузи пошуку нічого не вибирає; після відповіді — перший знайдений", async () => {
    mockWindow(true)
    const server = fakeServer()
    const { onValueChange } = renderPicker(server)
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Компанія" }))
    await screen.findByText("Показано 20 з 45. Уточніть пошук.")
    const search = screen.getByRole("combobox", { name: "Пошук: Компанія" })
    // На екрані ще варіанти без пошуку: Enter не бере перший із них.
    await user.type(search, "дніпро{Enter}")
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.getByRole("status")).toHaveTextContent("Шукаємо…")
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1)
    })
    await user.keyboard("{Enter}")
    expect(onValueChange).toHaveBeenCalledWith("org-1", ORGS[0])
  })

  it("літера на закритому полі відкриває пошук із неї й нічого не вибирає", async () => {
    mockWindow(true)
    const onCreate = vi.fn()
    const { onValueChange } = renderPicker(fakeServer(), {
      create: { onCreate },
    })
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole("combobox", { name: "Компанія" })).toHaveFocus()
    await user.keyboard("Д")
    expect(
      await screen.findByRole("combobox", { name: "Пошук: Компанія" }),
    ).toHaveValue("Д")
    expect(onValueChange).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("значення з сервера: підпис — з getOne; запису немає — «Запис не знайдено»", async () => {
    mockWindow(true)
    const server = fakeServer()
    renderPicker(server, { initial: "org-1" })
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Компанія" }),
      ).toHaveTextContent("ТОВ «Дніпро Трейд»")
    })
    cleanupAndRender(server, "org-999")
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Компанія" }),
      ).toHaveTextContent("Запис не знайдено")
    })
    // Чужий запис сервер теж не віддає: `missingLabel` — текст проекту замість «не знайдено».
    cleanupAndRender(server, "org-999", {
      missingLabel: "Організація прихована",
    })
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Компанія" }),
      ).toHaveTextContent("Організація прихована")
    })
    // Немає права читати довідник — як підпис у списку (A2a), а не «збій».
    server.getOne.mockImplementation(() =>
      Promise.reject(new ApiError(403, { code: "forbidden", message: "no" })),
    )
    cleanupAndRender(server, "org-2")
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Компанія" }),
      ).toHaveTextContent("Немає доступу")
    })
  })

  it("«Створити…»: текст пошуку проекту, без виходу з поля; без права — неактивне з причиною", async () => {
    mockWindow(true)
    const onCreate = vi.fn()
    const { onBlur } = renderPicker(fakeServer(), { create: { onCreate } })
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Компанія" }))
    await user.type(
      await screen.findByRole("combobox", { name: "Пошук: Компанія" }),
      "Нова",
    )
    await user.click(
      await screen.findByRole("option", { name: "Створити «Нова»" }),
    )
    expect(onCreate).toHaveBeenCalledWith("Нова")
    expect(onBlur).not.toHaveBeenCalled()

    cleanupAndRender(fakeServer(), null, {
      create: { onCreate, deniedReason: "Лише для бухгалтера" },
      permissions: ["orgs:read"],
    })
    await user.click(screen.getByRole("combobox", { name: "Компанія" }))
    const denied = await screen.findByRole("option", {
      name: /Створити новий…/,
    })
    expect(denied).toHaveTextContent("Лише для бухгалтера")
    expect(denied).toHaveAttribute("aria-disabled", "true")
  })

  it("помилка списку — повідомлення й «Спробувати ще», що повторює запит", async () => {
    mockWindow(true)
    const server = fakeServer({ failList: true })
    renderPicker(server)
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Компанія" }))
    expect(
      await screen.findByText("Не вдалося завантажити варіанти"),
    ).toBeInTheDocument()
    const calls = server.getList.mock.calls.length
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }))
    await waitFor(() => {
      expect(server.getList.mock.calls.length).toBe(calls + 1)
    })
  })

  it("у формі-діалозі Escape зі списку без варіантів закриває лише список (ADR-0027)", async () => {
    mockWindow(true)
    const onDialogChange = vi.fn()
    renderPicker(fakeServer(), {}, undefined, onDialogChange)
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Компанія" }))
    await user.type(
      await screen.findByRole("combobox", { name: "Пошук: Компанія" }),
      "zzz",
    )
    expect(
      await screen.findByText("За «zzz» нічого не знайдено"),
    ).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(onDialogChange).not.toHaveBeenCalled()
    expect(screen.getByRole("combobox", { name: "Компанія" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })

  it("лише читання: поле в фокусі з підписом, список не відкривається", async () => {
    mockWindow(true)
    const server = fakeServer()
    renderPicker(server, { initial: "org-1", readOnly: true })
    const field = await screen.findByRole("textbox", { name: "Компанія" })
    await waitFor(() => {
      expect(field).toHaveValue("ТОВ «Дніпро Трейд»")
    })
    expect(field).toHaveAttribute("readonly")
    expect(server.getList).not.toHaveBeenCalled()
  })

  it("очищення: значення null, кнопка має назву поля", async () => {
    mockWindow(true)
    const { onValueChange } = renderPicker(fakeServer(), {
      initial: "org-1",
      clearable: true,
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Очистити: Компанія" }))
    expect(onValueChange).toHaveBeenCalledWith(null, null)
    const field = screen.getByRole("combobox", { name: "Компанія" })
    expect(field).toHaveTextContent("Виберіть…")
    // Кнопка «Очистити» зникла — фокус на полі, а не на сторінці.
    expect(field).toHaveFocus()
  })

  it("телефон: нижня шторка з назвою поля, вибір закриває її", async () => {
    mockWindow(false)
    const { onValueChange } = renderPicker(fakeServer())
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Компанія" }))
    const sheet = await screen.findByRole("dialog", { name: "Компанія" })
    await user.click(
      await within(sheet).findByRole("option", { name: /Дніпро Трейд/ }),
    )
    expect(onValueChange).toHaveBeenCalledWith("org-1", ORGS[0])
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
})

/** Новий рендер у тому самому тесті: попередній прибираємо. */
function cleanupAndRender(
  server: DataProvider,
  initial: string | null,
  { permissions, ...props }: PickerOptions & { permissions?: string[] } = {},
) {
  cleanup()
  renderPicker(server, { initial, ...props }, permissions)
}
