import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext } from "ra-core"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { ImportWizard } from "@/registry/erp/import-wizard"
import { ApiError } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import type { ImportTarget } from "@/registry/lib/import-rows"
import type { ImportCheck, ImportRequest } from "@/registry/lib/imports"
import type { Job } from "@/registry/lib/jobs"

const TARGET: ImportTarget = {
  resource: "products",
  label: "Товари",
  matchField: "sku",
  fields: [
    { key: "sku", label: "Артикул", required: true },
    { key: "name", label: "Назва", required: true },
    { key: "price", label: "Ціна", type: "number" },
  ],
}

const FILE = new File(
  [
    "Артикул;Назва;Ціна\nA-1;Кава;12,5\nA-2;Чай;abc\nA-3;Какао;20\nA-4;Мед;30\n",
  ],
  "товари.csv",
  { type: "text/csv" },
)

const answerAll = (request: ImportRequest): ImportCheck => ({
  rows: request.rows.map(({ row }) => ({
    row,
    action: row === 4 ? "update" : "create",
  })),
})

const DONE_JOB: Job = {
  id: "job-1",
  resource: "products",
  action: "import",
  status: "done",
  total: 3,
  processed: 3,
  succeeded: 3,
  failed: 0,
  failures: [],
  outcomes: { created: 2, updated: 1, skipped: 0 },
}

function setup({
  checkImport = vi.fn((_: string, request: ImportRequest) =>
    Promise.resolve(answerAll(request)),
  ),
  getJob = vi.fn(() => Promise.resolve(DONE_JOB)),
}: {
  checkImport?: ErpDataProvider["checkImport"]
  getJob?: ErpDataProvider["getJob"]
} = {}) {
  const startImport = vi.fn(() => Promise.resolve({ jobId: "job-1" }))
  const onDone = vi.fn()
  const router = createMemoryRouter([
    {
      path: "/",
      element: <ImportWizard target={TARGET} onDone={onDone} />,
    },
  ])
  const dataProvider = {
    checkImport,
    startImport,
    getJob,
  } as unknown as ErpDataProvider
  render(
    <CoreAdminContext dataProvider={dataProvider}>
      <RouterProvider router={router} />
    </CoreAdminContext>,
  )
  return { checkImport, startImport, onDone }
}

const next = (name = "Далі") =>
  userEvent.click(screen.getByRole("button", { name }))

async function chooseFile(file = FILE) {
  await userEvent.upload(screen.getByTestId("file-drop-input"), file)
  await screen.findByText("4 рядки")
}

async function toCheckStep() {
  await chooseFile()
  await next()
  await screen.findByRole("heading", { level: 2, name: /Колонки/ })
  await next()
  await screen.findByRole("heading", { level: 2, name: /Перевірка/ })
}

