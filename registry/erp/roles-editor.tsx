import * as React from "react"
import { flushSync } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"

import { UnsavedChangesGuard } from "@/registry/erp/form"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { RoleDetail } from "@/registry/erp/role-detail"
import { CreateRoleDialog, RoleList, shownRole } from "@/registry/erp/role-list"
import { RolePicker, rolesQueryKey, useRoles } from "@/registry/erp/role-picker"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useHasPermission, useMe, useRefreshMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { ME_QUERY_KEY } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  ROLES_QUERY_KEYS,
  type Role,
  type RoleInput,
  type Roles,
} from "@/registry/lib/roles"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"

// Вибір ролей жив тут до A2b2: імпорт `RolePicker` і `useRoles` з цього елемента працює й далі.
export { RolePicker, useRoles }

/**
 * Без пропсів вибір ролі живе всередині (сторінка налаштувань). З `selectedId` і `onSelect` — з
 * адреси сторінки (`?role=`, «Ролі й права» модуля A2, ADR-0033): `null` — перша роль, невідома —
 * «Роль не знайдено»; `onSelect` змінює адресу (`null` — після видалення). Вихід зі сторінки з
 * незбереженим стереже `UnsavedChangesGuard`, вибір іншої ролі — свій діалог.
 */
export type RolesEditorProps =
  | { readonly selectedId?: never; readonly onSelect?: never }
  | {
      readonly selectedId: string | null
      readonly onSelect: (id: string | null) => void
    }

/** Що відкласти до відповіді на «Зміни ролі … не збережено». */
type PendingAction =
  | { readonly kind: "select"; readonly id: string }
  | { readonly kind: "create"; readonly input: RoleInput }

/**
 * Ролі й матриця прав (ADR-0014, основа A2): список ролей, права ролі за ресурсами й діями,
 * нова роль і копія, видалення. Вбудовані ролі — лише перегляд. Каталог прав дає сервер. Права
 * ролі — `erp/role-detail`, матриця — `erp/role-matrix`, вибір ролей — `erp/role-picker`.
 */
export function RolesEditor(props: RolesEditorProps) {
  // Ролі — свої в кожній компанії: вибрана роль і незбережені права не переходять в іншу.
  return <RolesEditorContent key={useCompanyId() ?? ""} {...props} />
}

