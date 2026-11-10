import { useQueryClient } from "@tanstack/react-query"
import { useDelete } from "ra-core"
import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/erp/confirm-dialog"
import { DeniedAction } from "@/components/erp/permission-gate"
import { Button } from "@/components/ui/button"
import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useCompanyId } from "@/hooks/use-company"
import { isApiError } from "@/lib/api"
import { companyScope } from "@/lib/company-scope"
import { ACTION_ICONS } from "@/lib/icons"

import type { K2Document } from "../contract"
import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { useDocumentAccess } from "./invoice-access"

const DeleteIcon = ACTION_ICONS.delete

/** Після цих відповідей повтор нічого не дасть: документ уже провели, видалили чи право забрали. */
const FINAL_STATUSES: ReadonlySet<number> = new Set([403, 404])

/**
 * «Видалити чернетку» в шапці картки документа модуля (ADR-0066): лише чернетка без номера, право
 * `<ресурс>:delete`. Виставлений і скасований документ — неактивна кнопка з причиною словами модуля,
 * закритий період — причиною кіта, поки запис редагує
 * інша людина — з причиною блокування (SPEC §8.4). Підтвердження називає наслідок (`description`: чернетка
 * з замовлення звільняє його, ADR-0070); після видалення — список. Відмова сервера (провели за мить до того)
 * — сповіщення з причиною, картка перечитується.
 */
export function DocumentDeleteAction({
  kind,
  document,
  description,
  lockReason,
}: {
  kind: K2DocumentKind
  document: K2Document
  /** Наслідок видалення в підтвердженні. */
  description: string
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason: string | undefined
}) {
  const t = useInvoicesT()
  const navigate = useNavigate()
  const { paths } = useInvoicesModule()
  const companyId = useCompanyId()
  const errorMessage = useApiErrorMessage()
  const queryClient = useQueryClient()
  const [remove] = useDelete<K2Document>()
  const { key, resource } = kind
  const { canAccess, isPending, recordReason } = useDocumentAccess(
    kind,
    "delete",
    document,
  )
  const [open, setOpen] = useState(false)
  const reason = canAccess
    ? lockReason
    : (recordReason ?? t(`${key}.delete.denied`))
  // Дію заборонили, поки діалог відкритий (чернетку взяли в редагування): діалог закривається, а не
  // з'являється сам, коли заборону знімуть.
  if (open && (isPending || reason !== undefined)) setOpen(false)
  if (isPending) return null
  const content = (
    <>
      <DeleteIcon aria-hidden />
      {t(`${key}.delete.button`)}
    </>
  )
  if (reason !== undefined)
    return <DeniedAction reason={reason}>{content}</DeniedAction>
  const confirm = async () => {
    try {
      await remove(
        resource,
        {
          id: document.id,
          previousData: document,
          meta: companyScope(companyId),
        },
        { mutationMode: "pessimistic", returnPromise: true },
      )
      toast.success(t(`${key}.delete.done`))
      setOpen(false)
      void navigate(kind.pathsOf(paths).list)
    } catch (failure: unknown) {
      toast.error(errorMessage(failure))
      if (isApiError(failure) && FINAL_STATUSES.has(failure.status)) {
        setOpen(false)
        void queryClient.invalidateQueries({ queryKey: [resource] })
      }
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        {content}
      </Button>
      <ConfirmDialog
        open={open}
        title={t(`${key}.delete.title`)}
        description={description}
        confirmLabel={t(`${key}.delete.confirm`)}
        destructive
        lockWhileBusy
        // Після видалення кнопки вже немає: фокус ставить заголовок списку після переходу.
        returnFocus={() => false}
        onClose={() => {
          setOpen(false)
        }}
        onConfirm={confirm}
      />
    </>
  )
}
