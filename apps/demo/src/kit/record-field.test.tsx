import { QueryClient } from "@tanstack/react-query"
import {
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext, type DataProvider } from "ra-core"
import { isValidElement, useState, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { FilterBar } from "@/registry/erp/filter-bar"
import { ApiError } from "@/registry/lib/api"
import {
  extendSchema,
  extensionAuditOptions,
  useExtensionFields,
  type ExtensionField,
} from "@/registry/lib/extension-fields"
import {
  extensionFormSchema,
  extensionFormValues,
} from "@/registry/lib/extension-form"
import {
  emptyFilter,
  filterKeys,
  filterValueText,
  isFilterEmpty,
  MAX_RECORD_VALUES,
  normalizeFilter,
  readFilter,
  writeFilter,
  type FilterDefinition,
  type FilterTextFormat,
} from "@/registry/lib/filters"
import type { ListFilter } from "@/registry/lib/list-state"
import { createResourceHandlers, mockRecordTitle } from "@/registry/lib/mocks"
import { RecordLabel, recordOptionTexts } from "@/registry/lib/record-label"

/** Крок A2a (ADR-0030): поле розширення «запис із довідника сервера». */

const MANAGER: ExtensionField = {
  id: "manager",
  type: "record",
  label: { uk: "Менеджер", en: "Manager" },
  resource: "people",
  labelField: "name",
  descriptionField: "email",
  filter: { status: ["active"] },
}

const PEOPLE = [
  { id: "p1", name: "Олена Коваль", email: "olena@example.com" },
  { id: "p2", name: "Іван Петренко", email: "ivan@example.com" },
  // Запрошений без імені: запис є, а назви немає.
  { id: "p3", name: "", email: "new@example.com" },
]

const DEFINITION: FilterDefinition = {
  id: "manager",
  field: "manager",
  label: "Менеджер",
  kind: "record",
  resource: "people",
  labelField: "name",
}

/** Довідник `people`: `getMany` — за `id`; `fail` — помилка з цим статусом. */
function fakeServer(fail?: number) {
  const getMany = vi.fn((_resource: string, { ids }: { ids: unknown[] }) =>
    fail
      ? Promise.reject(new ApiError(fail, { code: "x", message: "x" }))
      : Promise.resolve({
          data: PEOPLE.filter((person) => ids.includes(person.id)),
        }),
  )
  return { getMany } as unknown as DataProvider & { getMany: typeof getMany }
}

function renderWithServer(dataProvider: DataProvider, children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <CoreAdminContext dataProvider={dataProvider} queryClient={queryClient}>
      {children}
    </CoreAdminContext>,
  )
}

describe("lib/filters — запис із довідника", () => {
  it("ключ — поле; кілька значень — «одне з», повтори й порожні відкинуто", () => {
    expect(filterKeys(DEFINITION)).toEqual(["manager"])
    const draft = readFilter(DEFINITION, { manager: ["p1", "", "p1", "p2"] })
    expect(draft).toEqual({ kind: "record", values: ["p1", "p2"] })
    expect(writeFilter(DEFINITION, { q: "агро" }, draft)).toEqual({
      q: "агро",
      manager: ["p1", "p2"],
    })
    const empty = emptyFilter(draft)
    expect(empty).toEqual({ kind: "record", values: [] })
    expect(isFilterEmpty(empty)).toBe(true)
    expect(writeFilter(DEFINITION, { manager: "p1" }, empty)).toEqual({})
    expect(normalizeFilter([DEFINITION], { manager: "p1", x: "1" })).toEqual({
      manager: ["p1"],
    })
    // Чип показує імена з сервера (`RecordLabels`); текстом — `id`.
    expect(filterValueText(DEFINITION, draft, {} as FilterTextFormat)).toBe(
      "p1, p2",
    )
  })

  it("з адреси — не більше MAX_RECORD_VALUES записів (один запит підписів)", () => {
    const ids = Array.from(
      { length: MAX_RECORD_VALUES + 10 },
      (_, i) => `p${String(i)}`,
    )
    const draft = readFilter(DEFINITION, { manager: ids })
    expect(draft.kind === "record" && draft.values).toEqual(
      ids.slice(0, MAX_RECORD_VALUES),
    )
  })

  it("значення іншого виду — помилка розробника", () => {
    expect(() =>
      writeFilter(DEFINITION, {}, { kind: "options", values: ["p1"] }),
    ).toThrow(/record/)
  })
})

