import { useQueryClient } from "@tanstack/react-query"
import { useUpdate } from "ra-core"
import { useCallback, useRef, useState, type RefObject } from "react"
import { toast } from "sonner"

import { useUndoToast } from "@/components/erp/confirm-dialog"
import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useCompanyId } from "@/hooks/use-company"
import { isApiError } from "@/lib/api"
import { companyScope } from "@/lib/company-scope"

import { DICTIONARY_DEFAULTS, type DictionaryEntry } from "../contract"
import { useDictionariesT } from "../use-dictionaries-t"

/**
 * Вимкнути чи ввімкнути значення довідника: `PATCH` з `active` і `version`. Вимкнення зворотне, тож без
 * діалогу, з «Скасувати» в тості (SPEC §8.2); сервер прибирає вимкнене з типових, тож перечитуємо й їх.
 * Збій — повідомлення й перечитаний список: рядок могли змінити, вилучити чи заборонити. Поки йде запит
 * до значення, другий до нього ж не стартує: зі старою версією він отримав би 409. Інше значення чекати
 * не мусить: «Скасувати» в тості не можна просто проігнорувати, бо тост уже закрито.
 *
 * Вибраний фільтр стану прибирає рядок зі списку разом із кнопкою: тоді фокус іде на заголовок сторінки,
 * а не падає на `body`.
 */
export function useEntryToggle<T extends DictionaryEntry>(
  resource: string,
  heading: RefObject<HTMLHeadingElement | null>,
) {
  const t = useDictionariesT()
  const errorMessage = useApiErrorMessage()
  const companyId = useCompanyId()
  const queryClient = useQueryClient()
  const showUndo = useUndoToast()
  const savingRef = useRef(new Set<T["id"]>())
  const [isSaving, setSaving] = useState(false)
  const [update] = useUpdate<T>(undefined, undefined, {
    networkMode: "always",
  })
  const toggle = useCallback(
    async function run(entry: T, button?: HTMLElement, isUndo = false) {
      if (savingRef.current.has(entry.id)) return
      savingRef.current.add(entry.id)
      setSaving(true)
      const refresh = () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: [resource] }),
          queryClient.invalidateQueries({ queryKey: [DICTIONARY_DEFAULTS] }),
        ])
      try {
        const saved = await update(
          resource,
          {
            id: entry.id,
            data: {
              active: !entry.active,
              version: entry.version,
            } as Partial<T>,
            previousData: entry,
            meta: companyScope(companyId),
          },
          { mutationMode: "pessimistic", returnPromise: true },
        )
        // Нова версія вже є: «Скасувати» не мусить чекати, доки перечитається список.
        savingRef.current.delete(entry.id)
        const done = t(entry.active ? "common.disabled" : "common.enabled", {
          name: entry.name,
        })
        if (entry.active && saved)
          showUndo(done, () => {
            void run(saved, undefined, true)
          })
        else toast.success(done)
        await refresh()
        requestAnimationFrame(() => {
          if (button && !button.isConnected) heading.current?.focus()
        })
      } catch (failure: unknown) {
        const reason =
          isApiError(failure) && failure.code === "conflict"
            ? t("common.conflict")
            : errorMessage(failure)
        toast.error(
          isUndo
            ? t("common.undoFailed", { name: entry.name, reason })
            : reason,
        )
        void refresh()
      } finally {
        savingRef.current.delete(entry.id)
        setSaving(savingRef.current.size > 0)
      }
    },
    [
      t,
      errorMessage,
      companyId,
      queryClient,
      showUndo,
      update,
      resource,
      heading,
    ],
  )
  return { toggle, isSaving }
}
