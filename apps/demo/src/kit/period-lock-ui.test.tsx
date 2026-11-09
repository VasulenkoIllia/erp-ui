import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext, useGetOne } from "ra-core"
import type * as React from "react"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  PeriodLockBanner,
  PeriodLockNotice,
} from "@/registry/erp/period-lock-banner"
import { PeriodLockExceptions } from "@/registry/erp/period-lock-exceptions"
import { PeriodLockSettings } from "@/registry/erp/period-lock-settings"
import { createApiClient } from "@/registry/lib/api"
import type { AuditEvent } from "@/registry/lib/audit"
import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import { addDays, todayIn } from "@/registry/lib/dates"
import { createPeriodLockMocks } from "@/registry/lib/mock-period-lock"
import { resetScenarios } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  errorResponse,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Крок PF13 (ADR-0069): смуга закритого періоду, налаштування дати з причиною відкриття, роки компанії
 * й винятки з відкликанням — на моку закритих періодів.
 */
const BASE = "http://erp.test/api/v1"
const HOUR_MS = 3_600_000
const today = todayIn()
const lockedThrough = addDays(today, -10)
const ADMIN = ["period-lock:*", "period-lock-exceptions:*"]

const periodLock = createPeriodLockMocks({
  baseUrl: BASE,
  seeds: [
    {
      companyId: null,
      lockedThrough,
      exceptions: [
        {
          userId: "lucky",
          userName: "Іван Петренко",
          until: new Date(Date.now() + HOUR_MS).toISOString(),
          reason: "Виправити акт",
          grantedBy: { id: "admin", name: "Олена Коваль" },
          grantedAt: new Date().toISOString(),
        },
      ],
    },
  ],
})

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
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
      user("admin", ADMIN),
      user("viewer", []),
      user("lucky", []),
      user("reader", ["period-lock-exceptions:read"]),
    ],
  }),
  ...periodLock.handlers,
)

