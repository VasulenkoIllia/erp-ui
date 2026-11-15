/**
 * Кошик в інтерфейсі (lib/trash, PF16, ADR-0095): чи переносить сервер записи ресурсу в кошик, текст
 * збою відновлення й «Скасувати» після видалення.
 *
 * - Налаштування читаються раз на компанію й не застарівають: строк і ресурси кошика сервер не міняє
 *   посеред роботи. Бекенд без кошика (404) — `keeps: false`: видалення назавжди з підтвердженням.
 * - Збій налаштувань (мережа, 500) — теж `keeps: false`: людина побачить підтвердження, а не
 *   видалення без нього, яке не можна повернути.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuthProvider } from "@/registry/lib/ra-core"
import * as React from "react"
import { toast } from "sonner"

import { useUndoToast } from "@/registry/erp/confirm-dialog"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import type { ErpAuthProvider } from "@/registry/lib/auth"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukTrash } from "@/registry/lib/i18n-uk-trash"
import {
  keepsInTrash,
  RESTORE_CONFLICT,
  TRASH_QUERY_KEYS,
  type TrashSettings,
} from "@/registry/lib/trash"

export interface TrashSettingsState {
  /** Налаштування; `null` — бекенд кошика не веде; `undefined` — ще вантажаться чи збій. */
  readonly settings: TrashSettings | null | undefined
  readonly isPending: boolean
}

export function useTrashSettings(): TrashSettingsState {
  const provider = useAuthProvider<ErpAuthProvider>()
  const companyId = useCompanyId()
  const query = useQuery({
    queryKey: [...TRASH_QUERY_KEYS.settings, companyScope(companyId)],
    queryFn: () => {
      if (!provider) throw new Error("authProvider is required")
      return provider.trash.getSettings()
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    enabled: Boolean(provider),
  })
  return {
    settings: query.isError ? undefined : query.data,
    // Без мережі запит на паузі: кнопка не чекає, видалення йде з підтвердженням.
    isPending:
      query.isPending && !query.isError && query.fetchStatus !== "paused",
  }
}

export interface KeepsInTrash {
  /** Сервер переносить записи ресурсу в кошик; `undefined` — ще невідомо. */
  readonly keeps: boolean | undefined
  /** Скільки днів сервер тримає видалене. */
  readonly retentionDays: number | undefined
}

/** Чи переносить сервер записи ресурсу в кошик: збій налаштувань — ні (видалення з підтвердженням). */
export function useKeepsInTrash(resource: string): KeepsInTrash {
  const { settings, isPending } = useTrashSettings()
  if (isPending) return { keeps: undefined, retentionDays: undefined }
  return {
    keeps: keepsInTrash(settings ?? null, resource) ?? false,
    retentionDays: settings?.retentionDays,
  }
}

/**
 * «Відновити їх можна з кошика протягом 30 днів» для підтвердження масового видалення: модуль додає його до
 * свого опису; без кошика чи поки налаштування не прочитались — `undefined`, опис без нього.
 */
export function useTrashKeptFor(resource: string): string | undefined {
  const t = useErpUiT(ukTrash)
  const { keeps, retentionDays } = useKeepsInTrash(resource)
  return keeps && retentionDays !== undefined
    ? t("trash.keptFor", { count: retentionDays })
    : undefined
}

/** Текст збою відновлення: запису вже немає, його місце зайняв інший — словами кошика. */
export function useRestoreErrorMessage(): (error: unknown) => string {
  const t = useErpUiT(ukTrash)
  const errorMessage = useApiErrorMessage()
  return React.useCallback(
    (error: unknown) => {
      if (isApiError(error) && error.status === 404)
        return t("trash.restoreGone")
      if (isApiError(error) && error.code === RESTORE_CONFLICT)
        return t("trash.restoreConflict")
      return errorMessage(error)
    },
    [errorMessage, t],
  )
}

/** Перечитати після видалення чи відновлення: списки ресурсу й кошик. */
export function useTrashRefresh(): (resource: string) => Promise<void> {
  const queryClient = useQueryClient()
  return React.useCallback(
    async (resource: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [resource] }),
        queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEYS.entries }),
      ])
    },
    [queryClient],
  )
}

export interface MovedToTrash {
  readonly resource: string
  readonly id: string
  /** Назва запису для «Відновлено: …». */
  readonly name: string
  /** Сповіщення словами модуля: «Чернетку перенесено в кошик»; без нього — текст кіта. */
  readonly message?: string
}

/**
 * Сповіщення «Перенесено в кошик» зі «Скасувати» (SPEC §8.2, рівень 1): тост не зникає сам, «Скасувати»
 * повертає запис із кошика, списки перечитуються. Збій повернення — сповіщення з причиною. Кошик на тому
 * самому екрані перечитується одразу: запис уже в ньому.
 */
export function useMovedToTrash(): (moved: MovedToTrash) => void {
  const t = useErpUiT(ukTrash)
  const provider = useAuthProvider<ErpAuthProvider>()
  const showUndo = useUndoToast()
  const restoreError = useRestoreErrorMessage()
  const refresh = useTrashRefresh()
  return React.useCallback(
    ({ resource, id, name, message }: MovedToTrash) => {
      void refresh(resource)
      showUndo(message ?? t("trash.moved"), () => {
        if (!provider) return
        provider.trash
          .restore(resource, id)
          .then(() => {
            toast.success(t("trash.restored", { name }))
          })
          .catch((failure: unknown) => {
            toast.error(
              t("trash.undoFailed", { reason: restoreError(failure) }),
            )
          })
          .finally(() => {
            void refresh(resource)
          })
      })
    },
    [provider, refresh, restoreError, showUndo, t],
  )
}
