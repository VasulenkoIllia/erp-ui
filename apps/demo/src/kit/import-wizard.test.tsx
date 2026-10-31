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

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup({
  checkImport = vi.fn((_: string, request: ImportRequest) =>
    Promise.resolve(answerAll(request)),
  ),
  getJob = vi.fn(() => Promise.resolve(DONE_JOB)),
  startImport = vi.fn(() => Promise.resolve({ jobId: "job-1" })),
  retryJob = vi.fn(() => Promise.resolve({ jobId: "job-2" })),
}: {
  checkImport?: ErpDataProvider["checkImport"]
  getJob?: ErpDataProvider["getJob"]
  startImport?: ErpDataProvider["startImport"]
  retryJob?: ErpDataProvider["retryJob"]
} = {}) {
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
    retryJob,
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

  describe("шапка над таблицею", () => {
    const REPORT = new File(
      ["Звіт за жовтень\nАртикул;Назва;Ціна\nA-1;Кава;12,5\nA-2;Чай;30\n"],
      "звіт.csv",
      { type: "text/csv" },
    )
    const headerSelect = () =>
      screen.findByRole("combobox", { name: "Рядок із назвами колонок" })

    async function chooseHeader(name: string) {
      await userEvent.click(await headerSelect())
      await userEvent.click(await screen.findByRole("option", { name }))
    }

    it("вибраний рядок дає назви колонок і нумерацію з Excel", async () => {
      const { checkImport } = setup()
      await userEvent.upload(screen.getByTestId("file-drop-input"), REPORT)
      await screen.findByText("3 рядки")
      await chooseHeader("Рядок 2: Артикул, Назва, Ціна")
      await screen.findByText("2 рядки")
      await next()
      await screen.findByRole("heading", { level: 2, name: /Колонки/ })
      expect(screen.getByText("Приклад: A-1")).toBeVisible()
      await next()
      await screen.findByRole("heading", { level: 2, name: /Перевірка/ })
      const [, request] = vi.mocked(checkImport).mock.calls[0] ?? []
      expect(request?.rows.map(({ row }) => row)).toEqual([3, 4])
      expect(request?.rows[0]?.values).toEqual({
        sku: "A-1",
        name: "Кава",
        price: 12.5,
      })
    })

    it("зміна рядка скидає перевірку й ключ запуску", async () => {
      const { checkImport } = setup()
      await userEvent.upload(screen.getByTestId("file-drop-input"), REPORT)
      await chooseHeader("Рядок 2: Артикул, Назва, Ціна")
      await next()
      await next()
      await screen.findByRole("heading", { level: 2, name: /Перевірка/ })
      await next("Назад")
      await next("Назад")
      await chooseHeader("Рядок 1: Звіт за жовтень")
      await chooseHeader("Рядок 2: Артикул, Назва, Ціна")
      await next()
      await next()
      await screen.findByRole("heading", { level: 2, name: /Перевірка/ })
      const calls = vi.mocked(checkImport).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0]?.[1].requestId).not.toBe(calls[1]?.[1].requestId)
    })

    it("файл без шапки не показує вибір", async () => {
      setup()
      await userEvent.upload(
        screen.getByTestId("file-drop-input"),
        new File(["Артикул\n"], "один.csv", { type: "text/csv" }),
      )
      await screen.findByText(/лише назви колонок/)
      expect(
        screen.queryByRole("combobox", { name: "Рядок із назвами колонок" }),
      ).not.toBeInTheDocument()
    })
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
    const sent = vi.mocked(startImport).mock.calls[0]?.[1]
    expect(sent?.rows.map(({ row }) => row)).toEqual([2, 4, 5])
    expect(sent?.fileName).toBe("товари.csv")
    expect(sent?.requestId).not.toBe("")
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

  it("«Далі» під час читання файла дочікується результату", async () => {
    const bytes = await FILE.arrayBuffer()
    const reading = deferred<ArrayBuffer>()
    const file = new File([bytes], "товари.csv")
    file.arrayBuffer = () => reading.promise
    setup()
    await userEvent.upload(screen.getByTestId("file-drop-input"), file)
    await next()
    reading.resolve(bytes)
    await screen.findByRole("heading", { level: 2, name: /Колонки/ })
  })

  it("файл, що не прочитався, не лишає вічного «Читаємо файл»", async () => {
    const file = new File(["x"], "товари.csv")
    file.arrayBuffer = () => Promise.reject(new Error("gone"))
    setup()
    await userEvent.upload(screen.getByTestId("file-drop-input"), file)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося прочитати файл",
    )
    expect(screen.queryByText("Читаємо файл…")).not.toBeInTheDocument()
  })

  it("новий файл закриває перегляд: порожній імпорт не запустити", async () => {
    const { startImport } = setup()
    await toCheckStep()
    await next()
    await screen.findByRole("heading", { level: 2, name: /Перегляд/ })
    await userEvent.click(screen.getByRole("button", { name: /Файл/ }))
    await screen.findByRole("heading", { level: 2, name: /Файл/ })
    await chooseFile(new File([FILE], "нові.csv"))
    expect(
      screen.queryByRole("button", { name: /Перегляд/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Перевірка/ }),
    ).not.toBeInTheDocument()
    expect(startImport).not.toHaveBeenCalled()
  })

  it("під час перевірки вибір колонок заблоковано", async () => {
    const answer = deferred<ImportCheck>()
    setup({ checkImport: vi.fn(() => answer.promise) })
    await chooseFile()
    await next()
    const column = await screen.findByRole("combobox", {
      name: "Поле для колонки Ціна",
    })
    expect(column).not.toHaveAttribute("data-disabled")
    await next()
    expect(column).toHaveAttribute("data-disabled")
    answer.resolve({ rows: [] })
    await screen.findByRole("heading", { level: 2, name: /Перевірка/ })
  })

  it("повтор без змін несе той самий ключ, нова дія з дублями — новий", async () => {
    const startImport = vi
      .fn<ErpDataProvider["startImport"]>()
      .mockRejectedValueOnce(
        new ApiError(503, { code: "server", message: "Down" }),
      )
      .mockRejectedValueOnce(
        new ApiError(503, { code: "server", message: "Down" }),
      )
      .mockResolvedValue({ jobId: "job-1" })
    setup({ startImport })
    const apply = async () => {
      await screen.findByRole("heading", { level: 2, name: /Перевірка/ })
      await next()
      await screen.findByRole("heading", { level: 2, name: /Перегляд/ })
      await next("Імпортувати 3 записи")
    }
    const backToMapping = async () => {
      await screen.findByRole("alert")
      await next("Назад")
      await next("Назад")
      await screen.findByRole("heading", { level: 2, name: /Колонки/ })
    }
    await toCheckStep()
    await next()
    await next("Імпортувати 3 записи")
    await backToMapping()
    await next()
    await apply()
    await backToMapping()
    await userEvent.click(screen.getByRole("combobox", { name: /Якщо запис/ }))
    await userEvent.click(
      await screen.findByRole("option", { name: "Оновити запис" }),
    )
    await next()
    await apply()
    await screen.findByRole("heading", { level: 2, name: /Звіт/ })
    const keys = startImport.mock.calls.map(([, sent]) => sent.requestId)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })

  it("помилка рядка від сервера має свій текст", async () => {
    const checkImport = vi.fn((_: string, request: ImportRequest) =>
      Promise.resolve<ImportCheck>({
        rows: request.rows.map(({ row }) => ({
          row,
          action: "invalid",
          errors: [{ code: "forbidden" }],
        })),
      }),
    )
    setup({ checkImport })
    await toCheckStep()
    expect(screen.getByText("Рядок 2").closest("li")).toHaveTextContent(
      "немає права змінювати цей запис",
    )
  })

  async function toReport() {
    await toCheckStep()
    await next()
    await screen.findByRole("heading", { level: 2, name: /Перегляд/ })
    await next("Імпортувати 3 записи")
    await screen.findByRole("heading", { level: 2, name: /Звіт/ })
  }

  it("підсумок оголошується, а прогрес ні", async () => {
    const job = deferred<Job>()
    setup({ getJob: vi.fn(() => job.promise) })
    await toReport()
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    job.resolve(DONE_JOB)
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Створено 2, оновлено 1, пропущено 0",
      )
    })
  })

  it("сервер без лічильників: загальний текст, а не «створено 0»", async () => {
    setup({
      getJob: vi.fn(() =>
        Promise.resolve<Job>({ ...DONE_JOB, outcomes: undefined }),
      ),
    })
    await toReport()
    expect(await screen.findByText("Готово: 3")).toBeInTheDocument()
  })

  it("підсумок після повтору рахує невдачі попередньої задачі", async () => {
    const getJob = vi.fn((id: string) =>
      Promise.resolve<Job>(
        id === "job-1"
          ? {
              ...DONE_JOB,
              succeeded: 1,
              failed: 2,
              outcomes: { created: 1, updated: 0, skipped: 0 },
              failures: [
                {
                  code: "conflict",
                  count: 1,
                  retryable: false,
                  items: [{ id: "5" }],
                },
                {
                  code: "server",
                  count: 1,
                  retryable: true,
                  items: [{ id: "4" }],
                },
              ],
            }
          : {
              ...DONE_JOB,
              id: "job-2",
              total: 1,
              processed: 1,
              succeeded: 1,
              outcomes: { created: 1, updated: 0, skipped: 0 },
            },
      ),
    ) as unknown as ErpDataProvider["getJob"]
    setup({ getJob })
    await toReport()
    await userEvent.click(
      await screen.findByRole("button", { name: /Повторити/ }),
    )
    expect(
      await screen.findByText(
        "Створено 2, оновлено 0, пропущено 0. Не вдалося: 1",
      ),
    ).toBeInTheDocument()
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
