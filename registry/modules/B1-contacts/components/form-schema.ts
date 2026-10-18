import { useMemo } from "react"
import { z } from "zod"

import { useErpUiT, useLanguage } from "@/lib/i18n"
import { validatePhone } from "@/lib/phone"

/**
 * Спільне для форм організації й контакту (ADR-0026): схеми полів з текстами помилок мовою
 * інтерфейсу (`validation.*` кіта), поля, сховані розширенням, і поля модуля для запиту.
 */

/**
 * Поля модуля, які розширення сховало з форми (`form.hide`, крім закріплених). Їх не перевіряємо:
 * старе значення, якого користувач не бачить і не може виправити, не має блокувати збереження.
 */
export function hiddenFormFields(
  changes: { readonly hide?: readonly string[] } | undefined,
  locked: readonly string[],
): ReadonlySet<string> {
  return new Set(changes?.hide?.filter((id) => !locked.includes(id)))
}

/** Назва чи ім'я, телефон (E.164, LC12) і email; порожні телефон і email — «не вказано». */
export function useContactFieldSchemas(hidden: ReadonlySet<string>) {
  const t = useErpUiT()
  return useMemo(
    () => ({
      name: z.string().trim().min(1, t("validation.required")),
      phone: hidden.has("phone")
        ? z.string()
        : z.string().superRefine((phone, ctx) => {
            const issue = phone ? validatePhone(phone) : null
            if (issue)
              ctx.addIssue({
                code: "custom",
                message: t(`validation.phone.${issue}`),
              })
          }),
      email: hidden.has("email")
        ? z.string()
        : z
            .string()
            .trim()
            .refine(
              (email) => !email || z.email().safeParse(email).success,
              t("validation.email"),
            ),
    }),
    [t, hidden],
  )
}

/** Назва коду; на код, якого `Intl.DisplayNames` не розбирає (`"U$D"`), — без назви, а не помилка. */
function displayName(names: Intl.DisplayNames, code: string) {
  try {
    return names.of(code)
  } catch {
    return undefined
  }
}

/**
 * Варіанти коду з назвою мовою інтерфейсу (країна, валюта — `Intl.DisplayNames`). Код запису, якого
 * немає серед варіантів форми, лишається у виборі: зміна іншого поля його не підмінить.
 */
export function useCodeItems(
  codes: readonly string[],
  current: string | undefined,
  type: "region" | "currency",
): { value: string; label: string }[] {
  const { locale } = useLanguage()
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type })
    const all =
      current && !codes.includes(current) ? [...codes, current] : codes
    return all.map((code) => {
      const name = displayName(names, code)
      return {
        value: code,
        label:
          type === "currency" && name ? `${code} · ${name}` : (name ?? code),
      }
    })
  }, [codes, current, type, locale])
}

/** Підпис варіанта вибору за значенням — для порівняння при конфлікті. */
export const choiceText =
  (items: readonly { value: string; label: string }[]) => (value: unknown) =>
    items.find((item) => item.value === value)?.label ?? null

/** Поля модуля з `keys` для запиту; поля розширення додає `useExtensionForm().payload`. */
export function moduleFieldsOf<K extends string>(
  values: Readonly<Record<string, unknown>>,
  fields: readonly K[],
  keys: readonly string[],
): Partial<Record<K, unknown>> {
  return Object.fromEntries(
    fields
      .filter((field) => keys.includes(field))
      .map((field) => [field, values[field]]),
  ) as Partial<Record<K, unknown>>
}
