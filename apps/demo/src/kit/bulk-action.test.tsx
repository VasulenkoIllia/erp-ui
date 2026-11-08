import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
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

import { useBulkAction, type BulkActionTexts } from "@/registry/erp/bulk-action"
import { useRowSelection } from "@/registry/hooks/use-row-selection"
import {
  createApiClient,
  isApiError,
  recordBaseSchema,
} from "@/registry/lib/api"
import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  documentLifecycleSchema,
  TRANSITION_REASON_MAX_LENGTH,
} from "@/registry/lib/document-lifecycle"
import {
  createBulkHandlers,
  createJobHandlers,
  resetMockJobs,
} from "@/registry/lib/mock-jobs"
import {
  bulkTransitionActions,
  documentDeniedActions,
} from "@/registry/lib/mock-transitions"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import type { StatusTransition } from "@/registry/lib/statuses"
import { Toaster } from "@/registry/ui/sonner"

/**
 * Крок B3a2 (ADR-0066): масова дія зі списку — право ролі, підтвердження з кількістю, причина одна на
 * всі (порожня обов'язкова — задача не починається), звіт про невдалі з причиною кожної групи.
 */
const BASE = "http://erp-bulk.test/api/v1"

const TRANSITIONS: readonly StatusTransition[] = [
  { id: "submit", from: ["draft"], to: "submitted" },
  {
    id: "cancel",
    from: ["submitted"],
    to: "cancelled",
    reason: "required",
  },
  { id: "flag", from: ["submitted"], to: "submitted", reason: "optional" },
]

const docSchema = recordBaseSchema
  .extend({ number: z.string(), status: z.string() })
  .extend(documentLifecycleSchema.shape)
type Doc = z.infer<typeof docSchema>

const doc = (id: string, docStatus: Doc["docStatus"]): Doc => ({
  id,
  version: 1,
  number: `ДОК-${id}`,
  status: docStatus,
  docStatus,
})

const docs = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "docs",
  schema: docSchema,
  data: () => [doc("d1", "draft"), doc("d2", "submitted")],
  deniedActions: (_, record) => documentDeniedActions(record),
})

const person: MockUser = {
  id: "u1",
  name: "Оксана",
  email: "o@test.example",
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions: ["docs:*"],
  companies: [],
  companyId: null,
  factors: [],
}

const server = setupServer(
  ...createPlatformHandlers({ baseUrl: BASE, users: [person] }),
  ...createJobHandlers({ baseUrl: BASE }),
  ...createBulkHandlers<Doc>({
    baseUrl: BASE,
    resource: "docs",
    db: docs.db,
    titleField: "number",
    actions: {
      ...bulkTransitionActions({ resource: "docs", transitions: TRANSITIONS }, [
        "cancel",
        "flag",
      ]),
      delete: { apply: () => ({ remove: true }) },
    },
  }),
  ...docs.handlers,
)

