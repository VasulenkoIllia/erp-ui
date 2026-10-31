import { QueryClient } from "@tanstack/react-query"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext, type DataProvider } from "ra-core"
import { useCallback, useMemo } from "react"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { useExtensionForm } from "@/registry/erp/extension-field-input"
import { FormField } from "@/registry/erp/form"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/registry/erp/record-form"
import { useRecordForm } from "@/registry/hooks/use-record-form"
import { ApiError } from "@/registry/lib/api"
import { applyKeyedChanges } from "@/registry/lib/extensions"
import { useErpUiT } from "@/registry/lib/i18n"
import { Input } from "@/registry/ui/input"

import { FIELDS, FORM } from "@/kit/extension-form.fixtures"
import { waitForDialogFocus } from "@/test/dialog-focus"

/** Крок 1.4b1 (ADR-0026): поля розширення у формі й збереження форми запису. */

interface Org {
  id: string
  version: number
  name: string
  vatPayer?: boolean
  limit?: number | null
}

const ORG: Org = { id: "o1", version: 3, name: "ТОВ «Дніпро»", limit: 5 }

type Values = { name: string } & Record<string, unknown>

const ORG_SCHEMA = z.custom<Org>(
  (value) => typeof value === "object" && value !== null && "version" in value,
)

/** Форма модуля на кіті: поле назви модуля й поля розширення з `FORM`. */
function OrgForm({
  record,
  onSaved,
  onClose,
}: {
  record?: Org
  onSaved: (org: Org) => void
  onClose: () => void
}) {
  const t = useErpUiT()
  const ext = useExtensionForm(FIELDS, FORM)
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("validation.required")),
        ...ext.shape,
      }),
    [ext.shape, t],
  )
  const toValues = useCallback(
    (org?: Org): Values => ({ name: org?.name ?? "", ...ext.values(org) }),
    [ext],
  )
  const state = useRecordForm<Values, Org>({
    resource: "orgs",
    record,
    schema,
    defaultValues: toValues(record),
    recordSchema: ORG_SCHEMA,
    toPayload: (values, keys) => ({
      ...(keys.includes("name") ? { name: values.name } : {}),
      ...ext.payload(values, keys),
    }),
    toValues,
    onSaved,
    onUnchanged: onClose,
  })
  const name: RecordFormItem = {
    id: "name",
    label: "Назва",
    render: (props) => (
      <FormField
        {...props}
        control={state.form.control}
        name="name"
        render={({ field, control }) => <Input {...control} {...field} />}
      />
    ),
  }
  return (
    <RecordFormDialog
      onClose={onClose}
      title={record ? "Змінити" : "Нова"}
      submitLabel="Зберегти"
      state={state}
      items={applyKeyedChanges([name], ext.items(state.form.control))}
    />
  )
}

/** Лише потрібні тесту методи: решту ra-core не викликає. */
async function renderForm(dataProvider: Record<string, unknown>, record?: Org) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <CoreAdminContext
      dataProvider={dataProvider as unknown as DataProvider}
      queryClient={queryClient}
    >
      <OrgForm record={record} onSaved={onSaved} onClose={onClose} />
    </CoreAdminContext>,
  )
  await waitForDialogFocus()
  return { onSaved, onClose, queryClient, user: userEvent.setup() }
}

const saveButton = () => screen.getByRole("button", { name: "Зберегти" })
const errorSummary = () =>
  document.querySelector<HTMLElement>("[data-slot=form-error-summary]")

