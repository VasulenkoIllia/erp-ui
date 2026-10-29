import { QueryClient } from "@tanstack/react-query"
import { render, renderHook, screen, within } from "@testing-library/react"
import { CoreAdminContext } from "ra-core"
import { describe, expect, it } from "vitest"

import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { applyKeyedChanges, type KeyedChanges } from "@/registry/lib/extensions"
import {
  ObjectPage,
  useRecordSlots,
  type ExtensionAction,
  type ExtensionSection,
  type RecordSlotProps,
} from "@/registry/templates/object-page"

/** Крок 1.2 (ADR-0020): секції й дії розширення в картці — слоти Object Page. */

interface Doc {
  id: string
  title: string
  /** Позначка сервера на записі (ADR-0037). */
  deniedActions?: Record<string, string>
}

function Note({ record, resource }: RecordSlotProps<Doc>) {
  return (
    <p>
      {resource}: {record.title}
    </p>
  )
}
function Remind() {
  return <button type="button">Нагадати</button>
}

const SECTIONS: KeyedChanges<ExtensionSection<Doc>, "lines"> = {
  add: [
    {
      id: "note",
      title: { uk: "Нотатка", en: "Note" },
      component: Note,
      place: "start",
    },
  ],
}
const ACTIONS: KeyedChanges<ExtensionAction<Doc>, "edit"> = {
  add: [{ id: "remind", component: Remind, access: "edit" }],
  move: [{ id: "edit", place: "end" }],
}

function Card({ record }: { record?: Doc }) {
  const slots = useRecordSlots({
    record,
    resource: "docs",
    sections: SECTIONS,
    actions: ACTIONS,
  })
  return (
    <ObjectPage
      title="Документ"
      header={
        record && {
          title: record.title,
          fields: [{ id: "client", label: "Клієнт", value: "ТОВ «А»" }],
          actions: applyKeyedChanges(
            [{ id: "edit", node: <button type="button">Змінити</button> }],
            slots.actions,
          ),
        }
      }
      sections={applyKeyedChanges(
        record
          ? [{ id: "lines", title: "Рядки", content: <p>Рядки документа</p> }]
          : [],
        slots.sections,
      )}
    />
  )
}

function renderCard(permissions: string[], record?: Doc) {
  const queryClient = new QueryClient()
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
  return render(
    <CoreAdminContext queryClient={queryClient}>
      <Card record={record} />
    </CoreAdminContext>,
  )
}

describe("ObjectPage: шапка, секції й дії списками з ключами", () => {
  const record = { id: "d1", title: "Документ № 1" }

  it("useRecordSlots: той самий результат між рендерами", () => {
    const { result, rerender } = renderHook(() =>
      useRecordSlots({
        record,
        resource: "docs",
        sections: SECTIONS,
        actions: ACTIONS,
      }),
    )
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it("слот, що впав, не валить картку: секція — помилка з повтором, дії немає", () => {
    const Broken = () => {
      throw new Error("slot")
    }
    const queryClient = new QueryClient()
    function BrokenCard() {
      const slots = useRecordSlots({
        record,
        resource: "docs",
        sections: {
          add: [{ id: "broken", title: "Зламана", component: Broken }],
        },
        actions: { add: [{ id: "broken", component: Broken }] },
      })
      return (
        <ObjectPage
          title="Документ"
          header={{
            title: record.title,
            actions: applyKeyedChanges(
              [{ id: "edit", node: <button type="button">Змінити</button> }],
              slots.actions,
            ),
          }}
          sections={applyKeyedChanges(
            [{ id: "lines", title: "Рядки", content: <p>Рядки документа</p> }],
            slots.sections,
          )}
        />
      )
    }
    const error = console.error
    console.error = () => undefined
    try {
      render(
        <CoreAdminContext queryClient={queryClient}>
          <BrokenCard />
        </CoreAdminContext>,
      )
    } finally {
      console.error = error
    }
    expect(screen.getByText("Рядки документа")).toBeVisible()
    const broken = screen.getByRole("region", { name: "Зламана" })
    expect(within(broken).getByRole("button")).toBeVisible()
    expect(
      within(screen.getByRole("banner"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Змінити"])
  })

  it("секція розширення отримує запис і ресурс; порядок — за ключами", () => {
    renderCard(["docs:*"], record)
    const sections = screen.getAllByRole("region")
    expect(sections).toHaveLength(2)
    expect(sections[0]).toHaveTextContent("Нотатка")
    expect(within(sections[0]).getByText("docs: Документ № 1")).toBeVisible()
    expect(sections[1]).toHaveTextContent("Рядки")
    const header = screen.getByRole("banner")
    expect(
      within(header)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Нагадати", "Змінити"])
    expect(within(header).getByText("ТОВ «А»")).toBeVisible()
  })

  it("дія з правом: без права її немає", () => {
    renderCard(["docs:read"], record)
    expect(screen.queryByRole("button", { name: "Нагадати" })).toBeNull()
    expect(screen.getByRole("button", { name: "Змінити" })).toBeVisible()
  })

  it("дія з правом, яку запис забороняє (`deniedActions`, ADR-0037), — прихована, як без права", () => {
    renderCard(["docs:*"], { ...record, deniedActions: { update: "shared" } })
    expect(screen.queryByRole("button", { name: "Нагадати" })).toBeNull()
    expect(screen.getByRole("button", { name: "Змінити" })).toBeVisible()
  })

  it("без запису — прихований h1 сторінки й жодної секції розширення", () => {
    renderCard(["docs:*"])
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Документ",
    )
    expect(screen.queryByRole("region")).toBeNull()
  })
})