describe("поле-запис у схемі, формі й журналі моків", () => {
  it("у записі — непорожній id; необов'язкове може бути null", () => {
    // @ts-expect-error — у моках поля-запису лише id записів довідника чи null.
    const wrongMocks: ExtensionField = {
      id: "x",
      type: "record",
      label: "",
      resource: "people",
      labelField: "name",
      mockValues: [true],
    }
    expect(wrongMocks.type).toBe("record")
    const schema = extendSchema(z.object({ id: z.string() }), [MANAGER])
    expect(schema.parse({ id: "o1", manager: "p1" })).toEqual({
      id: "o1",
      manager: "p1",
    })
    expect(schema.safeParse({ id: "o1", manager: null }).success).toBe(true)
    expect(schema.safeParse({ id: "o1", manager: "" }).success).toBe(false)
    expect(schema.safeParse({ id: "o1", manager: 7 }).success).toBe(false)
  })

  it("форма: порожнє — null, обов'язкове не пропускає порожнього", () => {
    expect(extensionFormValues([MANAGER], { manager: "p2" })).toEqual({
      manager: "p2",
    })
    expect(extensionFormValues([MANAGER], { manager: 3 })).toEqual({
      manager: null,
    })
    const required = z.object(
      extensionFormSchema([{ ...MANAGER, required: true }], {
        required: "Заповніть",
        dateIssue: () => null,
      }),
    )
    expect(
      required.safeParse({ manager: null }).error?.issues[0]?.message,
    ).toBe("Заповніть")
    expect(required.safeParse({ manager: "p1" }).success).toBe(true)
  })

  it("журнал: назва запису з довідника моків тим полем, що й список; невідомий — id", () => {
    // Назва журналу ресурсу (titleField) — email, а підпис поля — name: журнал бере name.
    createResourceHandlers({
      resource: "a2a-people",
      schema: z.object({
        id: z.string(),
        version: z.number(),
        name: z.string(),
        email: z.string(),
      }),
      data: [
        { id: "p1", version: 1, name: "Олена Коваль", email: "o@example.com" },
      ],
      searchFields: ["email", "name"],
    })
    expect(mockRecordTitle("a2a-people", "p1")).toBe("o@example.com")
    expect(mockRecordTitle("a2a-people", "p1", "name")).toBe("Олена Коваль")
    expect(mockRecordTitle("a2a-people", "p9")).toBeUndefined()
    expect(mockRecordTitle("nobody", "p1")).toBeUndefined()

    const { auditValue, fieldLabels } = extensionAuditOptions(
      "uk",
      [{ ...MANAGER, resource: "a2a-people" }],
      mockRecordTitle,
    )
    expect(fieldLabels.manager).toEqual(MANAGER.label)
    expect(auditValue.manager?.("p1")).toBe("Олена Коваль")
    expect(auditValue.manager?.("p9")).toBe("p9")
    // Без функції назв — id як є.
    expect(
      extensionAuditOptions("uk", [MANAGER]).auditValue.manager?.("p1"),
    ).toBe("p1")
  })
})