describe("RecordFormDialog + useRecordForm", () => {
  it("поля розширення стоять у формі з підказкою; підпис поля модуля змінено без заміни", async () => {
    await renderForm({})
    const dialog = screen.getByRole("dialog", { name: "Нова" })
    const labels = within(dialog)
      .getAllByText(/Ліміт|Назва клієнта|Платник ПДВ/)
      .map((label) => label.textContent)
    expect(labels).toEqual(["Ліміт", "Назва клієнта", "Платник ПДВ"])
    expect(
      screen.getByRole("checkbox", { name: "Платник ПДВ" }),
    ).toHaveAccessibleDescription("Для рахунків")
  })

  it("створення: обов'язкове поле розширення в зведенні помилок; POST — усі поля форми", async () => {
    const create = vi.fn((_resource: string, { data }: { data: object }) =>
      Promise.resolve({ data: { ...data, id: "o9", version: 1 } }),
    )
    const { onSaved, user } = await renderForm({ create })
    await user.type(
      screen.getByRole("textbox", { name: "Назва клієнта" }),
      "ПП «Світанок»",
    )
    await user.click(saveButton())
    await waitFor(() => {
      expect(errorSummary()).toHaveFocus()
    })
    expect(errorSummary()).toHaveTextContent("Ліміт: Заповніть це поле")
    expect(create).not.toHaveBeenCalled()

    await user.type(screen.getByRole("textbox", { name: "Ліміт" }), "12")
    await user.click(screen.getByRole("checkbox", { name: "Платник ПДВ" }))
    await user.click(saveButton())
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ id: "o9", name: "ПП «Світанок»" }),
      )
    })
    expect(create.mock.calls[0]?.[1].data).toEqual({
      name: "ПП «Світанок»",
      limit: 12,
      vatPayer: true,
    })
  })

  it("зміна: PATCH лише зміненого поля з версією; без змін — onUnchanged без запиту", async () => {
    const update = vi.fn((_resource: string, { data }: { data: object }) =>
      Promise.resolve({ data: { ...ORG, ...data, version: 4 } }),
    )
    const { onSaved, onClose, user } = await renderForm({ update }, ORG)
    await user.click(saveButton())
    expect(onClose).toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()

    await user.click(screen.getByRole("checkbox", { name: "Платник ПДВ" }))
    await user.click(saveButton())
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      id: "o1",
      data: { vatPayer: true, version: 3 },
      previousData: ORG,
    })
    expect(Object.keys(update.mock.calls[0]?.[1].data ?? {})).toEqual([
      "vatPayer",
      "version",
    ])
  })

  it("409: порівняння з полем розширення; «Зберегти мої зміни» — з новою версією", async () => {
    const current = { ...ORG, version: 4, vatPayer: false, limit: 9 }
    const update = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, { code: "conflict", message: "conflict", current }),
      )
      .mockImplementation((_resource: string, { data }: { data: object }) =>
        Promise.resolve({ data: { ...current, ...data, version: 5 } }),
      )
    const { onSaved, user } = await renderForm({ update }, ORG)
    await user.click(screen.getByRole("checkbox", { name: "Платник ПДВ" }))
    await user.click(saveButton())

    const conflict = await screen.findByRole("dialog", {
      name: "Запис змінив інший користувач",
    })
    const row = within(conflict).getByRole("row", { name: /Платник ПДВ/ })
    expect(row).toHaveTextContent("Платник ПДВТакНі")
    await user.click(
      within(conflict).getByRole("button", { name: "Зберегти мої зміни" }),
    )
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    expect(update.mock.calls[1]?.[1]).toMatchObject({
      data: { vatPayer: true, version: 4 },
      previousData: current,
    })
  })

  it("409: «Взяти збережене» — значення сервера у формі; наступне збереження — з його версією", async () => {
    const current = { ...ORG, version: 4, name: "ТОВ «Дніпро-2»" }
    const update = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, { code: "conflict", message: "conflict", current }),
      )
      .mockImplementation((_resource: string, { data }: { data: object }) =>
        Promise.resolve({ data: { ...current, ...data, version: 5 } }),
      )
    const { onSaved, user } = await renderForm({ update }, ORG)
    const name = screen.getByRole("textbox", { name: "Назва клієнта" })
    await user.clear(name)
    await user.type(name, "ТОВ «Мій»")
    await user.click(saveButton())
    await user.click(
      await screen.findByRole("button", { name: "Взяти збережене" }),
    )
    expect(name).toHaveValue("ТОВ «Дніпро-2»")
    await user.type(screen.getByRole("textbox", { name: "Ліміт" }), "0")
    await user.click(saveButton())
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    expect(update.mock.calls[1]?.[1]).toMatchObject({
      data: { limit: 50, version: 4 },
      previousData: current,
    })
  })

  it("403 чи 404 при збереженні: запис перечитується, введене лишається (ADR-0039)", async () => {
    for (const status of [403, 404]) {
      const update = vi.fn(() =>
        Promise.reject(new ApiError(status, { code: "x", message: "no" })),
      )
      const { user, queryClient } = await renderForm({ update }, ORG)
      const invalidate = vi.spyOn(queryClient, "invalidateQueries")
      await user.type(
        screen.getByRole("textbox", { name: "Назва клієнта" }),
        "!",
      )
      await user.click(saveButton())
      await waitFor(() => {
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orgs"] })
      })
      expect(
        screen.getByRole("textbox", { name: "Назва клієнта" }),
      ).toHaveValue(`${ORG.name}!`)
      cleanup()
    }
  })

  it("поки йде запит, повторна відправка нічого не надсилає", async () => {
    let finish: (value: { data: Org }) => void = () => undefined
    const update = vi.fn(
      () =>
        new Promise<{ data: Org }>((resolve) => {
          finish = resolve
        }),
    )
    const { onSaved, user } = await renderForm({ update }, ORG)
    const name = screen.getByRole("textbox", { name: "Назва клієнта" })
    await user.type(name, "!{Enter}")
    await user.type(name, "{Enter}")
    await user.click(saveButton())
    expect(update).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole("dialog", { name: "Змінити" }).querySelector("form"),
    ).toHaveAttribute("aria-busy", "true")
    finish({ data: { ...ORG, name: "ТОВ «Дніпро»!", version: 4 } })
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1)
    })
  })

  it("422: помилка біля поля й у зведенні, поле поза формою — над формою з фокусом; введене лишається", async () => {
    const update = vi.fn().mockRejectedValue(
      new ApiError(422, {
        code: "validation",
        message: "Validation failed",
        fieldErrors: { name: "duplicate", unknown: "invalid" },
      }),
    )
    const { onSaved, user } = await renderForm({ update }, ORG)
    const name = screen.getByRole("textbox", { name: "Назва клієнта" })
    await user.type(name, " 2")
    await user.click(saveButton())
    // Поля `unknown` у формі немає: помилка над формою, і фокус — на ній.
    const message = await screen.findByText(
      /помилка в полях, яких немає у формі/,
    )
    await waitFor(() => {
      expect(message.closest("[role=alert]")).toHaveFocus()
    })
    expect(message).toHaveTextContent("(unknown)")
    expect(errorSummary()).toHaveTextContent(
      "Назва клієнта: Таке значення вже є в іншого запису",
    )
    expect(name).toHaveAccessibleDescription(
      "Таке значення вже є в іншого запису",
    )
    expect(name).toHaveValue("ТОВ «Дніпро» 2")
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("закрити зі зміненими полями — спершу «Закрити без збереження?»", async () => {
    const { onClose, user } = await renderForm({}, ORG)
    await user.type(screen.getByRole("textbox", { name: "Назва клієнта" }), "!")
    await user.keyboard("{Escape}")
    const confirm = await screen.findByRole("alertdialog", {
      name: "Закрити без збереження?",
    })
    expect(onClose).not.toHaveBeenCalled()
    await user.click(
      within(confirm).getByRole("button", { name: "Закрити без збереження" }),
    )
    expect(onClose).toHaveBeenCalled()
  })
})
