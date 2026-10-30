import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { RoleMatrix, type PermissionsUpdate } from "@/registry/erp/role-matrix"
import { hasPermission } from "@/registry/lib/auth"
import {
  canChangePermissions,
  canGrant,
  coversPermission,
  grants,
  isCatalogPermission,
  permissionResourceSchema,
  permissionScope,
  rebasePermissions,
  setPermissionScope,
  togglePermission,
  type PermissionResource,
} from "@/registry/lib/roles"

/**
 * Крок A2c2b1 (ADR-0038): «Свої / Усі» в ролях. Право лише на свої записи — `<ресурс>:<дія>:own` для дії
 * каталогу з `own: true`; «Усі» покривають «Свої»; «стеля» (ADR-0032) — за ширшим обсягом. Моки —
 * `roles-scope-mocks.test.ts`.
 */

const NOTES: PermissionResource = {
  id: "notes",
  label: "Нотатки",
  actions: [
    { id: "read", label: "Перегляд", own: true },
    { id: "create", label: "Створення" },
    { id: "update", label: "Зміна", own: true },
  ],
}

describe("обсяг права", () => {
  it("permissionScope: усі, свої чи немає; ширше перемагає", () => {
    expect(permissionScope(["*"], "notes", "update")).toBe("all")
    expect(permissionScope(["notes:*"], "notes", "update")).toBe("all")
    expect(permissionScope(["notes:update:own"], "notes", "update")).toBe("own")
    expect(
      permissionScope(["notes:update:own", "notes:update"], "notes", "update"),
    ).toBe("all")
    expect(permissionScope(["notes:read:own"], "notes", "update")).toBeNull()
    // Дія з `:` не збігається з рядком «Свої» як «Усі».
    expect(
      permissionScope(["notes:update:own"], "notes", "update:own"),
    ).toBeNull()
    expect(permissionScope(["*"], "", "update")).toBeNull()
  })

  it("«Свої» — право ролі: grants і hasPermission, дія ra-core теж", () => {
    expect(grants(["notes:update:own"], "notes", "update")).toBe(true)
    expect(hasPermission(["notes:update:own"], "notes", "edit")).toBe(true)
    expect(hasPermission(["notes:read:own"], "notes", "list")).toBe(true)
    expect(hasPermission(["notes:read:own"], "notes", "edit")).toBe(false)
  })

  it("«Свої» розгортає :*, усі дії на «Усі» стискаються назад; увімкнена дія лишає обсяг", () => {
    let perms = setPermissionScope(["notes:*"], NOTES, "update", "own")
    expect(perms).toEqual(["notes:read", "notes:create", "notes:update:own"])
    // Увімкнути вже ввімкнену — обсяг той самий, а не «Усі».
    expect(togglePermission(perms, NOTES, "update", true)).toEqual(perms)
    perms = setPermissionScope(perms, NOTES, "update", "all")
    expect(perms).toEqual(["notes:*"])
    expect(
      togglePermission(["users:read"], NOTES, "read", true, "own"),
    ).toEqual(["users:read", "notes:read:own"])
    expect(togglePermission(perms, NOTES, "update", false)).toEqual([
      "notes:read",
      "notes:create",
    ])
    // Дія без вибору «Свої» не має — сервер її однаково не прийняв би.
    expect(togglePermission([], NOTES, "create", true, "own")).toEqual([
      "notes:create",
    ])
  })

  it("каталог: :own лише для дії з вибором; `own` не того типу — вибору немає", () => {
    expect(isCatalogPermission("notes:update:own", [NOTES])).toBe(true)
    expect(isCatalogPermission("notes:create:own", [NOTES])).toBe(false)
    expect(isCatalogPermission("notes:*:own", [NOTES])).toBe(false)
    expect(isCatalogPermission("notes:update:own:x", [NOTES])).toBe(false)
    expect(isCatalogPermission("notes:update:all", [NOTES])).toBe(false)
    expect(isCatalogPermission("*", [NOTES])).toBe(true)
    const parsed = permissionResourceSchema.parse({
      id: "notes",
      label: "Нотатки",
      actions: [{ id: "read", label: "Перегляд", own: null }],
    })
    expect(parsed.actions[0]?.own).toBeUndefined()
  })

  it("«стеля»: «Свої» дає той, хто має хоч свої; «Усі» дає, звужує й забирає лише той, хто має «Усі»", () => {
    const own = ["notes:update:own"]
    expect(canGrant(own, ["notes:update:own"])).toBe(true)
    expect(canGrant(own, ["notes:update"])).toBe(false)
    expect(canGrant(["notes:update"], ["notes:update:own"])).toBe(true)
    // Інший суфікс — лише той самий рядок чи `*`, а не `<ресурс>:*`.
    expect(coversPermission(["notes:*"], "notes:read:company")).toBe(false)
    expect(coversPermission(["notes:read:company"], "notes:read:company")).toBe(
      true,
    )
    expect(coversPermission(["*"], "notes:read:company")).toBe(true)
    // `*` покриває й рядок поза форматом: власник прибирає його з ролі (рев'ю).
    expect(canGrant(["*"], ["legacy", "crm:notes:read:x"])).toBe(true)
    expect(coversPermission(["notes:*"], "legacy")).toBe(false)
    const change = (before: string[], next: string[]) =>
      canChangePermissions(own, before, next, [NOTES])
    expect(change([], ["notes:update:own"])).toBe(true)
    expect(change(["notes:update:own"], [])).toBe(true)
    expect(change(["notes:update:own"], ["notes:update"])).toBe(false)
    expect(change(["notes:update"], ["notes:update:own"])).toBe(false)
    expect(change(["notes:update"], [])).toBe(false)
    expect(
      canChangePermissions(
        ["notes:*"],
        ["notes:update"],
        ["notes:update:own"],
        [NOTES],
      ),
    ).toBe(true)
  })

  it("свої незбережені зміни обсягу — поверх свіжих прав ролі", () => {
    expect(
      rebasePermissions(
        ["notes:read"],
        ["notes:read:own"],
        ["notes:read", "notes:create"],
        [NOTES],
      ),
    ).toEqual(["notes:read:own", "notes:create"])
    // Свіжі — уже `notes:*`: своє «Свої» розгортає решту явно.
    expect(
      rebasePermissions(
        ["notes:read"],
        ["notes:read:own"],
        ["notes:*"],
        [NOTES],
      ),
    ).toEqual(["notes:read:own", "notes:create", "notes:update"])
  })
})

