/**
 * «Редагує [ім'я]» (SPEC §8.2, ADR-0051): хто зараз редагує запис і блокування на час своєї форми.
 *
 *   const lock = useEditLock({ resource: "contacts", id })
 *   <EditLockNotice holder={lock.holder} />                // `notice` шаблону картки
 *   <AccessAction lockReason={lock.reason} … />            // «Редагувати» неактивна з причиною
 *   const onEdit = async () => { if (await lock.acquire()) setEditing(true) }
 *   // форма закрилась: lock.release()
 *
 * - Хто редагує — із запиту, подія каналу перечитує його; без каналу запит опитується.
 * - `acquire` перед відкриттям форми: `false` — запис щойно взяла інша людина. Збій блокування не
 *   заважає редагувати (`true`): дані береже версія запису.
 * - Поки форма відкрита, блокування подовжується; без дій людини півгодини — ні, і сервер відпускає
 *   запис сам. Людина повернулась, а запис уже взяв хтось: тост про це, форма лишається, а дані
 *   береже порівняння при збереженні.
 * - Бекенд без адрес блокування: `GET` дає 404, і хук мовчки нічого не робить.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDataProvider } from "ra-core"
import * as React from "react"
import { toast } from "sonner"

import { useCompanyId } from "@/registry/hooks/use-company"
import { useMe } from "@/registry/hooks/use-me"
import {
  useRealtimeEvent,
  useRealtimeStatus,
} from "@/registry/hooks/use-realtime"
import { companyScope } from "@/registry/lib/company-scope"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  EDIT_LOCK_IDLE_MS,
  EDIT_LOCK_POLL_MS,
  EDIT_LOCK_QUERY_KEY,
  EDIT_LOCK_REFRESH_MS,
  editLockEventType,
  type EditLockHolder,
  type EditLockState,
} from "@/registry/lib/edit-lock"
import { useErpUiT } from "@/registry/lib/i18n"
import { REALTIME_RESYNC } from "@/registry/lib/realtime"

export interface UseEditLockOptions {
  readonly resource: string
  /** Запису ще немає — запитів немає. */
  readonly id: string | undefined
  /** `false` — проект вимкнув блокування цього ресурсу. */
  readonly enabled?: boolean
}

export interface EditLock {
  /** Хто редагує запис, якщо не я. */
  readonly holder: EditLockHolder | null
  /** Причина для неактивної «Редагувати», поки запис редагує інша людина. */
  readonly reason: string | undefined
  /** Взяти блокування перед формою: `false` — запис редагує інша людина. */
  readonly acquire: () => Promise<boolean>
  /** Відпустити: форма закрилась. Запит може не вдатись, тоді сервер відпустить сам. */
  readonly release: () => void
}

export function useEditLock({
  resource,
  id,
  enabled = true,
}: UseEditLockOptions): EditLock {
  const t = useErpUiT()
  const dataProvider = useDataProvider<ErpDataProvider>()
  const queryClient = useQueryClient()
  const companyId = useCompanyId()
  const { data: me } = useMe()
  const status = useRealtimeStatus()
  const [isHeld, setHeld] = React.useState(false)
  const queryKey = React.useMemo(
    () => [...EDIT_LOCK_QUERY_KEY, resource, id, companyScope(companyId)],
    [resource, id, companyId],
  )
  const isActive = enabled && id !== undefined

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      dataProvider.getEditLock(resource, id ?? "", { signal }),
    enabled: isActive,
    retry: false,
    refetchInterval: ({ state }) =>
      state.status !== "error" && status !== "open" ? EDIT_LOCK_POLL_MS : false,
  })

  useRealtimeEvent((event) => {
    if (!isActive) return
    const isThisRecord =
      event.type === editLockEventType(resource) && event.id === id
    if (isThisRecord || event.type === REALTIME_RESYNC)
      void queryClient.invalidateQueries({ queryKey })
  })

  // Бекенд без блокувань (`GET` не вдався): без подовжень і зайвих запитів.
  const isSupported = isActive && query.status !== "error"
  // Поки профіль не прийшов, свого блокування не вважаємо чужим.
  const isOthers = ({ holder }: EditLockState) =>
    holder !== null && me?.id !== undefined && holder.id !== me.id

  /** Взяти чи подовжити; `null` — запит не вдався, вважаємо, що блокувань немає. */
  const take = async (): Promise<EditLockState | null> => {
    if (!isSupported || id === undefined) return null
    try {
      const lock = await dataProvider.takeEditLock(resource, id)
      queryClient.setQueryData<EditLockState>(queryKey, lock)
      return lock
    } catch {
      return null
    }
  }

  const acquire = async () => {
    const lock = await take()
    if (lock === null) return true
    setHeld(!isOthers(lock))
    return !isOthers(lock)
  }

  const refresh = async () => {
    const lock = await take()
    if (lock?.holder && isOthers(lock)) {
      setHeld(false)
      toast.warning(t("editLock.lost", { name: lock.holder.name }))
    }
  }

  const release = () => {
    if (!isHeld || id === undefined) return
    setHeld(false)
    queryClient.setQueryData<EditLockState>(queryKey, {
      holder: null,
      expiresAt: null,
    })
    // Не вдалось — сервер відпустить сам, коли мине термін.
    void dataProvider.releaseEditLock(resource, id).catch(() => undefined)
  }

  useLockRefresh(isHeld, refresh)
  const releaseOnLeave = React.useEffectEvent(release)
  React.useEffect(() => {
    if (!isHeld) return
    return () => {
      releaseOnLeave()
    }
  }, [isHeld])

  const holder = query.data && isOthers(query.data) ? query.data.holder : null
  return {
    holder,
    reason: holder ? t("editLock.reason", { name: holder.name }) : undefined,
    acquire,
    release,
  }
}

/** Подовжує блокування, поки людина щось робить на сторінці. */
function useLockRefresh(isHeld: boolean, refresh: () => Promise<void>) {
  const onTick = React.useEffectEvent(refresh)
  React.useEffect(() => {
    if (!isHeld) return
    let lastActivity = Date.now()
    const noteActivity = () => {
      lastActivity = Date.now()
    }
    window.addEventListener("pointerdown", noteActivity)
    window.addEventListener("keydown", noteActivity)
    const timer = setInterval(() => {
      if (Date.now() - lastActivity < EDIT_LOCK_IDLE_MS) void onTick()
    }, EDIT_LOCK_REFRESH_MS)
    return () => {
      clearInterval(timer)
      window.removeEventListener("pointerdown", noteActivity)
      window.removeEventListener("keydown", noteActivity)
    }
  }, [isHeld])
}
