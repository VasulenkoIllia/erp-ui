/**
 * «Відновити» в кошику (PF16, ADR-0095): частина `erp/trash-view`, окремим файлом — картки, що лише
 * видаляють (`hooks/use-trash`), не вантажать код відновлення.
 */
import { useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { useAuthProvider } from "@/registry/lib/ra-core"
import * as React from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import {
  useRestoreErrorMessage,
  useTrashRefresh,
} from "@/registry/hooks/use-trash"
import type { ErpAuthProvider } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukTrash } from "@/registry/lib/i18n-uk-trash"
import {
  TRASH_QUERY_KEYS,
  type TrashEntry,
  type TrashPage,
} from "@/registry/lib/trash"

/**
 * Рядок зайнятий, поки йде запит; після — зникає з кешу одразу (збій перечитування не лишить відновлений
 * запис із кнопкою), сповіщення з «Відкрити» картку чи причиною збою, перечитування. `afterRestore(index)` —
 * коли рядки вже перечитано: фокус.
 */
export function useTrashRestore({
  resource,
  recordHref,
  afterRestore,
}: {
  resource: string
  recordHref: ((id: string) => string) | undefined
  afterRestore: (index: number) => void
}) {
  const t = useErpUiT(ukTrash)
  const provider = useAuthProvider<ErpAuthProvider>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const restoreError = useRestoreErrorMessage()
  const refresh = useTrashRefresh()
  const [restoring, setRestoring] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const mark = (id: string, isBusy: boolean) => {
    setRestoring((current) => {
      const next = new Set(current)
      if (isBusy) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const restore = (entry: TrashEntry, name: string, index: number) => {
    if (!provider || restoring.has(entry.id)) return
    mark(entry.id, true)
    provider.trash
      .restore(resource, entry.id)
      .then(() => {
        queryClient.setQueriesData<InfiniteData<TrashPage>>(
          { queryKey: [...TRASH_QUERY_KEYS.entries, resource] },
          (data) => data && withoutEntry(data, entry.id),
        )
        const href = recordHref?.(entry.id)
        toast.success(t("trash.restored", { name }), {
          ...(href
            ? {
                action: {
                  label: t("trash.openRestored"),
                  onClick: () => {
                    void navigate(href)
                  },
                },
              }
            : {}),
        })
      })
      .catch((failure: unknown) => {
        toast.error(restoreError(failure))
      })
      .finally(() => {
        void refresh(resource).then(() => {
          mark(entry.id, false)
          afterRestore(index)
        })
      })
  }
  return { restore, restoring }
}

/** Сторінки кошика без відновленого запису: рядок зникає, не чекаючи перечитування. */
function withoutEntry(
  data: InfiniteData<TrashPage>,
  id: string,
): InfiniteData<TrashPage> {
  const isListed = data.pages.some((page) =>
    page.data.some((entry) => entry.id === id),
  )
  if (!isListed) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      data: page.data.filter((entry) => entry.id !== id),
      total: Math.max(0, page.total - 1),
    })),
  }
}