function RolesEditorContent({
  selectedId: routeId,
  onSelect,
}: RolesEditorProps) {
  const t = useErpUiT()
  const queryClient = useQueryClient()
  const refreshMe = useRefreshMe()
  const canEdit = useHasPermission("roles", "update")
  // «Стеля» (ADR-0032): права, яких немає в того, хто змінює, неактивні.
  const ceiling = useMe().data?.permissions
  const query = useRoles()
  const rolesKey = rolesQueryKey(useCompanyId())
  const routed = onSelect !== undefined
  const [ownId, setOwnId] = React.useState<string | null>(null)
  const selectedId = routed ? routeId : ownId
  const shown = query.data
    ? shownRole(query.data.roles, selectedId, routed)
    : undefined
  const heading = React.useRef<HTMLHeadingElement>(null)
  // Фокус на заголовок ролі — лише після вибору людиною, коли роль уже на екрані (ADR-0033).
  const focusNext = React.useRef(false)
  React.useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    heading.current?.focus()
  }, [shown])
  // «Не зберігати» перед новою роллю чи копією: свіжа `RoleDetail` — без чернетки.
  const [draftKey, setDraftKey] = React.useState(0)
  const [dirty, setDirty] = React.useState(false)
  const [pending, setPending] = React.useState<PendingAction | null>(null)
  const [creating, setCreating] = React.useState<RoleInput | null>(null)
  // Права поточного користувача — сума прав його ролей: зміна ролі може їх змінити (профіль
  // кешує authProvider; не вдалося перечитати — useMe перезапитає сам).
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEYS.list }),
      refreshMe().catch(() =>
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ),
    ])

  if (query.isPending) return <SectionSkeleton rows={4} />
  if (query.isError)
    return isApiError(query.error) && query.error.status === 403 ? (
      <PageState kind="forbidden" className="min-h-40" />
    ) : (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const { roles, resources } = query.data
  const selected = shown ?? null
  /** Вибрати роль без діалогу: незбережене вже скинуто — охорона переходу не питає вдруге. */
  const go = (id: string | null) => {
    flushSync(() => {
      setDirty(false)
    })
    focusNext.current = routed
    if (onSelect) onSelect(id)
    else setOwnId(id)
  }
  const select = (id: string) => {
    if (id === selected?.id) return
    if (dirty) setPending({ kind: "select", id })
    else go(id)
  }
  /**
   * Нова роль чи копія: незбережені зміни поточної спершу — питання; відкинули їх — копія зі
   * збереженої ролі (`discarded`).
   */
  const startCreate = (input: RoleInput, discarded = input) => {
    if (dirty) setPending({ kind: "create", input: discarded })
    else setCreating(input)
  }
  /** Нова чи видалена роль — у кеші одразу: без «Роль не знайдено» до перечитування. */
  const patchRoles = (change: (list: Role[]) => Role[]) => {
    queryClient.setQueryData<Roles>(
      rolesKey,
      (data) => data && { ...data, roles: change(data.roles) },
    )
  }

  return (
    <div className="@container" data-slot="roles-editor">
      <div className="grid gap-6 @3xl:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <RoleList roles={roles} selectedId={selected?.id} onSelect={select} />
          {canEdit ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                startCreate({ name: "", permissions: [] })
              }}
            >
              <PlusIcon aria-hidden />
              {t("roles.create")}
            </Button>
          ) : null}
        </div>
        <div className="min-w-0 space-y-4">
          {!roles.length ? (
            <PageState
              kind="empty"
              title={t("roles.emptyTitle")}
              description={t("roles.emptyDescription")}
              className="min-h-40"
            />
          ) : !selected ? (
            <PageState
              kind="not-found"
              title={t("roles.notFoundTitle")}
              description={t("roles.notFoundDescription")}
              className="min-h-40"
            />
          ) : null}
          {selected && routed ? (
            // Роль в адресі: свій заголовок, на нього — фокус після вибору іншої (на телефоні права
            // під списком — так людина їх і бачить).
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-lg font-semibold break-words focus-visible:outline-none"
            >
              {selected.name}
            </h2>
          ) : null}
          {selected ? (
            <RoleDetail
              key={`${selected.id}:${String(draftKey)}`}
              role={selected}
              resources={resources}
              canEdit={canEdit}
              ceiling={ceiling}
              onDirtyChange={setDirty}
              onSaved={() => {
                void refresh()
              }}
              onDeleted={() => {
                patchRoles((list) => list.filter((r) => r.id !== selected.id))
                go(null)
                void refresh()
              }}
              onDuplicate={(input) => {
                startCreate(input, {
                  ...input,
                  description: selected.description,
                  permissions: selected.permissions,
                })
              }}
            />
          ) : null}
        </div>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("roles.unsavedTitle", { name: selected?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("roles.unsavedDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPending(null)
              }}
            >
              {t("roles.unsavedBack")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setPending(null)
                if (pending?.kind === "select") go(pending.id)
                else if (pending) {
                  setDraftKey((key) => key + 1)
                  setCreating(pending.input)
                }
              }}
            >
              {t("roles.unsavedDiscard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {creating ? (
        <CreateRoleDialog
          initial={creating}
          onClose={() => {
            setCreating(null)
          }}
          onCreated={(role) => {
            setCreating(null)
            patchRoles((list) => [...list, role])
            go(role.id)
            void refresh()
          }}
        />
      ) : null}
      {routed ? <UnsavedChangesGuard when={dirty} /> : null}
    </div>
  )
}
