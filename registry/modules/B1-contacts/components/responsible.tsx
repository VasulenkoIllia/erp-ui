import { useMemo } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { useMe } from "@/hooks/use-me"
import { useExtensionFields, type ExtensionField } from "@/lib/extension-fields"
import type { ExtensionFormChanges } from "@/lib/extension-form"
import { permissionScope } from "@/lib/roles"

import { RESPONSIBLE_ID, responsibleExtensionField } from "../contract"
import { useContactsT } from "../use-contacts-t"

/**
 * Поле «Відповідальний» організації й контакту (ADR-0039): запис із довідника `users`, ключ один у
 * колонці, фільтрі, шапці картки й формі — ним поле ховає розширення (`hide`). Колонку, фільтр, підпис
 * із сервера й вибір у формі дають ті самі частини кіта, що й полю-запису розширення (ADR-0030).
 */

const COLUMN = { id: RESPONSIBLE_ID, minWidth: 12, priority: 6 }
const FILTER = { id: RESPONSIBLE_ID }

/** Колонка списку, фільтр панелі й поле шапки картки. */
export function useResponsible() {
  const t = useContactsT()
  const fields = useMemo(
    () => [responsibleExtensionField(t("responsible.label"))],
    [t],
  )
  const api = useExtensionFields(fields)
  return useMemo(
    () => ({
      column: { ...api.column(COLUMN), id: RESPONSIBLE_ID },
      filter: { ...api.filter(FILTER), id: RESPONSIBLE_ID },
      headerField: (record: unknown) => ({
        ...api.displayEntry(FILTER, record),
        id: RESPONSIBLE_ID,
      }),
    }),
    [api],
  )
}

/** Чи дія над ресурсом людині дозволена лише на свої записи. */
export function useOwnScope(
  resource: string,
  action: "read" | "update",
): boolean {
  const { data: me } = useMe()
  return me
    ? permissionScope(me.permissions, resource, action) === "own"
    : false
}

/**
 * Поля й зміни форми для `useExtensionForm` з полем відповідального, якщо розширення його не сховало.
 * Форма надсилає його як поле розширення: схема, значення й порівняння при конфлікті — ті самі.
 */
export function useResponsibleForm<K extends string>(
  fields: readonly ExtensionField[] | undefined,
  changes: ExtensionFormChanges<K> | undefined,
  {
    resource,
    isNew,
    after,
  }: {
    resource: string
    isNew: boolean
    /** Поле форми, після якого стоїть відповідальний. */
    after: K
  },
): {
  fields: readonly ExtensionField[] | undefined
  changes: ExtensionFormChanges<K> | undefined
} {
  const t = useContactsT()
  const seesOwn = useOwnScope(resource, "read")
  const changesOwn = useOwnScope(resource, "update")
  const hint = isNew
    ? t("responsible.createHint")
    : seesOwn || changesOwn
      ? t("responsible.transferHint")
      : undefined
  const label = t("responsible.label")
  return useMemo(() => {
    const hidden: readonly string[] = changes?.hide ?? []
    if (hidden.includes(RESPONSIBLE_ID)) return { fields, changes }
    return {
      fields: [...(fields ?? []), responsibleExtensionField(label)],
      changes: {
        ...changes,
        add: [
          ...(changes?.add ?? []),
          {
            id: RESPONSIBLE_ID,
            place: { after },
            description: hint,
          },
        ],
      },
    }
  }, [fields, changes, label, hint, after])
}

/**
 * Перевірка збереженого запису: людина, що бачить лише свої записи, передала його колезі, зняла
 * відповідального чи створила на колегу. Картки їй не відкрити, тож каже про це тостом і повертає
 * `true`. Бекенд без поля (`undefined` у відповіді) записів не передає.
 */
export function useAnnounceHandover(resource: string) {
  const t = useContactsT()
  const { data: me } = useMe()
  const seesOwn = useOwnScope(resource, "read")
  return (saved: { responsibleId?: string | null }) => {
    const isHandedOver =
      seesOwn &&
      saved.responsibleId !== undefined &&
      saved.responsibleId !== me?.id
    if (isHandedOver) toast.info(t("responsible.transferred"))
    return isHandedOver
  }
}

/** Після передачі — до списку, а не «не знайдено». */
export function useLeaveAfterTransfer(resource: string, listPath: string) {
  const announceHandover = useAnnounceHandover(resource)
  const navigate = useNavigate()
  return (saved: { responsibleId?: string | null }) => {
    if (announceHandover(saved)) void navigate(listPath)
  }
}
