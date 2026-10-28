import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext, type AuthProvider } from "ra-core"
import { describe, expect, it, vi } from "vitest"

import { RoleDetail } from "@/registry/erp/role-detail"
import { ApiError } from "@/registry/lib/api"
import {
  rebasePermissions,
  ROLES_QUERY_KEYS,
  type PermissionResource,
  type Role,
} from "@/registry/lib/roles"

/**
 * Крок A2b2b1 (ADR-0033): роль щойно змінив інший адміністратор (409) — ролі перечитуються, свої
 * незбережені галочки лишаються поверх свіжих даних, решта — свіжі.
 */

const NOTES: PermissionResource = {
  id: "notes",
  label: "Нотатки",
  actions: [
    { id: "read", label: "Перегляд" },
    { id: "update", label: "Зміна" },
    { id: "delete", label: "Видалення" },
  ],
}

const ROLE: Role = {
  id: "sales",
  name: "Продажі",
  description: "Бачить нотатки",
  system: false,
  permissions: ["notes:read"],
  usersCount: 0,
}

const CONFLICT = new ApiError(409, {
  code: "conflict",
  message: "The role was changed by someone else",
})

describe("rebasePermissions", () => {
  it("змінене людиною — її, решта — свіжа; усі дії разом стискаються", () => {
    expect(
      rebasePermissions(
        ["notes:read"],
        ["notes:read", "notes:update"],
        ["notes:read", "notes:delete"],
        [NOTES],
      ),
    ).toEqual(["notes:*"])
    // Людина зняла «Перегляд», інший адміністратор додав «Видалення».
    expect(
      rebasePermissions(
        ["notes:read"],
        [],
        ["notes:read", "notes:delete"],
        [NOTES],
      ),
    ).toEqual(["notes:delete"])
    // Нічого не змінювала — свіжі дані як є, зокрема право поза каталогом.
    expect(
      rebasePermissions(["notes:read"], ["notes:read"], ["legacy:x"], [NOTES]),
    ).toEqual(["legacy:x"])
  })
})

function renderDetail(update: (id: string, input: unknown) => Promise<Role>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")
  const authProvider = {
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    roles: { update, remove: vi.fn(), create: vi.fn() },
  } as unknown as AuthProvider
  const onSaved = vi.fn()
  const onDirtyChange = vi.fn<(dirty: boolean) => void>()
  const ui = (role: Role) => (
    <CoreAdminContext authProvider={authProvider} queryClient={queryClient}>
      <RoleDetail
        role={role}
        resources={[NOTES]}
        canEdit
        ceiling={["*"]}
        onDirtyChange={onDirtyChange}
        onSaved={onSaved}
        onDeleted={vi.fn()}
        onDuplicate={vi.fn()}
      />
    </CoreAdminContext>
  )
  const view = render(ui(ROLE))
  return {
    invalidate,
    onSaved,
    onDirtyChange,
    unmount: view.unmount,
    refetched: (role: Role) => {
      view.rerender(ui(role))
    },
  }
}

const checkbox = (name: string) => screen.getByRole("checkbox", { name })

describe("RoleDetail: роль щойно змінив інший адміністратор", () => {
  it("409 — попередження й перечитані ролі; свіжі дані без втрати своїх галочок; друге збереження проходить", async () => {
    const user = userEvent.setup()
    const update = vi
      .fn<(id: string, input: unknown) => Promise<Role>>()
      .mockRejectedValueOnce(CONFLICT)
      .mockResolvedValueOnce(ROLE)
    const { invalidate, onSaved, refetched } = renderDetail(update)

    await user.click(checkbox("Зміна: Нотатки"))
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(
      await screen.findByText(/Цю роль щойно змінив інший адміністратор/),
    ).toBeVisible()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ROLES_QUERY_KEYS.list,
    })
    expect(onSaved).not.toHaveBeenCalled()

    // Свіжі дані: інший адміністратор додав «Видалення» й змінив опис.
    refetched({
      ...ROLE,
      description: "Бачить і видаляє нотатки",
      permissions: ["notes:read", "notes:delete"],
    })
    expect(checkbox("Зміна: Нотатки")).toBeChecked()
    expect(checkbox("Видалення: Нотатки")).toBeChecked()
    expect(screen.getByLabelText("Опис (необов'язково)")).toHaveValue(
      "Бачить і видаляє нотатки",
    )

    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    expect(update).toHaveBeenLastCalledWith("sales", {
      name: "Продажі",
      description: "Бачить і видаляє нотатки",
      permissions: ["notes:*"],
    })
    expect(
      screen.queryByText(/Цю роль щойно змінив інший адміністратор/),
    ).toBeNull()
  })

  it("свої зміни назви лишаються, коли свіжа назва інша", async () => {
    const user = userEvent.setup()
    const { refetched } = renderDetail(vi.fn())
    const name = screen.getByLabelText("Назва")
    await user.clear(name)
    await user.type(name, "Менеджери")
    refetched({ ...ROLE, name: "Продажі й підтримка" })
    expect(name).toHaveValue("Менеджери")
  })
})

describe("RoleDetail: незбережені зміни", () => {
  it("інша помилка після 409 прибирає попередження про чужу зміну", async () => {
    const user = userEvent.setup()
    const update = vi
      .fn<(id: string, input: unknown) => Promise<Role>>()
      .mockRejectedValueOnce(CONFLICT)
      .mockRejectedValueOnce(
        new ApiError(422, {
          code: "validation",
          message: "Invalid",
          fieldErrors: { name: "taken" },
        }),
      )
    renderDetail(update)
    await user.click(checkbox("Зміна: Нотатки"))
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    const conflict = /Цю роль щойно змінив інший адміністратор/
    expect(await screen.findByText(conflict)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(screen.queryByText(conflict)).toBeNull()
    })
  })

  it("після «Зберегти» зміна до перечитування — незбережена; роль зникла — змін немає", async () => {
    const user = userEvent.setup()
    const update = vi
      .fn<(id: string, input: unknown) => Promise<Role>>()
      .mockResolvedValue(ROLE)
    const { onDirtyChange, onSaved, unmount } = renderDetail(update)
    await user.click(checkbox("Зміна: Нотатки"))
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    // Збережене — одразу основа: змін немає, хоч свіжих даних ще не прийшло.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.click(checkbox("Видалення: Нотатки"))
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    unmount()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})