/* ------------------------------ Матриця ------------------------------ */

/** Лише для перегляду: `aria-readonly`, не неактивна. */
const isReadOnly = (element: HTMLElement) =>
  element.getAttribute("aria-readonly") === "true" &&
  !element.hasAttribute("data-disabled")

const MATRIX_HINT =
  "Частину прав змінити не можна: у вас їх немає, тож увімкнути чи вимкнути їх у ролі може лише той, хто їх має."
const SCOPE_HINT =
  "«Свої»: записи, за які людина відповідальна. «Усі»: усі записи компанії."
const SCOPE_CEILING =
  "Дати «Усі», звузити до «Свої» чи зняти їх може лише той, хто сам має «Усі»."

/** Матриця з власним станом прав: зміни застосовуються, як у сторінці ролі. */
function MatrixHarness({
  initial,
  ceiling,
}: {
  initial: string[]
  ceiling?: string[]
}) {
  const [permissions, setPermissions] = React.useState(initial)
  return (
    <>
      <output data-testid="permissions">{permissions.join(" ")}</output>
      <RoleMatrix
        resources={[NOTES]}
        permissions={permissions}
        readOnly={false}
        onChange={(update) => {
          setPermissions(update)
        }}
        ceiling={ceiling}
      />
    </>
  )
}

const permissionsText = () => screen.getByTestId("permissions").textContent
const scopeGroup = (action: string) =>
  screen.getByRole("radiogroup", { name: `Які записи: ${action}, Нотатки` })

