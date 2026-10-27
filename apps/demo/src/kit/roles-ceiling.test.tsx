import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { RoleMatrix, type PermissionsUpdate } from "@/registry/erp/role-matrix"
import { RolePicker } from "@/registry/erp/role-picker"
import type { PermissionResource, Role } from "@/registry/lib/roles"

/** Крок A2b2a (ADR-0032): «стеля» в інтерфейсі — неактивні ролі й права з причиною (SPEC §8.4). */

const ROLES: Role[] = [
  {
    id: "sales",
    name: "Продажі",
    system: false,
    permissions: ["notes:read"],
    usersCount: 1,
  },
  {
    id: "owner",
    name: "Власник",
    description: "Усі права",
    system: true,
    permissions: ["*"],
    usersCount: 0,
  },
]

const RESOURCES: PermissionResource[] = [
  {
    id: "notes",
    label: "Нотатки",
    actions: [
      { id: "read", label: "Перегляд" },
      { id: "update", label: "Зміна" },
    ],
  },
  {
    id: "users",
    label: "Користувачі",
    actions: [{ id: "read", label: "Перегляд" }],
  },
]

const isDisabled = (element: HTMLElement) =>
  element.hasAttribute("data-disabled") ||
  element.getAttribute("aria-disabled") === "true"

describe("RolePicker зі «стелею»", () => {
  it("роль, що дає більше, неактивна з причиною й не знімається; інші — як були", async () => {
    const onChange = vi.fn()
    render(
      <RolePicker
        roles={ROLES}
        value={["owner"]}
        onChange={onChange}
        legend="Ролі"
        ceiling={["notes:*"]}
      />,
    )
    const owner = screen.getByRole("checkbox", { name: "Власник" })
    expect(isDisabled(owner)).toBe(true)
    expect(owner).toHaveAccessibleDescription(
      "Усі права Дає права, яких немає у вас",
    )
    await userEvent.click(owner)
    expect(onChange).not.toHaveBeenCalled()

    const sales = screen.getByRole("checkbox", { name: "Продажі" })
    expect(isDisabled(sales)).toBe(false)
    await userEvent.click(sales)
    expect(onChange).toHaveBeenCalledWith(["owner", "sales"])
  })

  it("без `ceiling` — як до A2b2: усі ролі доступні", () => {
    render(
      <RolePicker roles={ROLES} value={[]} onChange={vi.fn()} legend="Ролі" />,
    )
    expect(isDisabled(screen.getByRole("checkbox", { name: "Власник" }))).toBe(
      false,
    )
    expect(screen.queryByText("Дає права, яких немає у вас")).toBeNull()
  })
})

describe("RoleMatrix зі «стелею»", () => {
  it("дії поза стелею й «Усе» з ними неактивні з поясненням над матрицею", async () => {
    const onChange = vi.fn<(update: PermissionsUpdate) => void>()
    render(
      <RoleMatrix
        resources={RESOURCES}
        permissions={["notes:read"]}
        readOnly={false}
        onChange={onChange}
        ceiling={["notes:read", "users:read"]}
      />,
    )
    const hint =
      "Неактивних прав у вас немає, тож увімкнути чи вимкнути їх у ролі може лише той, хто їх має."
    expect(screen.getByText(hint)).toBeVisible()
    const update = screen.getByRole("checkbox", { name: "Зміна: Нотатки" })
    expect(isDisabled(update)).toBe(true)
    expect(update).toHaveAccessibleDescription(hint)
    expect(
      isDisabled(screen.getByRole("checkbox", { name: "Усе: Нотатки" })),
    ).toBe(true)
    const read = screen.getByRole("checkbox", { name: "Перегляд: Нотатки" })
    expect(isDisabled(read)).toBe(false)
    expect(read).not.toHaveAccessibleDescription(hint)

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Усе: Користувачі" }),
    )
    expect(onChange.mock.calls[0]?.[0]?.(["notes:read"])).toEqual([
      "notes:read",
      "users:*",
    ])
  })

  it("лише перегляд чи без `ceiling` — пояснення немає", () => {
    const { rerender } = render(
      <RoleMatrix
        resources={RESOURCES}
        permissions={[]}
        readOnly
        onChange={vi.fn()}
        ceiling={[]}
      />,
    )
    expect(screen.queryByText(/Неактивних прав/)).toBeNull()
    rerender(
      <RoleMatrix
        resources={RESOURCES}
        permissions={[]}
        readOnly={false}
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Неактивних прав/)).toBeNull()
    expect(
      isDisabled(screen.getByRole("checkbox", { name: "Зміна: Нотатки" })),
    ).toBe(false)
  })
})
