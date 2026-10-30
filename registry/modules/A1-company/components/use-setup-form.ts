import { useCallback } from "react"
import { useForm, type Resolver } from "react-hook-form"

import { useErpAuthProvider, useFieldError } from "@/components/erp/auth-layout"
import { useRefreshCompany } from "@/components/erp/company-profile-state"
import {
  checkAll,
  fieldsOf,
  patchOf,
  serverFieldErrors,
  type Fields,
  type Key,
} from "@/components/erp/company-profile-values"
import type { CompanyProfile } from "@/lib/company"
import { useErpUiT } from "@/lib/i18n"

const trimmed = <T>(value: T) =>
  typeof value === "string" ? value.trim() : value

/**
 * Форма майстра першого запуску: ті самі правила й той самий `PATCH /company`, що у формі реквізитів.
 * Кожен крок зберігає свої поля: сервер, що прийняв крок, і є прогресом (ADR-0043).
 */
export function useSetupForm(profile: CompanyProfile) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const refresh = useRefreshCompany()
  const resolver = useCallback<Resolver<Fields>>(
    (values) => {
      const errors = Object.fromEntries(
        Object.entries(checkAll(t, values)).map(([key, message]) => [
          key,
          { type: "validate", message },
        ]),
      )
      return Object.keys(errors).length
        ? { values: {}, errors }
        : { values, errors: {} }
    },
    [t],
  )
  const form = useForm<Fields>({
    mode: "onTouched",
    resolver,
    defaultValues: fieldsOf(profile),
  })

  /**
   * Лише збережене стає стартовим: набране під час запиту й незбережені поля інших кроків лишаються.
   * Обрізаємо й незмінені ключі, інакше пробіл у кінці тримав би форму «зміненою» й питав на виході.
   */
  const markSaved = (keys: readonly Key[], values: Fields) => {
    for (const key of keys)
      if (form.getValues(key) === values[key])
        form.resetField(key, { defaultValue: trimmed(values[key]) })
  }

  /** `false` лишає людину на кроці; збій не про поля показує шаблон. */
  const save = async (keys: readonly Key[]): Promise<boolean> => {
    const isValid = await form.trigger([...keys], { shouldFocus: true })
    if (!isValid) return false
    const values = form.getValues()
    const saved = fieldsOf(profile)
    // Сервер отримує обрізане значення: пробіл у кінці не зміна, інакше кожне «Далі» слало б запит.
    const changed = keys.filter((key) => trimmed(values[key]) !== saved[key])
    if (changed.length === 0) {
      markSaved(keys, values)
      return true
    }
    try {
      await provider.company.update(patchOf(values, changed))
    } catch (failure) {
      const errors = Object.entries(
        serverFieldErrors(t, failure, keys, fieldError),
      )
      if (errors.length === 0) throw failure
      // Шаблон не показує помилку, бо це не збій кроку: фокус веде людину до поля.
      errors.forEach(([key, message], index) => {
        form.setError(
          key as Key,
          { type: "server", message },
          { shouldFocus: index === 0 },
        )
      })
      return false
    }
    await refresh()
    markSaved(keys, values)
    return true
  }

  return { form, save }
}

export type SetupForm = ReturnType<typeof useSetupForm>["form"]