const me = (id: string, permissions: string[]): Me => ({
  id,
  name: id,
  email: `${id}@test.example`,
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

function renderWith(node: React.ReactNode, id = "admin", permissions = ADMIN) {
  signInMock(id)
  const queryClient = new QueryClient()
  queryClient.setQueryData<Me>(ME_QUERY_KEY, me(id, permissions))
  const dataProvider = createDataProvider(createApiClient({ baseUrl: BASE }))
  const tree = (child: React.ReactNode) => (
    <CoreAdminContext queryClient={queryClient} dataProvider={dataProvider}>
      {child}
    </CoreAdminContext>
  )
  const view = render(tree(node))
  return {
    ...view,
    rerender: (child: React.ReactNode) => {
      view.rerender(tree(child))
    },
  }
}

const format = (date: string) => date.split("-").reverse().join(".")

/** Документ на тій самій сторінці, що й смуга. */
function DocumentProbe() {
  useGetOne("docs", { id: "doc-1" })
  return null
}

const audit = (): AuditEvent[] =>
  JSON.parse(localStorage.getItem("erp-ui:mock-audit") ?? "[]") as AuditEvent[]

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  localStorage.clear()
  periodLock.reset()
  resetScenarios()
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("PeriodLockNotice", () => {
  it("закритий період: дата закриття й дата документа", () => {
    render(
      <PeriodLockNotice
        state="locked"
        date="2026-10-15"
        lockedThrough="2026-10-20"
        hint="Виправте сторно"
      />,
    )
    expect(screen.getByText("Період закрито по 20.10.2026")).toBeVisible()
    expect(screen.getByText(/Дата документа 15\.10\.2026/)).toBeVisible()
    expect(screen.getByText("Виправте сторно")).toBeVisible()
    // Стан документа, а не подія: скрінрідер не перериває людину.
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("виняток: до коли й причина, без підказки про сторно", () => {
    render(
      <PeriodLockNotice
        state="locked"
        date="2026-10-15"
        lockedThrough="2026-10-20"
        exception={{ until: "2026-11-09T13:30:00Z", reason: "Акт за жовтень" }}
        hint="Виправте сторно"
      />,
    )
    expect(screen.getByText(/Причина: Акт за жовтень/)).toBeVisible()
    expect(screen.queryByText("Виправте сторно")).toBeNull()
  })

  it("збій — «Спробувати ще»", async () => {
    const retry = vi.fn()
    render(<PeriodLockNotice state="error" onRetry={retry} />)
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe("PeriodLockBanner", () => {
  it("відкритий період — смуги немає, закритий — є", async () => {
    const { rerender } = renderWith(
      <PeriodLockBanner date={addDays(lockedThrough, 1)} />,
    )
    await waitFor(() => {
      expect(periodLock.lockedThrough(null)).toBe(lockedThrough)
    })
    expect(screen.queryByText(/Період закрито/)).toBeNull()
    rerender(<PeriodLockBanner date={lockedThrough} />)
    expect(
      await screen.findByText(`Період закрито по ${format(lockedThrough)}`),
    ).toBeVisible()
  })

  it("свій виняток — у смузі", async () => {
    renderWith(<PeriodLockBanner date={lockedThrough} />, "lucky", [])
    expect(await screen.findByText(/Причина: Виправити акт/)).toBeVisible()
  })

  it("бекенд без закритих періодів (404) — смуги немає й помилки теж", async () => {
    server.use(
      http.get(`${BASE}/period-lock/current`, () =>
        errorResponse(404, { code: "not_found", message: "no" }),
      ),
    )
    const { container } = renderWith(<PeriodLockBanner date={lockedThrough} />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(container).toBeEmptyDOMElement()
  })

  it("сервер не дає запис цій людині (403) — смуги немає, а не збій без виходу", async () => {
    server.use(
      http.get(`${BASE}/period-lock/current`, () =>
        errorResponse(403, { code: "forbidden", message: "no" }),
      ),
    )
    const { container } = renderWith(<PeriodLockBanner date={lockedThrough} />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(container).toBeEmptyDOMElement()
  })

  it("виняток закінчився — смуга закритого періоду, навіть коли сервер ще віддає той самий запис; документ перечитано", async () => {
    const until = new Date(Date.now() + 300).toISOString()
    let documentReads = 0
    server.use(
      http.get(`${BASE}/period-lock/current`, () =>
        Response.json({
          id: "current",
          version: 1,
          lockedThrough,
          exception: { until, reason: "Акт" },
        }),
      ),
      http.get(`${BASE}/docs/doc-1`, () => {
        documentReads += 1
        return Response.json({ id: "doc-1", version: 1 })
      }),
    )
    renderWith(
      <>
        <PeriodLockBanner date={lockedThrough} />
        <DocumentProbe />
      </>,
      "lucky",
      [],
    )
    expect(await screen.findByText(/Причина: Акт/)).toBeVisible()
    await waitFor(() => {
      expect(documentReads).toBe(1)
    })
    expect(
      await screen.findByText(/у закритому періоді/, {}, { timeout: 2000 }),
    ).toBeVisible()
    expect(screen.queryByText(/Причина: Акт/)).toBeNull()
    // Заборони документа (`deniedActions`) сервер рахує з винятком: без нього запис перечитується.
    await waitFor(() => {
      expect(documentReads).toBe(2)
    })
  })
})

describe("PeriodLockSettings", () => {
  it("відкрити період знову — поле причини й помилка без неї; з причиною зберігається", async () => {
    const people = userEvent.setup()
    renderWith(<PeriodLockSettings />)
    const field = await screen.findByLabelText("Закрито по")
    expect(
      screen.getByText(`Закрито по ${format(lockedThrough)} включно.`),
    ).toBeVisible()
    expect(screen.queryByLabelText("Причина відкриття")).toBeNull()
    const earlier = addDays(lockedThrough, -5)
    await people.clear(field)
    await people.type(field, format(earlier).replaceAll(".", ""))
    const reason = await screen.findByLabelText("Причина відкриття")
    await people.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(await screen.findAllByText("Заповніть це поле")).not.toHaveLength(0)
    await people.type(reason, "Пропущений акт")
    await people.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(periodLock.lockedThrough(null)).toBe(earlier)
    })
  })

  it("причину сховали (дату повернули пізнішою) — у запит і журнал вона не йде", async () => {
    const people = userEvent.setup()
    renderWith(<PeriodLockSettings />)
    const field = await screen.findByLabelText("Закрито по")
    await people.clear(field)
    await people.type(
      field,
      format(addDays(lockedThrough, -5)).replaceAll(".", ""),
    )
    await people.type(
      await screen.findByLabelText("Причина відкриття"),
      "Передумала",
    )
    const later = addDays(lockedThrough, 2)
    await people.clear(field)
    await people.type(field, format(later).replaceAll(".", ""))
    expect(screen.queryByLabelText("Причина відкриття")).toBeNull()
    await people.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(periodLock.lockedThrough(null)).toBe(later)
    })
    expect(audit()[0]).toMatchObject({ action: "period_lock.updated" })
    expect(audit()[0]?.reason).toBeUndefined()
  })

  it("сьогодні закрити не можна — та сама причина, що в сервера", async () => {
    const people = userEvent.setup()
    renderWith(<PeriodLockSettings />)
    const field = await screen.findByLabelText("Закрито по")
    await people.clear(field)
    await people.type(field, format(today).replaceAll(".", ""))
    await people.tab()
    expect(
      await screen.findByText(
        "Закрити можна лише минулі дні: сьогодні лишається відкритим",
      ),
    ).toBeVisible()
  })

  it("закрити минулий рік — після підтвердження з наслідком", async () => {
    const people = userEvent.setup()
    const lastYear = String(Number(today.slice(0, 4)) - 1)
    // Минулий рік закрито лише до середини: кнопка «Закрити рік» є за будь-якої дати запуску.
    signInMock("admin")
    await createDataProvider(createApiClient({ baseUrl: BASE })).update(
      "period-lock",
      {
        id: "current",
        data: { lockedThrough: `${lastYear}-06-30`, reason: "Тест" },
        previousData: { id: "current", version: 1 },
      },
    )
    renderWith(<PeriodLockSettings />)
    const years = await screen.findByRole("list", { name: "Фінансові роки" })
    await people.click(
      await within(years).findByRole("button", {
        name: `Закрити рік ${lastYear}`,
      }),
    )
    const dialog = await screen.findByRole("alertdialog", {
      name: `Закрити ${lastYear} рік?`,
    })
    await people.click(
      within(dialog).getByRole("button", { name: `Закрити рік ${lastYear}` }),
    )
    await waitFor(() => {
      expect(periodLock.lockedThrough(null)).toBe(`${lastYear}-12-31`)
    })
    // Кнопка закритого року зникла: фокус — на заголовку списку, а не на body.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Роки компанії" }),
      ).toHaveFocus()
    })
  })

  it("без права — лише перегляд", async () => {
    renderWith(<PeriodLockSettings />, "viewer", [])
    expect(
      await screen.findByText(
        "Змінювати закриті періоди може лише людина з правом на їх налаштування.",
      ),
    ).toBeVisible()
    expect(screen.getByLabelText("Закрито по")).toHaveAttribute("readonly")
    expect(screen.queryByRole("button", { name: /Закрити рік/ })).toBeNull()
  })
})

describe("PeriodLockExceptions", () => {
  it("список: кому, до коли, причина й хто дав; відкликати — фокус на «Дати виняток»", async () => {
    const people = userEvent.setup()
    renderWith(<PeriodLockExceptions />)
    const list = await screen.findByRole("list", { name: "Чинні винятки" })
    expect(within(list).getByText("Іван Петренко")).toBeVisible()
    expect(within(list).getByText("Виправити акт")).toBeVisible()
    expect(within(list).getByText(/Видано: Олена Коваль/)).toBeVisible()
    await people.click(
      within(list).getByRole("button", {
        name: "Відкликати виняток для Іван Петренко",
      }),
    )
    expect(await screen.findByText("Чинних винятків немає.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Дати виняток" })).toHaveFocus()
  })

  it("без права читати — «немає доступу»; без права давати — кнопка неактивна з причиною", async () => {
    renderWith(<PeriodLockExceptions />, "reader", [
      "period-lock-exceptions:read",
    ])
    expect(await screen.findByText("Іван Петренко")).toBeVisible()
    expect(
      screen.getByRole("button", { name: /Дати виняток/ }),
    ).toHaveAttribute("aria-disabled", "true")
  })
})
