import { useQueryClient } from "@tanstack/react-query"
import { useUpdate } from "ra-core"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useCompanyId } from "@/hooks/use-company"
import { isApiError } from "@/lib/api"
import { companyScope } from "@/lib/company-scope"

import {
  ORGANIZATIONS,
  type OrganizationCard,
  type OrganizationDetail,
} from "../contract"
import { useContactsT } from "../use-contacts-t"

/** Як завершилась дія: діалог видалення закривається, коли `saved` чи `conflict` (опис застарів). */
type DetailUpdateResult = "saved" | "conflict" | "failed" | "busy"

/** Повідомлення дії: `pending` — тост, поки йде запит (дія без діалогу, напр. «Зробити основним»). */
interface DetailUpdateMessages {
  readonly saved: string
  readonly pending?: string
}

/**
 * Зміна колекції без форми — видалити адресу чи рахунок, зробити рахунок основним (ADR-0028):
 * `PATCH /organizations/:id` з усією колекцією й `version`. Відповідь — детальний запис: картка
 * оновлюється з неї, списки перечитуються (новий основний IBAN у реквізитах і списку). Конфлікт 409 —
 * повідомлення й перечитана картка: людина бачить чужу зміну й повторює дію. Без мережі запит
 * одразу завершується помилкою «офлайн», а не чекає. Поки йде запит (`isSaving`), дії рядків
 * вимкнені, а наступна дія нічого не надсилає (`busy`): зі старою версією вона отримала б 409.
 */
export function useDetailUpdate() {
  const t = useContactsT()
  const errorMessage = useApiErrorMessage()
  const companyId = useCompanyId()
  const queryClient = useQueryClient()
  const savingRef = useRef(false)
  const [isSaving, setSaving] = useState(false)
  const [update] = useUpdate<OrganizationCard>(undefined, undefined, {
    networkMode: "always",
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [ORGANIZATIONS] })
  }
  const save = async (
    organization: OrganizationCard,
    changes: Partial<OrganizationDetail>,
    messages: DetailUpdateMessages,
  ): Promise<DetailUpdateResult> => {
    if (savingRef.current) return "busy"
    savingRef.current = true
    setSaving(true)
    // Той самий тост стає успіхом чи помилкою: скрінрідер чує і початок, і кінець дії.
    const id = messages.pending ? toast.loading(messages.pending) : undefined
    try {
      await update(
        ORGANIZATIONS,
        {
          id: organization.id,
          data: { ...changes, version: organization.version },
          previousData: organization,
          // Той самий ключ, що в запиту картки: ra-core оновить її кеш відповіддю сервера.
          meta: companyScope(companyId),
        },
        { mutationMode: "pessimistic", returnPromise: true },
      )
      toast.success(messages.saved, { id })
      refresh()
      return "saved"
    } catch (failure: unknown) {
      if (isApiError(failure) && failure.code === "conflict") {
        toast.error(t("organization.detail.conflict"), { id })
        // Картка показує збережене зараз: людина бачить чужу зміну й повторює дію.
        refresh()
        return "conflict"
      }
      toast.error(errorMessage(failure), { id })
      return "failed"
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  return { save, isSaving }
}
