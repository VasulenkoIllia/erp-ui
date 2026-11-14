import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import PizZip from "pizzip"
import type { ReactNode } from "react"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest"

import {
  DocumentGeneratorButton,
  type DocumentGeneratorProps,
  type DocumentTemplateOption,
} from "@/registry/erp/document-generator"
import { DocumentGeneratorPanel } from "@/registry/erp/document-generator-panel"

import {
  contractTemplate,
  templateFile,
  unknownTagTemplate,
} from "@/data/docx-templates"
import { DEMO_DOCUMENT, PAGE_TEMPLATES } from "@/pages/document-generator-model"

/**
 * Генератор документа з шаблону (UI44, ADR-0087): мітки зі значеннями документа, помилка біля мітки,
 * завантаження того самого файла, що в перегляді, свій файл, шаблон, що не завантажився. Перегляд
 * (`docx-preview`) підмінено: тест бачить, який файл йому дали.
 */
const preview = vi.hoisted(() => ({ files: [] as (Blob | null)[] }))

vi.mock("@/registry/erp/docx-preview", () => ({
  DocxPreview: ({ file, title }: { file: Blob | null; title: string }) => {
    preview.files.push(file)
    return <div data-testid="docx-preview" title={title} />
  },
}))

let saved: Blob[] = []
let linkClick: MockInstance<(this: HTMLAnchorElement) => void>

beforeEach(() => {
  preview.files = []
  saved = []
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    saved.push(blob as Blob)
    return "blob:test"
  })
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  linkClick = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const template = (
  id: string,
  bytes: () => Uint8Array,
): DocumentTemplateOption => ({
  id,
  label: { uk: id, en: id },
  load: () => Promise.resolve(templateFile(bytes())),
})

function renderPanel(
  templates: readonly DocumentTemplateOption[],
  props: Partial<DocumentGeneratorProps> = {},
) {
  const panel = (list: readonly DocumentTemplateOption[]) => (
    <DocumentGeneratorPanel
      document={DEMO_DOCUMENT}
      templates={list}
      fileName="ЗМ-2026-0042"
      {...props}
    />
  )
  const view = render(<Providers>{panel(templates)}</Providers>)
  return {
    ...view,
    rerenderWith: (list: readonly DocumentTemplateOption[]) => {
      view.rerender(<Providers>{panel(list)}</Providers>)
    },
  }
}

const lastPreview = () => preview.files.findLast((file) => file !== null)

async function textOf(file: Blob | undefined): Promise<string> {
  if (!file) return ""
  const zip = new PizZip(new Uint8Array(await file.arrayBuffer()))
  return (zip.file("word/document.xml")?.asText() ?? "").replace(/<[^>]+>/g, "")
}

const downloadButton = () =>
  screen.getByRole("button", { name: "Завантажити .docx" })