describe("RoleMatrix: «Свої | Усі»", () => {
  it("перемикач лише в увімкненої дії з вибором; «Свої» дає :own, «Усі» — назад", async () => {
    render(<MatrixHarness initial={[]} />)
    // Пояснення є й без перемикача: перша галочка не зсуває матрицю (рев'ю).
    expect(screen.getByText(SCOPE_HINT)).toBeVisible()
    expect(screen.queryByRole("radiogroup")).toBeNull()
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Перегляд: Нотатки" }),
    )
    expect(permissionsText()).toBe("notes:read")
    const read = scopeGroup("Перегляд")
    expect(read).toHaveAccessibleDescription(SCOPE_HINT)
    expect(within(read).getByRole("radio", { name: "Усі" })).toBeChecked()
    // Вимкнена дія з вибором і дія без вибору — без перемикача.
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1)

    await userEvent.click(within(read).getByRole("radio", { name: "Свої" }))
    expect(permissionsText()).toBe("notes:read:own")
    await userEvent.click(within(read).getByRole("radio", { name: "Усі" }))
    expect(permissionsText()).toBe("notes:read")
  })

  it("клавіатура: одна зупинка Tab на вибраному, стрілка вибирає інше", async () => {
    render(<MatrixHarness initial={["notes:read:own", "notes:create"]} />)
    screen.getByRole("checkbox", { name: "Перегляд: Нотатки" }).focus()
    await userEvent.tab()
    expect(
      within(scopeGroup("Перегляд")).getByRole("radio", { name: "Свої" }),
    ).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    expect(permissionsText()).toBe("notes:read notes:create")
    await userEvent.tab()
    expect(
      screen.getByRole("checkbox", { name: "Створення: Нотатки" }),
    ).toHaveFocus()
  })

  it("«стеля» лише на свої: нова дія — «Свої», перемикач і зняття «Усі» — лише перегляд із короткою причиною", async () => {
    render(
      <MatrixHarness
        initial={["notes:read"]}
        ceiling={["notes:read:own", "notes:update:own", "notes:create"]}
      />,
    )
    expect(screen.getByText(MATRIX_HINT)).toBeVisible()
    expect(screen.getByText(SCOPE_CEILING)).toBeVisible()
    // «Усі» на перегляд дала не вона: ні зняти, ні звузити.
    const read = screen.getByRole("checkbox", { name: "Перегляд: Нотатки" })
    expect(isReadOnly(read)).toBe(true)
    expect(read).toHaveAccessibleDescription(MATRIX_HINT)
    const readScope = scopeGroup("Перегляд")
    expect(isReadOnly(readScope)).toBe(true)
    expect(readScope).toHaveAccessibleDescription(
      `${SCOPE_HINT} ${SCOPE_CEILING}`,
    )
    await userEvent.click(
      within(readScope).getByRole("radio", { name: "Свої" }),
    )
    expect(permissionsText()).toBe("notes:read")

    // Зміну вмикає лише на свої, і перемикач уже не змінити.
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Зміна: Нотатки" }),
    )
    expect(permissionsText()).toBe("notes:read notes:update:own")
    const updateScope = scopeGroup("Зміна")
    expect(isReadOnly(updateScope)).toBe(true)
    expect(
      within(updateScope).getByRole("radio", { name: "Свої" }),
    ).toBeChecked()
    // Свої вона знімає сама.
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Зміна: Нотатки" }),
    )
    expect(permissionsText()).toBe("notes:read")
  })

  it("«Усе» — усі дії над усіма записами: зі «Свої» — частково, клік дає :*", async () => {
    render(
      <MatrixHarness
        initial={["notes:read:own", "notes:create", "notes:update"]}
      />,
    )
    const all = screen.getByRole("checkbox", { name: "Усе: Нотатки" })
    expect(all).toHaveAttribute("aria-checked", "mixed")
    await userEvent.click(all)
    expect(permissionsText()).toBe("notes:*")
    expect(all).toBeChecked()
    await userEvent.click(all)
    expect(permissionsText()).toBe("")
  })

  it("«стеля» — «Свої» на всі дії: окремі галочки вільні, а «Усе» — з причиною про обсяг", () => {
    const onChange = vi.fn<(update: PermissionsUpdate) => void>()
    render(
      <RoleMatrix
        resources={[NOTES]}
        permissions={[]}
        readOnly={false}
        onChange={onChange}
        ceiling={["notes:read:own", "notes:create", "notes:update:own"]}
      />,
    )
    expect(screen.queryByText(MATRIX_HINT)).toBeNull()
    const all = screen.getByRole("checkbox", { name: "Усе: Нотатки" })
    expect(isReadOnly(all)).toBe(true)
    expect(all).toHaveAccessibleDescription(SCOPE_CEILING)
  })

  it("«стеля» без дії — «Усе» з причиною про права, яких немає", () => {
    const onChange = vi.fn<(update: PermissionsUpdate) => void>()
    render(
      <RoleMatrix
        resources={[NOTES]}
        permissions={[]}
        readOnly={false}
        onChange={onChange}
        ceiling={["notes:read", "notes:create"]}
      />,
    )
    expect(screen.queryByText(SCOPE_CEILING)).toBeNull()
    expect(
      screen.getByRole("checkbox", { name: "Усе: Нотатки" }),
    ).toHaveAccessibleDescription(MATRIX_HINT)
  })

  it("уся матриця лише для перегляду — перемикач у порядку Tab з причиною ззовні, стрілка не вибирає", async () => {
    const onChange = vi.fn()
    render(
      <>
        <p id="why">Вбудовану роль змінити не можна</p>
        <RoleMatrix
          resources={[NOTES]}
          permissions={["notes:update:own"]}
          readOnly
          readOnlyReasonId="why"
          onChange={onChange}
        />
      </>,
    )
    expect(screen.queryByText(MATRIX_HINT)).toBeNull()
    const scope = scopeGroup("Зміна")
    expect(isReadOnly(scope)).toBe(true)
    expect(scope).toHaveAccessibleDescription(
      `${SCOPE_HINT} Вбудовану роль змінити не можна`,
    )
    screen.getByRole("checkbox", { name: "Зміна: Нотатки" }).focus()
    await userEvent.tab()
    const own = within(scope).getByRole("radio", { name: "Свої" })
    expect(own).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    // Фокус іде далі, а вибір лишається «Свої».
    expect(within(scope).getByRole("radio", { name: "Усі" })).toHaveFocus()
    expect(own).toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })
})
