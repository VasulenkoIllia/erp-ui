import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext, useGetOne } from "ra-core"
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

import { DocumentActionBar } from "@/registry/erp/document-action-bar"
import { createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import { documentLifecycleSchema } from "@/registry/lib/document-lifecycle"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createTransitionHandlers,
  documentDeniedActions,
} from "@/registry/lib/mock-transitions"
import {
  createPlatformHandlers,
  createResourceHandlers,
  errorResponse,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import type { ModuleTransition } from "@/registry/lib/statuses"

/**
 * Крок PF03a (ADR-0057): панель дій документа — дії графа зі статусу, неактивні з причиною,
 * підтвердження з причиною, відмова сервера на кнопці, порівняння в конфлікті.
 */
const BASE = "http://erp.test/api/v1"

const TRANSITIONS: readonly ModuleTransition[] = [
  { id: "submit", label: "Провести", from: ["draft"], to: "submitted" },
  {
    id: "markPaid",
    label: "Позначити оплаченим",
    from: ["submitted"],
    to: "paid",
  },
  {
    id: "cancel",
    label: "Скасувати",
    from: ["submitted", "paid"],
    to: "cancelled",
    reason: "required",
  },
  { id: "amend", label: "Виправити", from: ["cancelled"] },
]

const docSchema = recordBaseSchema
  .extend({ number: z.string(), status: z.string(), dueDate: z.string() })
  .extend(documentLifecycleSchema.shape)
type Doc = z.infer<typeof docSchema>

/** Документи, оплату яких провів колега: картка про це не знає. */
const paidByColleague = new Set<string>()

const docs = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "docs",
  schema: docSchema,
  data: () => [
    {
      id: "d1",
      version: 1,
      number: "ДОК-1",
      status: "draft",
      docStatus: "draft",
      dueDate: "2026-11-10",
    },
    {
      id: "d2",
      version: 1,
      number: "ДОК-2",
      status: "submitted",
      docStatus: "submitted",
      dueDate: "2026-11-10",
    },
    {
      id: "d3",
      version: 1,
      number: "ДОК-3",
      status: "cancelled",
      docStatus: "cancelled",
      dueDate: "2026-11-10",
    },
  ],
  deniedActions: (_, doc) => {
    const denied = { ...documentDeniedActions(doc) }
    if (paidByColleague.has(doc.id)) denied.cancel = "linked"
    return Object.keys(denied).length ? denied : undefined
  },
})