describe("генератор документа з шаблону", () => {
  it("мітки шаблону — зі значеннями документа групами; «Завантажити» віддає файл перегляду", async () => {
    renderPanel([template("Договір", contractTemplate)])
    expect(
      await screen.findByText(/^Шаблон прочитано: \d+ міт/),
    ).toBeInTheDocument()
    const buyer = screen.getByRole("group", { name: "Покупець" })
    expect(within(buyer).getByLabelText("Повна назва")).toHaveValue(
      "ТОВ «Північний вітер»",
    )
    expect(
      within(buyer).getByLabelText("Повна назва"),
    ).toHaveAccessibleDescription("{customer.name}")
    expect(
      within(buyer).getByLabelText("Сторона в тексті договору"),
    ).toHaveValue(
      "ТОВ «Північний вітер», в особі генерального директора Мельника Андрія Петровича, що діє на підставі Статуту (надалі «Покупець»)",
    )
    expect(
      screen.getByText("3 рядки, беруться з документа"),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(lastPreview()).toBeDefined()
    })
    await userEvent.click(downloadButton())
    expect(saved).toHaveLength(1)
    expect(saved[0]).toBe(lastPreview())
    expect(await textOf(saved[0])).toContain("ДОГОВІР ПОСТАВКИ № ЗМ-2026-0042")
  })

  it("виправлене значення — у перегляді й у файлі; завантаження до паузи спершу оновлює перегляд", async () => {
    const user = userEvent.setup()
    renderPanel([template("Договір", contractTemplate)])
    const number = await screen.findByLabelText("Номер")
    await user.clear(number)
    await user.type(number, "Д-7")
    await user.click(downloadButton())
    expect(await textOf(saved[0])).toContain("ДОГОВІР ПОСТАВКИ № Д-7")
    await waitFor(() => {
      expect(lastPreview()).toBe(saved[0])
    })
  })

  it("невідома мітка — помилка біля мітки, «Завантажити» неактивна з причиною", async () => {
    renderPanel([template("Невідомі", unknownTagTemplate)])
    const issues = await screen.findByRole("group", {
      name: "Помилки в шаблоні",
    })
    const director = within(issues)
      .getByText("{customer.director}")
      .closest("li")
    expect(director).toHaveTextContent(/Такої мітки немає/)
    expect(within(issues).getByText("{sku}").closest("li")).toHaveTextContent(
      /У рядках документа такої мітки немає/,
    )
    expect(screen.getByText(/^У шаблоні 2 помилки/)).toHaveAttribute(
      "role",
      "status",
    )
    expect(downloadButton()).toHaveAttribute("aria-disabled", "true")
    expect(downloadButton()).toHaveAccessibleDescription(
      "Спершу виправте помилки в шаблоні",
    )
    await userEvent.click(downloadButton())
    expect(saved).toHaveLength(0)
  })

  it("помилки запису міток — біля мітки, перегляду немає", async () => {
    renderPanel(PAGE_TEMPLATES.filter((item) => item.id === "broken"))
    const issues = await screen.findByRole("group", {
      name: "Помилки в шаблоні",
    })
    expect(issues).toHaveTextContent("Мітку не закрито")
    expect(issues).toHaveTextContent("Блок не закрито")
    expect(
      screen.getByText("Тут буде вигляд документа з вашими значеннями."),
    ).toBeInTheDocument()
    expect(downloadButton()).toHaveAttribute("aria-disabled", "true")
  })

  it("шаблон не завантажився — причина й «Спробувати ще» вантажить знову", async () => {
    const load = vi
      .fn<() => Promise<Blob>>()
      .mockRejectedValue(new Error("offline"))
    renderPanel([{ id: "x", label: "Договір", load }])
    expect(
      await screen.findByText(
        "Шаблон не завантажився. Перевірте з'єднання й спробуйте ще раз.",
        undefined,
        { timeout: 4000 },
      ),
    ).toBeInTheDocument()
    let finish: (file: Blob) => void = () => undefined
    load.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve
      }),
    )
    const retry = screen.getByRole("button", { name: "Спробувати ще" })
    await userEvent.click(retry)
    // Поки шаблон читається знову, кнопка лишається на місці неактивною: фокус не губиться.
    expect(await screen.findByText("Читаємо шаблон…")).toBeInTheDocument()
    expect(retry).toBeInTheDocument()
    expect(retry).toHaveAttribute("aria-disabled", "true")
    expect(retry).toHaveFocus()
    act(() => {
      finish(templateFile(contractTemplate()))
    })
    expect(await screen.findByText(/^Шаблон прочитано/)).toBeInTheDocument()
  })

  it("дані документа ще не готові — «Завантажити» неактивна з причиною від проекту", async () => {
    renderPanel([template("Договір", contractTemplate)], {
      unavailableReason: "Реквізити сторін ще завантажуються",
    })
    expect(await screen.findByText(/^Шаблон прочитано/)).toBeInTheDocument()
    expect(downloadButton()).toHaveAttribute("aria-disabled", "true")
    expect(downloadButton()).toHaveAccessibleDescription(
      "Реквізити сторін ще завантажуються",
    )
  })

  it("шаблони проекту прийшли після відкриття — береться перший, поки людина нічого не вибрала", async () => {
    const view = renderPanel([])
    expect(screen.getByTestId("file-drop-input")).toBeInTheDocument()
    view.rerenderWith([template("Договір", contractTemplate)])
    expect(await screen.findByText(/^Шаблон прочитано/)).toBeInTheDocument()
    expect(screen.queryByTestId("file-drop-input")).not.toBeInTheDocument()
  })

  it("свій файл: шаблон Word читається, інший файл — «Це не файл Word .docx»", async () => {
    renderPanel([])
    const input = screen.getByTestId("file-drop-input")
    await userEvent.upload(
      input,
      new File([contractTemplate().slice()], "Мій договір.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    )
    expect(await screen.findByText(/^Шаблон прочитано/)).toBeInTheDocument()
    await userEvent.click(downloadButton())
    expect(saved).toHaveLength(1)
    expect(linkClick.mock.contexts.at(-1)).toHaveProperty(
      "download",
      "ЗМ-2026-0042 Мій договір.docx",
    )

    await userEvent.click(screen.getByRole("button", { name: /Прибрати/ }))
    await userEvent.upload(
      screen.getByTestId("file-drop-input"),
      new File(["не zip"], "зламаний.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    )
    expect(
      await screen.findByText("Це не файл Word .docx або файл пошкоджено."),
    ).toBeInTheDocument()
  })

  it("кнопка на картці відкриває генератор у діалозі лінивим чанком", async () => {
    const onOpenChange = vi.fn()
    await act(async () => {
      render(
        <Providers>
          <DocumentGeneratorButton
            document={DEMO_DOCUMENT}
            templates={[template("Договір", contractTemplate)]}
            fileName="ЗМ-2026-0042"
            onOpenChange={onOpenChange}
          />
        </Providers>,
      )
      await Promise.resolve()
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Документ із шаблону" }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(true)
    const dialog = await screen.findByRole("dialog", {
      name: "Документ із шаблону",
    })
    expect(
      await within(dialog).findByText(/^Шаблон прочитано/),
    ).toBeInTheDocument()
  })
})
