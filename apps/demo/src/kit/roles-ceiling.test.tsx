import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { RoleMatrix, type PermissionsUpdate } from "@/registry/erp/role-matrix"
import { RolePicker } from "@/registry/erp/role-picker"
import type { PermissionResource, Role } from "@/registry/lib/roles"

/**
 * Крок A2b2a (ADR-0032): «стеля» в інтерфейсі — ролі й права понад свої не змінити, з причиною
 * (SPEC §8.4). Крок A2b2b1 (ADR-0033): такі галочки — лише для перегляду в порядку Tab
 * (`aria-readonly`), а не неактивні, щоб причину чув і той, хто йде клавіатурою.
 */

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

/** Лише для перегляду: у порядку Tab, `aria-readonly`, не неактивна. */
const isReadOnly = (element: HTMLElement) =>
  element.getAttribute("aria-readonly") === "true" &&
  element.tabIndex === 0 &&
  !isDisabled(element)

const MATRIX_HINT =
  "Частину прав змінити не можна: у вас їх немає, тож увімкнути чи вимкнути їх у ролі може лише той, хто їх має."

describe("RolePicker зі «стелею»", () => {
  it("роль, що дає більше, лише для перегляду з причиною й не знімається; інші — як були", async () => {
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
    expect(isReadOnly(owner)).toBe(true)
    expect(owner).toHaveAccessibleDescription(
      "Усі права Дає права, яких немає у вас",
    )
    await userEvent.click(owner)
    // Tab доходить і до неї (після «Продажів»), а пробіл нічого не змінює: причину чує той, хто
    // йде клавіатурою.
    owner.blur()
    await userEvent.tab()
    await userEvent.tab()
    expect(owner).toHaveFocus()
    await userEvent.keyboard(" ")
    expect(onChange).not.toHaveBeenCalled()

    const sales = screen.getByRole("checkbox", { name: "Продажі" })
    expect(isReadOnly(sales)).toBe(false)
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

  it("увесь вибір лише для перегляду — причина під назвою, галочки в порядку Tab", () => {
    render(
      <RolePicker
        roles={ROLES}
        value={["sales"]}
        onChange={vi.fn()}
        legend="Ролі"
        readOnly
        readOnlyReason="Свої ролі змінює інший адміністратор"
      />,
    )
    const sales = screen.getByRole("checkbox", { name: "Продажі" })
    expect(isReadOnly(sales)).toBe(true)
    expect(sales).toHaveAccessibleDescription(
      "Свої ролі змінює інший адміністратор",
    )
    expect(
      screen.getByText("Свої ролі змінює інший адміністратор"),
    ).toBeVisible()
  })
})

describe("RoleMatrix зі «стелею»", () => {
  it("дії поза стелею й «Усе» з ними лише для перегляду з поясненням над матрицею", async () => {
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
    expect(screen.getByText(MATRIX_HINT)).toBeVisible()
    const update = screen.getByRole("checkbox", { name: "Зміна: Нотатки" })
    expect(isReadOnly(update)).toBe(true)
    expect(update).toHaveAccessibleDescription(MATRIX_HINT)
    await userEvent.click(update)
    expect(onChange).not.toHaveBeenCalled()
    expect(
      isReadOnly(screen.getByRole("checkbox", { name: "Усе: Нотатки" })),
    ).toBe(true)
    const read = screen.getByRole("checkbox", { name: "Перегляд: Нотатки" })
    expect(isReadOnly(read)).toBe(false)
    expect(read).not.toHaveAccessibleDescription(MATRIX_HINT)

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Усе: Користувачі" }),
    )
    expect(onChange.mock.calls[0]?.[0]?.(["notes:read"])).toEqual([
      "notes:read",
      "users:*",
    ])
  })

  it("лише перегляд — причина ззовні в кожної галочки; без `ceiling` — пояснення немає", () => {
    const { rerender } = render(
      <>
        <p id="why">Вбудовану роль змінити не можна</p>
        <RoleMatrix
          resources={RESOURCES}
          permissions={[]}
          readOnly
          readOnlyReasonId="why"
          onChange={vi.fn()}
          ceiling={[]}
        />
      </>,
    )
    expect(screen.queryByText(/Частину прав/)).toBeNull()
    const update = screen.getByRole("checkbox", { name: "Зміна: Нотатки" })
    expect(isReadOnly(update)).toBe(true)
    expect(update).toHaveAccessibleDescription(
      "Вбудовану роль змінити не можна",
    )
    rerender(
      <RoleMatrix
        resources={RESOURCES}
        permissions={[]}
        readOnly={false}
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Частину прав/)).toBeNull()
    expect(
      isReadOnly(screen.getByRole("checkbox", { name: "Зміна: Нотатки" })),
    ).toBe(false)
  })
})