const user: MockUser = {
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
  ...createPlatformHandlers({ baseUrl: BASE, users: [user] }),
  ...createTransitionHandlers({
    baseUrl: BASE,
    resource: "docs",
    db: docs.db,
    transitions: TRANSITIONS,
    amend: (doc) => ({
      number: `${doc.number}-1`,
      status: "draft",
      dueDate: doc.dueDate,
    }),
    conflictChange: () => ({ dueDate: "2026-11-17" }),
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

/** Картка: запис із сервера, статус текстом і панель; новий документ — у `created`. */
function Card({
  id,
  transitions,
  onCreated,
}: {
  id: string
  transitions: readonly ModuleTransition[]
  onCreated?: (id: string) => void
}) {
  const { data } = useGetOne<Doc>("docs", { id })
  if (!data) return null
  return (
    <>
      <p data-testid="status">{data.status}</p>
      <p data-testid="due">{data.dueDate}</p>
      <DocumentActionBar
        resource="docs"
        record={data}
        transitions={transitions}
        compare={(seen, current) =>
          seen.dueDate === current.dueDate
            ? []
            : [
                {
                  key: "dueDate",
                  label: "Сплатити до",
                  mine: seen.dueDate,
                  theirs: current.dueDate,
                },
              ]
        }
        onCreated={(created) => onCreated?.(String(created.id))}
      />
    </>
  )
}

function renderCard(
  id: string,
  permissions = ["docs:*"],
  transitions = TRANSITIONS,
) {
  const queryClient = new QueryClient()
  queryClient.setQueryData<Me>(ME_QUERY_KEY, me(permissions))
  const created: string[] = []
  const dataProvider = createDataProvider(createApiClient({ baseUrl: BASE }))
  const tree = (cardId: string) => (
    <CoreAdminContext queryClient={queryClient} dataProvider={dataProvider}>
      <Card
        id={cardId}
        transitions={transitions}
        onCreated={(newId) => created.push(newId)}
      />
    </CoreAdminContext>
  )
  const view = render(tree(id))
  /** Той самий екземпляр панелі показує інший документ (як картка без перемонтування). */
  const show = (cardId: string) => {
    view.rerender(tree(cardId))
  }
  return { ...view, created, queryClient, show }
}

const bar = () => screen.getByRole("group", { name: "Дії документа" })

/** Base UI переносить фокус у діалог підтвердження в наступному кадрі: до того введення піде повз поле. */
async function openConfirm(name: string) {
  const dialog = await screen.findByRole("alertdialog", { name })
  await waitFor(() => {
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
  return dialog
}
const status = () => screen.getByTestId("status")

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  docs.db.reset()
  paidByColleague.clear()
  resetScenarios()
  signInMock("u1")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("DocumentActionBar", () => {
  it("лише дії зі статусу; провести — через підтвердження з кнопкою-наслідком", async () => {
    const user = userEvent.setup()
    renderCard("d1")
    await screen.findByRole("button", { name: "Провести" })
    expect(
      within(bar())
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Провести"])
    await user.click(screen.getByRole("button", { name: "Провести" }))
    const dialog = await openConfirm("Провести документ?")
    await user.click(
      within(dialog).getByRole("button", { name: "Провести документ" }),
    )
    await waitFor(() => {
      expect(status()).toHaveTextContent("submitted")
    })
    expect(
      await within(bar()).findByRole("button", { name: "Позначити оплаченим" }),
    ).toBeEnabled()
  })

  it("свої тексти підтвердження модуля замість текстів кіта за ключем дії", async () => {
    const user = userEvent.setup()
    renderCard(
      "d1",
      ["docs:*"],
      [
        {
          id: "submit",
          label: "Надіслати",
          from: ["draft"],
          to: "submitted",
          confirm: {
            title: "Надіслати пропозицію?",
            description: "Пропозиція отримає номер.",
            action: "Надіслати пропозицію",
          },
        },
      ],
    )
    await user.click(await screen.findByRole("button", { name: "Надіслати" }))
    const dialog = await openConfirm("Надіслати пропозицію?")
    expect(dialog).toHaveTextContent("Пропозиція отримає номер.")
    await user.click(
      within(dialog).getByRole("button", { name: "Надіслати пропозицію" }),
    )
    await waitFor(() => {
      expect(status()).toHaveTextContent("submitted")
    })
  })

  it("без права — неактивні з причиною для скрінрідера й видимим рядком", async () => {
    renderCard("d2", ["docs:read"])
    const cancel = await screen.findByRole("button", { name: "Скасувати" })
    expect(cancel).toHaveAttribute("aria-disabled", "true")
    expect(cancel).toHaveAccessibleDescription("Немає права на цю дію")
  })

  it("причину, яку граф вимагає, питає діалог: без неї — помилка біля поля", async () => {
    const user = userEvent.setup()
    renderCard("d2")
    await user.click(await screen.findByRole("button", { name: "Скасувати" }))
    const dialog = await openConfirm("Скасувати документ?")
    await user.click(
      within(dialog).getByRole("button", { name: "Скасувати документ" }),
    )
    const reason = within(dialog).getByLabelText("Причина")
    expect(reason).toHaveAccessibleDescription("Вкажіть причину")
    expect(reason).toHaveFocus()
    await user.type(reason, "Помилка в сумі")
    await user.click(
      within(dialog).getByRole("button", { name: "Скасувати документ" }),
    )
    await waitFor(() => {
      expect(status()).toHaveTextContent("cancelled")
    })
  })

  it("відмова сервера: причина з позначки `current` — на кнопці й текстом під панеллю", async () => {
    const user = userEvent.setup()
    renderCard("d2")
    await screen.findByRole("button", { name: "Скасувати" })
    paidByColleague.add("d2")
    await user.click(screen.getByRole("button", { name: "Скасувати" }))
    const dialog = await openConfirm("Скасувати документ?")
    await user.type(within(dialog).getByLabelText("Причина"), "Помилка")
    await user.click(
      within(dialog).getByRole("button", { name: "Скасувати документ" }),
    )
    expect(await within(bar()).findByRole("alert")).toHaveTextContent(
      "«Скасувати» не виконано. Є проведені пов'язані документи: спершу скасуйте їх",
    )
    const cancel = within(bar()).getByRole("button", { name: "Скасувати" })
    expect(cancel).toHaveAttribute("aria-disabled", "true")
    expect(cancel).toHaveAccessibleDescription(
      "Є проведені пов'язані документи: спершу скасуйте їх",
    )
    expect(status()).toHaveTextContent("submitted")
  })

  it("конфлікт версій: порівняння того, що людина бачила, з тим, що зараз; дія ще раз проходить", async () => {
    const user = userEvent.setup()
    renderCard("d2")
    await screen.findByRole("button", { name: "Позначити оплаченим" })
    setScenario("conflict", "docs")
    await user.click(
      screen.getByRole("button", { name: "Позначити оплаченим" }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Документ змінив інший користувач",
    })
    const row = within(dialog).getByRole("row", { name: /Сплатити до/ })
    expect(row).toHaveTextContent("2026-11-10")
    expect(row).toHaveTextContent("2026-11-17")
    await user.click(
      within(dialog).getByRole("button", { name: "Позначити оплаченим" }),
    )
    await waitFor(() => {
      expect(status()).toHaveTextContent("paid")
    })
  })

  it("помилка сервера — текст під панеллю, кнопка лишається для повтору", async () => {
    const user = userEvent.setup()
    renderCard("d2")
    await screen.findByRole("button", { name: "Позначити оплаченим" })
    setScenario("error", "docs")
    await user.click(
      screen.getByRole("button", { name: "Позначити оплаченим" }),
    )
    expect(await within(bar()).findByRole("alert")).toHaveTextContent(
      "«Позначити оплаченим» не виконано. Помилка сервера. Спробуйте ще раз",
    )
    expect(
      screen.getByRole("button", { name: "Позначити оплаченим" }),
    ).toBeEnabled()
  })

  it("виправити — новий документ для переходу; скасованого з копією вдруге не виправляють", async () => {
    const user = userEvent.setup()
    const { created } = renderCard("d3")
    await user.click(await screen.findByRole("button", { name: "Виправити" }))
    await waitFor(() => {
      expect(created).toHaveLength(1)
    })
    const amend = await within(bar()).findByRole("button", {
      name: "Виправити",
    })
    await waitFor(() => {
      expect(amend).toHaveAttribute("aria-disabled", "true")
    })
  })
  it("дія кіта не зі свого стану не показується, хоч граф проекту її дозволяє", async () => {
    renderCard(
      "d3",
      ["docs:*"],
      [
        { ...TRANSITIONS[0], from: ["draft", "cancelled"] },
        ...TRANSITIONS.slice(1),
      ],
    )
    await screen.findByRole("button", { name: "Виправити" })
    expect(
      within(bar())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Виправити"])
  })

  it("версія — з моменту рішення: запис змінився під діалогом, сервер дає порівняння, фокус у ньому", async () => {
    const user = userEvent.setup()
    const { queryClient } = renderCard("d2")
    await user.click(await screen.findByRole("button", { name: "Скасувати" }))
    const confirm = await openConfirm("Скасувати документ?")
    docs.db.patch("d2", { dueDate: "2026-11-20" })
    await queryClient.invalidateQueries({ queryKey: ["docs"] })
    await waitFor(() => {
      expect(screen.getByTestId("due")).toHaveTextContent("2026-11-20")
    })
    await user.type(within(confirm).getByLabelText("Причина"), "Дубль")
    await user.click(
      within(confirm).getByRole("button", { name: "Скасувати документ" }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Документ змінив інший користувач",
    })
    const row = within(dialog).getByRole("row", { name: /Сплатити до/ })
    expect(row).toHaveTextContent("2026-11-10")
    expect(row).toHaveTextContent("2026-11-20")
    expect(status()).toHaveTextContent("submitted")
    // Підтвердження закрилось, а фокус лишився в порівнянні, а не під ним.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
    })
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    })
    expect(
      within(dialog).getByRole("button", { name: "Скасувати документ" }),
    ).toBeInTheDocument()
  })

  it("сервер вимагає причину, якої граф не питає: текст під панеллю, а не тиша", async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${BASE}/docs/:id/markPaid`, () =>
        errorResponse(422, {
          code: "validation",
          message: "Validation failed",
          fieldErrors: { reason: "required" },
        }),
      ),
    )
    renderCard("d2")
    await user.click(
      await screen.findByRole("button", { name: "Позначити оплаченим" }),
    )
    expect(await within(bar()).findByRole("alert")).toHaveTextContent(
      /^«Позначити оплаченим» не виконано\./,
    )
  })
  it("після підтвердження кнопка зникла: фокус на самій панелі, а не на першій дії", async () => {
    const user = userEvent.setup()
    renderCard("d1")
    await user.click(await screen.findByRole("button", { name: "Провести" }))
    const confirm = await openConfirm("Провести документ?")
    await user.click(
      within(confirm).getByRole("button", { name: "Провести документ" }),
    )
    await waitFor(() => {
      expect(status()).toHaveTextContent("submitted")
    })
    await waitFor(() => {
      expect(bar()).toHaveFocus()
    })
  })

  it("відповідь після переходу на інший документ нічого не показує й нікуди не веде", async () => {
    const user = userEvent.setup()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    // Відповідь затримується, а потім іде далі, до мока переходів.
    server.use(
      http.post(`${BASE}/docs/:id/amend`, async () => {
        await held
        return undefined
      }),
    )
    const { created, show } = renderCard("d3")
    await user.click(await screen.findByRole("button", { name: "Виправити" }))
    show("d2")
    await waitFor(() => {
      expect(status()).toHaveTextContent("submitted")
    })
    release()
    await waitFor(() => {
      expect(docs.db.all().some((doc) => doc.amendedFrom === "d3")).toBe(true)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(created).toEqual([])
    expect(within(bar()).queryByRole("alert")).toBeNull()
  })
})
