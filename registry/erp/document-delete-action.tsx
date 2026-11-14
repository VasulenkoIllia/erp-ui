import { useQueryClient } from "@tanstack/react-query"
import { useDelete, type RaRecord } from "ra-core"
import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import {
  useRecordAccess,
  type RecordDenialText,
} from "@/registry/hooks/use-record-access"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"

const DeleteIcon = ACTION_ICONS.delete

/** Після цих відповідей повтор нічого не дасть: документ уже провели, видалили чи право забрали. */
const FINAL_STATUSES: ReadonlySet<number> = new Set([403, 404])

/** Тексти дії словами модуля: «Видалити чернетку», «Видалити чернетку рахунку?». */
export interface DocumentDeleteTexts {
  readonly button: string
  /** Причина без права ролі `<ресурс>:delete`. */
  readonly denied: string
  /** Сповіщення після видалення. */
  readonly done: string
  readonly title: string
  /** Наслідок видалення в підтвердженні. */
  readonly description: string
  readonly confirm: string
}

/**
 * «Видалити чернетку» в шапці картки документа (ADR-0066, ADR-0086): лише чернетка без номера, право
 * `<ресурс>:delete`. Проведений і скасований документ — неактивна кнопка з причиною словами модуля
 * (`moduleText`), закритий період — причиною кіта, поки запис редагує інша людина — з причиною блокування
 * (SPEC §8.4). Підтвердження називає наслідок; після видалення — список. Відмова сервера (провели за мить
 * до того) — сповіщення з причиною, картка перечитується.
 */
export function DocumentDeleteAction({
  resource,
  document,
  listPath,
  texts,
  moduleText,
  lockReason,
}: {
  resource: string
  document: RaRecord
  /** Куди після видалення: список документів. */
  listPath: string
  texts: DocumentDeleteTexts
  /** Слова модуля для кодів позначки сервера (`useRecordAccess`). */
  moduleText?: RecordDenialText | undefined
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason: string | undefined
}) {
  const navigate = useNavigate()
  const companyId = useCompanyId()
  const errorMessage = useApiErrorMessage()
  const queryClient = useQueryClient()
  const [remove] = useDelete()
  const { canAccess, isPending, recordReason } = useRecordAccess({
    resource,
    action: "delete",
    record: document,
    moduleText,
  })
  const [open, setOpen] = useState(false)
  const reason = canAccess ? lockReason : (recordReason ?? texts.denied)
  // Дію заборонили, поки діалог відкритий (чернетку взяли в редагування): діалог закривається, а не
  // з'являється сам, коли заборону знімуть.
  if (open && (isPending || reason !== undefined)) setOpen(false)
  if (isPending) return null
  const content = (
    <>
      <DeleteIcon aria-hidden />
      {texts.button}
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
      toast.success(texts.done)
      setOpen(false)
      void navigate(listPath)
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
        title={texts.title}
        description={texts.description}
        confirmLabel={texts.confirm}
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