describe("ImportWizard", () => {
  it("без файла лишає на кроці й просить вибрати", async () => {
    setup()
    await next()
    expect(await screen.findByRole("alert")).toHaveTextContent("Виберіть файл")
    expect(
      screen.getByRole("heading", { level: 2, name: /Файл/ }),
    ).toBeInTheDocument()
  })

  it("битий файл показує причину на першому кроці", async () => {
    setup()
    await userEvent.upload(
      screen.getByTestId("file-drop-input"),
      new File(["не таблиця"], "дані.xlsx"),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося прочитати файл",
    )
  })

  it("сам зіставляє колонки за назвами", async () => {
    setup()
    await chooseFile()
    await next()
    expect(
      await screen.findByRole("combobox", { name: "Поле для колонки Ціна" }),
    ).toHaveTextContent("Ціна")
    expect(screen.getByText("Приклад: 12,5")).toBeInTheDocument()
  })

  it("не йде далі без обов'язкової колонки", async () => {
    const { checkImport } = setup()
    await userEvent.upload(
      screen.getByTestId("file-drop-input"),
      new File(["Артикул;Інше\nA-1;x\n"], "дані.csv"),
    )
    await screen.findByText("1 рядок")
    await next()
    await screen.findByRole("heading", { level: 2, name: /Колонки/ })
    await next()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Вкажіть колонки для обов'язкових полів: Назва",
    )
    expect(checkImport).not.toHaveBeenCalled()
  })

  it("показує рядки з помилками, а на сервер шле лише цілі", async () => {
    const { checkImport } = setup()
    await toCheckStep()
    const list = screen.getByText("Рядок 3").closest("li")
    expect(list).toHaveTextContent("Ціна: значення не підходить")
    const sent = vi.mocked(checkImport).mock.calls[0]?.[1]
    expect(sent?.rows.map(({ row }) => row)).toEqual([2, 4, 5])
    expect(sent?.matchField).toBe("sku")
    expect(sent?.onDuplicate).toBe("skip")
    expect(
      screen.getByRole("button", { name: "Завантажити файл помилок" }),
    ).toBeInTheDocument()
  })

  it("збій перевірки лишає на кроці колонок, «Далі» повторює", async () => {
    const checkImport = vi
      .fn<ErpDataProvider["checkImport"]>()
      .mockRejectedValueOnce(
        new ApiError(503, { code: "server", message: "Down" }),
      )
      .mockImplementation((_, request) => Promise.resolve(answerAll(request)))
    setup({ checkImport })
    await chooseFile()
    await next()
    await screen.findByRole("heading", { level: 2, name: /Колонки/ })
    await next()
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    await next()
    await screen.findByRole("heading", { level: 2, name: /Перевірка/ })
  })

  it("усі рядки з помилками: далі не можна", async () => {
    const checkImport = vi.fn((_: string, request: ImportRequest) =>
      Promise.resolve<ImportCheck>({
        rows: request.rows.map(({ row }) => ({
          row,
          action: "invalid",
          errors: [{ field: "sku", code: "duplicate" }],
        })),
      }),
    )
    setup({ checkImport })
    await toCheckStep()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Немає рядків, які можна імпортувати",
    )
    await next()
    expect(
      screen.getByRole("heading", { level: 2, name: /Перевірка/ }),
    ).toBeInTheDocument()
  })

  it("кнопка називає наслідок, запуск іде без рядків із помилками", async () => {
    const { startImport, onDone } = setup()
    await toCheckStep()
    await next()
    await screen.findByRole("heading", { level: 2, name: /Перегляд/ })
    expect(screen.getByText("Перші 3 із 3 записів")).toBeInTheDocument()
    await next("Імпортувати 3 записи")
    await screen.findByRole("heading", { level: 2, name: /Звіт/ })
    const [, sent] = vi.mocked(startImport).mock.calls[0] as unknown as [
      string,
      ImportRequest,
    ]
    expect(sent.rows.map(({ row }) => row)).toEqual([2, 4, 5])
    expect(sent.fileName).toBe("товари.csv")
    expect(sent.requestId).not.toBe("")
    expect(
      await screen.findByText("Створено 2, оновлено 1, пропущено 0"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Рядків із помилками/)).toHaveTextContent("1")
    expect(
      screen.queryByRole("button", { name: "Назад" }),
    ).not.toBeInTheDocument()
    await next("Готово")
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })
    expect(startImport).toHaveBeenCalledTimes(1)
  })

  it("звіт показує невдачі під час запису", async () => {
    const getJob = vi.fn(() =>
      Promise.resolve<Job>({
        ...DONE_JOB,
        succeeded: 2,
        failed: 1,
        failures: [
          {
            code: "conflict",
            count: 1,
            retryable: false,
            items: [{ id: "5" }],
          },
        ],
        outcomes: { created: 2, updated: 0, skipped: 0 },
      }),
    )
    setup({ getJob })
    await toCheckStep()
    await next()
    await screen.findByRole("heading", { level: 2, name: /Перегляд/ })
    await next("Імпортувати 3 записи")
    const report = await screen.findByText(
      "Створено 2, оновлено 0, пропущено 0. Не вдалося: 1",
    )
    expect(
      within(
        report.closest("[data-slot=import-report]") as HTMLElement,
      ).getByRole("button", { name: "Подробиці" }),
    ).toBeInTheDocument()
  })
})
