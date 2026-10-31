import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext, type DataProvider } from "ra-core"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { FormField } from "@/registry/erp/form"
import { RecordFormDialog } from "@/registry/erp/record-form"
import { useRecordForm } from "@/registry/hooks/use-record-form"
import { ApiError } from "@/registry/lib/api"
import { Input } from "@/registry/ui/input"

import { waitForDialogFocus } from "@/test/dialog-focus"

/**
 * Крок 1.4b2b (ADR-0028): форма одного елемента вкладеної колекції (адреса, рахунок) на
 * `useRecordForm` — колекцію будує з запису, до якого застосовують зміну, а помилку сервера з шляхом
 * елемента показує біля поля.
 */

interface Org {
  id: string
  version: number
  tags: string[]
}

const ORG: Org = { id: "o1", version: 3, tags: ["a"] }
const ORG_SCHEMA = z.custom<Org>(
  (value) => typeof value === "object" && value !== null && "tags" in value,
)
const TAG_SCHEMA = z.object({ tag: z.string().min(1) })

/** Новий тег у кінці колекції запису, від якого рахують версію. */
function TagForm({ onSaved }: { onSaved: () => void }) {
  const state = useRecordForm<{ tag: string }, Org>({
    resource: "orgs",
    record: ORG,
    schema: TAG_SCHEMA,
    defaultValues: { tag: "" },
    recordSchema: ORG_SCHEMA,
    toPayload: (values, _keys, target) => ({
      tags: [...(target?.tags ?? []), values.tag],
    }),
    toValues: () => ({ tag: "" }),
    fieldOfServerError: (field) => field.replace(/^tags\.\d+$/, "tag"),
    onSaved,
  })
  return (
    <RecordFormDialog
      onClose={() => undefined}
      title="Новий тег"
      submitLabel="Додати"
      state={state}
      items={[
        {
          id: "tag",
          label: "Тег",
          render: (props) => (
            <FormField
              {...props}
              control={state.form.control}
              name="tag"
              render={({ field, control }) => <Input {...control} {...field} />}
            />
          ),
        },
      ]}
    />
  )
}

async function renderForm(update: ReturnType<typeof vi.fn>) {
  const onSaved = vi.fn()
  render(
    <CoreAdminContext
      dataProvider={{ update } as unknown as DataProvider}
      queryClient={new QueryClient()}
    >
      <TagForm onSaved={onSaved} />
    </CoreAdminContext>,
  )
  await waitForDialogFocus()
  return { onSaved, user: userEvent.setup() }
}

describe("useRecordForm: елемент вкладеної колекції", () => {
  it("«Зберегти мої зміни» будує колекцію з запису, збереженого зараз: чужий тег лишається", async () => {
    const current: Org = { ...ORG, version: 4, tags: ["a", "theirs"] }
    const update = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, { code: "conflict", message: "conflict", current }),
      )
      .mockImplementation((_resource: string, { data }: { data: object }) =>
        Promise.resolve({ data: { ...current, ...data, version: 5 } }),
      )
    const { onSaved, user } = await renderForm(update)
    await user.type(screen.getByRole("textbox", { name: "Тег" }), "mine")
    await user.click(screen.getByRole("button", { name: "Додати" }))
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      data: { tags: ["a", "mine"], version: 3 },
    })
    const conflict = await screen.findByRole("dialog", {
      name: "Запис змінив інший користувач",
    })
    await user.click(
      within(conflict).getByRole("button", { name: "Зберегти мої зміни" }),
    )
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    expect(update.mock.calls[1]?.[1]).toMatchObject({
      data: { tags: ["a", "theirs", "mine"], version: 4 },
    })
  })

  it("422 з шляхом елемента (`tags.1`) — біля поля форми, а не над формою", async () => {
    const update = vi.fn().mockRejectedValue(
      new ApiError(422, {
        code: "validation",
        message: "Validation failed",
        fieldErrors: { "tags.1": "duplicate" },
      }),
    )
    const { user } = await renderForm(update)
    const tag = screen.getByRole("textbox", { name: "Тег" })
    await user.type(tag, "a")
    await user.click(screen.getByRole("button", { name: "Додати" }))
    await waitFor(() => {
      expect(tag).toHaveAccessibleDescription(
        "Таке значення вже є в іншого запису",
      )
    })
    expect(
      screen.queryByText(/помилка в полях, яких немає у формі/),
    ).not.toBeInTheDocument()
  })
})
