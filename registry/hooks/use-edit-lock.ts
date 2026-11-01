/**
 * «Редагує [ім'я]» (SPEC §8.2, ADR-0051): хто зараз редагує запис і блокування на час своєї форми.
 *
 *   const lock = useEditLock({ resource: "contacts", id })
 *   <EditLockNotice holder={lock.holder} />                // `notice` шаблону картки
 *   <AccessAction lockReason={lock.reason} busy={lock.isAcquiring} … />
 *   const onEdit = async () => { if (await lock.acquire()) setEditing(true) }
 *   // форма закрилась: lock.release()
 *
 * - Хто редагує — із запиту, подія каналу перечитує його; без каналу запит опитується.
 * - `acquire` перед відкриттям форми: `false` — запис щойно взяла інша людина. Збій блокування не
 *   заважає редагувати (`true`): дані береже версія запису.
 * - Поки форма відкрита, блокування подовжується фоновим запитом; без дій людини півгодини — ні, і
 *   сервер відпускає запис сам. Запис тим часом узяв хтось: тост, форма лишається, дані береже
 *   порівняння при збереженні. Закінчив — блокування повертається до відкритої форми.
 * - Бекенд без адрес блокування (`isEditLockUnsupported`): хук мовчки нічого не робить.
 * - Хук прив'язаний до запису на весь час життя: картка має `key={id}`, інший запис — новий екземпляр.
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
  isEditLockUnsupported,
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
  /** Запит блокування ще йде: кнопка неактивна, повторний клік нічого не дасть. */
  readonly isAcquiring: boolean
  /** Взяти блокування перед формою: `false` — запис редагує інша людина. */
  readonly acquire: () => Promise<boolean>
  /** Відпустити: форма закрилась. Запит може не вдатись, тоді сервер відпустить сам. */
  readonly release: () => void
}

const FREE: EditLockState = { holder: null, expiresAt: null }

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
  const [isAcquiring, setAcquiring] = React.useState(false)
  /** Зростає, коли форму закрили: відповідь на старий `PUT` уже нікому не потрібна. */
  const generation = React.useRef(0)
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
      isEditLockUnsupported(state.error) || status === "open"
        ? false
        : EDIT_LOCK_POLL_MS,
  })

  useRealtimeEvent((event) => {
    if (!isActive) return
    const isThisRecord =
      event.type === editLockEventType(resource) && event.id === id
    if (isThisRecord || event.type === REALTIME_RESYNC)
      void queryClient.invalidateQueries({ queryKey })
  })

  const isSupported = isActive && !isEditLockUnsupported(query.error)
  // Поки профіль не прийшов, свого блокування не вважаємо чужим.
  const isOthers = ({ holder }: EditLockState) =>
    holder !== null && me?.id !== undefined && holder.id !== me.id

  /** Взяти чи подовжити; `null` — відповіді немає чи вона вже нікому не потрібна. */
  const take = async (
    options: { background?: boolean } = {},
  ): Promise<EditLockState | null> => {
    if (!isSupported || id === undefined) return null
    const started = generation.current
    try {
      const lock = await dataProvider.takeEditLock(resource, id, options)
      if (started === generation.current) {
        queryClient.setQueryData<EditLockState>(queryKey, lock)
        return lock
      }
      // `PUT` обігнав `DELETE`: запис не лишається зайнятим до кінця терміну.
      if (!isOthers(lock))
        void dataProvider.releaseEditLock(resource, id).catch(() => undefined)
      return null
    } catch {
      return null
    }
  }

  const acquire = async () => {
    setAcquiring(true)
    const lock = await take()
    setAcquiring(false)
    if (lock === null) return true
    setHeld(!isOthers(lock))
    return !isOthers(lock)
  }

  const release = () => {
    if (!isHeld || id === undefined) return
    generation.current += 1
    setHeld(false)
    queryClient.setQueryData<EditLockState>(queryKey, (lock) =>
      lock && isOthers(lock) ? lock : FREE,
    )
    // Не вдалось — сервер відпустить сам, коли мине термін.
    void dataProvider.releaseEditLock(resource, id).catch(() => undefined)
  }

  const holder = query.data && isOthers(query.data) ? query.data.holder : null
  const lostTo = isHeld ? (holder?.name ?? null) : null
  useLockRefresh(isHeld && lostTo === null, () => take({ background: true }))

  const warnLost = React.useEffectEvent((name: string) => {
    toast.warning(t("editLock.lost", { name }))
  })
  React.useEffect(() => {
    if (lostTo !== null) warnLost(lostTo)
  }, [lostTo])

  const releaseOnLeave = React.useEffectEvent(release)
  React.useEffect(() => {
    if (!isHeld) return
    return () => {
      releaseOnLeave()
    }
  }, [isHeld])
  React.useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  return {
    holder,
    reason: holder ? t("editLock.reason", { name: holder.name }) : undefined,
    isAcquiring,
    acquire,
    release,
  }
}

/** Подовжує блокування, поки людина щось робить на сторінці. */
function useLockRefresh(isHeld: boolean, refresh: () => Promise<unknown>) {
  const onTick = React.useEffectEvent(refresh)
  React.useEffect(() => {
    if (!isHeld) return
    let lastActivity = Date.now()
    const noteActivity = () => {
      lastActivity = Date.now()
    }
    // На перехопленні: поле, що зупиняє подію, теж рахується роботою людини.
    window.addEventListener("pointerdown", noteActivity, true)
    window.addEventListener("keydown", noteActivity, true)
    const timer = setInterval(() => {
      if (Date.now() - lastActivity < EDIT_LOCK_IDLE_MS) void onTick()
    }, EDIT_LOCK_REFRESH_MS)
    return () => {
      clearInterval(timer)
      window.removeEventListener("pointerdown", noteActivity, true)
      window.removeEventListener("keydown", noteActivity, true)
    }
  }, [isHeld])
}