describe("useExtensionFields — запис із довідника", () => {
  it("текстом — id; показ, колонка й шапка — підпис із сервера; фільтр — вибір запису", () => {
    const { result } = renderHook(() => useExtensionFields([MANAGER]))
    const { text, display, column, entry, displayEntry, filter } =
      result.current
    expect(text(MANAGER, "p1")).toBe("p1")
    expect(text(MANAGER, 5)).toBeNull()
    expect(display(MANAGER, "")).toBeNull()
    const label = display(MANAGER, "p1")
    expect(isValidElement(label) && label.type).toBe(RecordLabel)
    expect(isValidElement(label) && label.props).toEqual({
      resource: "people",
      id: "p1",
      labelField: "name",
    })
    expect(column({ id: "manager" }).cell({})).toBe("—")
    expect(entry({ id: "manager" }, { manager: null }).value).toBeNull()
    // Текстом (сумісно з v1.0) — id; у шапку — підпис із сервера.
    expect(entry({ id: "manager" }, { manager: "p1" }).value).toBe("p1")
    const shown = displayEntry({ id: "manager" }, { manager: "p1" })
    expect(shown.label).toBe("Менеджер")
    expect(isValidElement(shown.value) && shown.value.type).toBe(RecordLabel)
    expect(filter({ id: "manager" })).toEqual({
      id: "manager",
      field: "manager",
      label: "Менеджер",
      kind: "record",
      resource: "people",
      labelField: "name",
      descriptionField: "email",
      filter: { status: ["active"] },
    })
  })

  it("варіант вибору: підпис і другий рядок з полів; порожня назва — id", () => {
    const { optionLabel, optionDescription } = recordOptionTexts(
      "name",
      "email",
    )
    expect(optionLabel(PEOPLE[0])).toBe("Олена Коваль")
    expect(optionLabel({ id: "p7", name: " " })).toBe("p7")
    expect(optionDescription?.(PEOPLE[0])).toBe("olena@example.com")
    expect(recordOptionTexts("name").optionDescription).toBeUndefined()
  })
})

describe("RecordLabel — підпис запису з сервера", () => {
  it("кілька підписів на сторінці — один запит getMany", async () => {
    const server = fakeServer()
    renderWithServer(
      server,
      <ul>
        {["p1", "p2", "p1"].map((id, index) => (
          <li key={String(index)}>
            <RecordLabel resource="people" id={id} labelField="name" />
          </li>
        ))}
      </ul>,
    )
    expect(screen.getAllByText("Завантаження…")).toHaveLength(3)
    await waitFor(() => {
      expect(screen.getAllByText("Олена Коваль")).toHaveLength(2)
    })
    expect(screen.getByText("Іван Петренко")).toBeInTheDocument()
    expect(server.getMany).toHaveBeenCalledTimes(1)
    expect(server.getMany.mock.calls[0]?.[1].ids).toEqual(["p1", "p2"])
  })

  it.each([
    [undefined, "p9", "Запис не знайдено"],
    [403, "p1", "Немає доступу"],
    [500, "p1", "Не вдалося завантажити запис"],
    // Запис є, а назви немає — його id, а не «не знайдено».
    [undefined, "p3", "p3"],
  ])("відповідь %s для %s — «%s»", async (fail, id, message) => {
    renderWithServer(
      fakeServer(fail),
      <RecordLabel resource="people" id={id} labelField="name" />,
    )
    expect(await screen.findByText(message)).toBeInTheDocument()
  })
})

describe("erp/filter-bar — чип фільтра за записом", () => {
  function Harness({ initial }: { initial: ListFilter }) {
    const [value, setValue] = useState(initial)
    return (
      <>
        <FilterBar
          filters={[DEFINITION]}
          value={value}
          onValueChange={setValue}
        />
        <output>{JSON.stringify(value)}</output>
      </>
    )
  }

  it("чип — імена з сервера, «Прибрати» знімає фільтр", async () => {
    renderWithServer(
      fakeServer(),
      <Harness initial={{ manager: ["p1", "p2"] }} />,
    )
    const chips = screen.getByRole("list", { name: "Активні фільтри" })
    await waitFor(() => {
      expect(chips).toHaveTextContent("Менеджер: Олена Коваль, Іван Петренко")
    })
    await userEvent.click(
      within(chips).getByRole("button", { name: "Прибрати фільтр «Менеджер»" }),
    )
    expect(screen.getByRole("status")).toHaveTextContent("{}")
  })
})
