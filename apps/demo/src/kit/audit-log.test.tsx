import { onlineManager, QueryClient } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext } from "ra-core"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuditLog } from "@/registry/erp/audit-log"
import { RecordHistory } from "@/registry/erp/record-history"
import { ApiError } from "@/registry/lib/api"
import type { AuditEvent, AuditFilter } from "@/registry/lib/audit"
import type { ErpAuthProvider } from "@/registry/lib/auth"

/** Журнал і шухляда історії (ADR-0013, ADR-0045): стани, яких не видно на моках із панелі розробника. */
const event = (id: string, extra: Partial<AuditEvent> = {}): AuditEvent => ({
  id,
  at: "2026-10-30T10:00:00.000Z",
  action: "contracts.updated",
  category: "data",
  actionLabel: `Зміна ${id}`,
  actor: { type: "user", id: "u1", name: "Олена" },
  ...extra,
})

const TARGET = { type: "contracts", id: "c-1", name: "Договір 12" }
const CHANGED = event("e1", {
  target: TARGET,
  changes: [{ field: "subject", label: "Предмет", from: "склад", to: "офіс" }],
})

type GetEvents = ErpAuthProvider["audit"]["getEvents"]

function setup(ui: ReactNode, getEvents: GetEvents) {
  const authProvider = {
    audit: { getEvents: vi.fn(getEvents), exportEvents: vi.fn() },
  } as unknown as ErpAuthProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <CoreAdminContext authProvider={authProvider} queryClient={queryClient}>
      {ui}
    </CoreAdminContext>,
  )
  return { getEvents: authProvider.audit.getEvents, queryClient }
}

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true)
  })
})

describe("AuditLog: стани", () => {
  it("без мережі на першому запиті — «Немає з'єднання», а не вічний скелетон", async () => {
    act(() => {
      onlineManager.setOnline(false)
    })
    const { getEvents } = setup(<AuditLog />, () =>
      Promise.resolve({ data: [], total: 0 }),
    )
    expect(await screen.findByText("Немає з'єднання")).toBeInTheDocument()
    expect(getEvents).not.toHaveBeenCalled()
  })

  it("мережевий збій — той самий стан, а не помилка сервера", async () => {
    setup(<AuditLog />, () =>
      Promise.reject(
        new ApiError(0, { code: "offline", message: "Network is unavailable" }),
      ),
    )
    expect(await screen.findByText("Немає з'єднання")).toBeInTheDocument()
  })

  it("збій «Показати ще» лишає показане, повтор довантажує", async () => {
    const user = userEvent.setup()
    let shouldFail = true
    const firstPage = Array.from({ length: 2 }, (_, i) => event(`e${i}`))
    setup(<AuditLog perPage={2} exportable={false} />, (_filter, page) => {
      if (page === 1) return Promise.resolve({ data: firstPage, total: 3 })
      if (!shouldFail) return Promise.resolve({ data: [event("e2")], total: 3 })
      return Promise.reject(
        new ApiError(500, { code: "server", message: "boom" }),
      )
    })
    await user.click(await screen.findByRole("button", { name: "Показати ще" }))
    const alert = await screen.findByRole("alert")
    expect(screen.getAllByText(/^Зміна e/)).toHaveLength(2)

    shouldFail = false
    await user.click(
      within(alert).getByRole("button", { name: "Спробувати ще" }),
    )
    await waitFor(() => {
      expect(screen.getAllByText(/^Зміна e/)).toHaveLength(3)
    })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

describe("AuditLog: шухляда історії", () => {
  it("expanded відкриває подробиці одразу, кнопка їх згортає", async () => {
    const user = userEvent.setup()
    setup(<AuditLog expanded exportable={false} />, () =>
      Promise.resolve({ data: [CHANGED], total: 1 }),
    )
    const changes = await screen.findByRole("list", { name: "Що змінилося" })
    expect(within(changes).getByText("склад").tagName).toBe("DEL")
    expect(within(changes).getByText("офіс").tagName).toBe("INS")
    await user.click(
      screen.getByRole("button", { name: "Подробиці: Зміна e1" }),
    )
    expect(screen.queryByRole("list", { name: "Що змінилося" })).toBeNull()
  })

  it("«Історія запису» в рядку — лише в події з записом", async () => {
    const onRecordHistory = vi.fn()
    const user = userEvent.setup()
    setup(
      <AuditLog exportable={false} onRecordHistory={onRecordHistory} />,
      () => Promise.resolve({ data: [CHANGED, event("e2")], total: 2 }),
    )
    await user.click(
      await screen.findByRole("button", { name: "Історія запису: Договір 12" }),
    )
    expect(onRecordHistory).toHaveBeenCalledWith(TARGET)
    expect(
      screen.getAllByRole("button", { name: /^Історія запису/ }),
    ).toHaveLength(1)
  })

  it("без нових пропсів кнопок шухляди немає", async () => {
    setup(<AuditLog exportable={false} />, () =>
      Promise.resolve({ data: [CHANGED], total: 1 }),
    )
    await screen.findByText("Зміна e1")
    expect(screen.queryByRole("button", { name: /історія/i })).toBeNull()
    expect(screen.queryByRole("list", { name: "Що змінилося" })).toBeNull()
  })
})

describe("RecordHistory", () => {
  it("кнопка «Уся історія» відкриває шухляду запису, порожній блок її не має", async () => {
    const user = userEvent.setup()
    const seen: AuditFilter[] = []
    setup(<RecordHistory target={TARGET} />, (filter) => {
      seen.push(filter)
      return Promise.resolve({ data: [CHANGED], total: 1 })
    })
    await user.click(await screen.findByRole("button", { name: "Уся історія" }))
    const sheet = await screen.findByRole("dialog", { name: "Історія запису" })
    expect(
      within(sheet).getByText("Договір 12", { selector: "p" }),
    ).toBeVisible()
    expect(
      within(sheet).getByRole("list", { name: "Що змінилося" }),
    ).toBeVisible()
    expect(seen).toContainEqual({ targetType: "contracts", targetId: "c-1" })
  })

  it("запис без подій: блок каже, що подій немає, кнопки немає", async () => {
    setup(<RecordHistory target={TARGET} />, () =>
      Promise.resolve({ data: [], total: 0 }),
    )
    expect(await screen.findByText("Подій ще немає.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Уся історія" })).toBeNull()
  })
})