const me = (permissions: string[]): Me => ({
  id: "u1",
  name: "Оксана",
  email: "o@test.example",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const texts: BulkActionTexts = {
  title: (count) => `Обробити ${count} документи?`,
  description: "Наслідок дії.",
  confirm: (count) => `Обробити ${count}`,
  denied: "Немає права на цю дію",
  progress: "Обробка документів",
}

/** Список: вибір d1 і d2, кнопка панелі, діалог і скільки лишилось вибраних. */
function List({
  action,
  reason,
}: {
  action: string
  reason?: "required" | "optional"
}) {
  const selection = useRowSelection([])
  const bulk = useBulkAction({
    resource: "docs",
    action,
    selection,
    filter: {},
    label: "Обробити",
    reason,
    texts,
  })
  const count = selection.state.mode === "ids" ? selection.state.ids.size : 0
  return (
    <>
      <p data-testid="selected">{count}</p>
      <button
        type="button"
        onClick={() => {
          selection.setRows(["d1", "d2"], true)
        }}
      >
        Вибрати обидва
      </button>
      {bulk.button(count)}
      {bulk.dialog}
    </>
  )
}

function renderList(
  action: string,
  reason?: "required" | "optional",
  permissions = ["docs:*"],
) {
  const queryClient = new QueryClient()
  queryClient.setQueryData<Me>(ME_QUERY_KEY, me(permissions))
  const dataProvider = createDataProvider(createApiClient({ baseUrl: BASE }))
  return render(
    <CoreAdminContext queryClient={queryClient} dataProvider={dataProvider}>
      <List action={action} reason={reason} />
      <Toaster />
    </CoreAdminContext>,
  )
}

/** Base UI переносить фокус у діалог наступним кадром: до того введення піде повз поле. */
async function openConfirm(name: string) {
  const dialog = await screen.findByRole("alertdialog", { name })
  await waitFor(() => {
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
  return dialog
}
const stored = (id: string) => docs.db.all().find((record) => record.id === id)

/** «Подробиці» в сповіщенні — клавішею: sonner на pointerdown бере `setPointerCapture`, якого jsdom не має. */
async function openDetails(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: "Подробиці" }).focus()
  await user.keyboard("{Enter}")
}

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  docs.db.reset()
  resetMockJobs()
  signInMock("u1")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("erp/bulk-action", () => {
  it("без права ролі — неактивна кнопка з причиною", async () => {
    renderList("cancel", "required", ["docs:read"])
    const button = await screen.findByRole("button", { name: "Обробити" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAccessibleDescription("Немає права на цю дію")
  })

  it("обов'язкова причина порожня — помилка біля поля, задача не починається; з причиною — звіт про невдалі", async () => {
    const user = userEvent.setup()
    renderList("cancel", "required")
    await user.click(screen.getByRole("button", { name: "Вибрати обидва" }))
    expect(screen.getByTestId("selected")).toHaveTextContent("2")
    await user.click(screen.getByRole("button", { name: "Обробити" }))
    const dialog = await openConfirm("Обробити 2 документи?")
    await user.click(within(dialog).getByRole("button", { name: "Обробити 2" }))
    const field = within(dialog).getByLabelText("Причина", { exact: true })
    expect(field).toHaveAccessibleDescription("Вкажіть причину")
    expect(field).toHaveFocus()
    expect(screen.getByTestId("selected")).toHaveTextContent("2")
    expect(stored("d2")?.status).toBe("submitted")

    await user.type(field, "Клієнт відмовився")
    await user.click(within(dialog).getByRole("button", { name: "Обробити 2" }))
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
    })
    expect(screen.getByTestId("selected")).toHaveTextContent("0")
    expect(
      await screen.findByText(
        "Готово 1 з 2, не вдалося: 1",
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible()
    expect(stored("d2")?.status).toBe("cancelled")
    await openDetails(user)
    const report = await screen.findByRole("dialog", { name: "Не вдалося: 1" })
    expect(report).toHaveTextContent(
      "Цю дію не можна виконати із записом у цьому статусі: 1",
    )
    expect(report).toHaveTextContent("ДОК-d1")
  })

  it("видалення: проведений документ — невдача з причиною стану документа, текст кіта", async () => {
    const user = userEvent.setup()
    renderList("delete")
    await user.click(screen.getByRole("button", { name: "Вибрати обидва" }))
    expect(screen.getByTestId("selected")).toHaveTextContent("2")
    await user.click(screen.getByRole("button", { name: "Обробити" }))
    const dialog = await openConfirm("Обробити 2 документи?")
    expect(within(dialog).queryByLabelText(/Причина/)).toBeNull()
    await user.click(within(dialog).getByRole("button", { name: "Обробити 2" }))
    expect(
      await screen.findByText(
        "Готово 1 з 2, не вдалося: 1",
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible()
    expect(stored("d1")).toBeUndefined()
    await openDetails(user)
    const report = await screen.findByRole("dialog", { name: "Не вдалося: 1" })
    expect(report).toHaveTextContent(
      "Проведений документ не змінюють: скасуйте чи сторнуйте його й зробіть виправлену копію: 1",
    )
    expect(report).toHaveTextContent("ДОК-d2")
  })
})

describe("мок масової дії: причина в тілі", () => {
  const provider = createDataProvider(createApiClient({ baseUrl: BASE }))
  const refusal = async (promise: Promise<unknown>) => {
    const error: unknown = await promise.catch((caught: unknown) => caught)
    if (!isApiError(error)) throw new Error("expected ApiError")
    return { status: error.status, fieldErrors: error.fieldErrors }
  }

  it("обов'язкова з самих пробілів — 422 `required`; необов'язкова порожня — запуск без причини; задовга — `too_long`", async () => {
    expect(
      await refusal(
        provider.startBulk("docs", "cancel", { ids: ["d2"] }, { reason: " " }),
      ),
    ).toEqual({ status: 422, fieldErrors: { reason: "required" } })
    await expect(
      provider.startBulk("docs", "flag", { ids: ["d2"] }, { reason: "  " }),
    ).resolves.toHaveProperty("jobId")
    expect(
      await refusal(
        provider.startBulk(
          "docs",
          "cancel",
          { ids: ["d2"] },
          { reason: "x".repeat(TRANSITION_REASON_MAX_LENGTH + 1) },
        ),
      ),
    ).toEqual({ status: 422, fieldErrors: { reason: "too_long" } })
  })
})
