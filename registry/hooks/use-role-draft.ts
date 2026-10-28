import * as React from "react"

import {
  rebasePermissions,
  type PermissionResource,
  type Role,
  type RoleInput,
} from "@/registry/lib/roles"

/**
 * Чернетка ролі: назва, опис і права, які людина змінює, і те, що збережено на сервері (`base`).
 * Прийшли свіжі дані ролі (перечитали після 409 чи збереження) — змінене людиною лишається, решта
 * береться свіжою (`rebasePermissions`). Після «Зберегти» збережене — одразу `base`: зміна, зроблена
 * до перечитування, — незбережена.
 */
export function useRoleDraft(
  role: Role,
  resources: readonly PermissionResource[],
) {
  const [seen, setSeen] = React.useState(role)
  const [base, setBase] = React.useState(role)
  const [name, setName] = React.useState(role.name)
  const [description, setDescription] = React.useState(role.description ?? "")
  const [permissions, setPermissions] = React.useState(role.permissions)
  // Свіжі дані — під час рендеру, а не в ефекті: без кадру зі старими галочками.
  if (seen !== role) {
    setSeen(role)
    setBase(role)
    if (name === base.name) setName(role.name)
    if (description === (base.description ?? ""))
      setDescription(role.description ?? "")
    setPermissions(
      rebasePermissions(
        base.permissions,
        permissions,
        role.permissions,
        resources,
      ),
    )
  }
  const dirty =
    name !== base.name ||
    description !== (base.description ?? "") ||
    JSON.stringify([...permissions].sort()) !==
      JSON.stringify([...base.permissions].sort())
  const reset = () => {
    setName(base.name)
    setDescription(base.description ?? "")
    setPermissions(base.permissions)
  }
  const markSaved = (saved: Required<RoleInput>) => {
    setBase((current) => ({ ...current, ...saved }))
    // Назву й опис сервер зберіг без пробілів по краях: чернетка — так само, якщо її не змінили.
    setName((current) => (current.trim() === saved.name ? saved.name : current))
    setDescription((current) =>
      current.trim() === saved.description ? saved.description : current,
    )
  }
  return {
    name,
    setName,
    description,
    setDescription,
    permissions,
    setPermissions,
    dirty,
    reset,
    markSaved,
  }
}
