import type { Control, FieldValues } from "react-hook-form"

import { FormField } from "@/components/erp/form"
import { PhoneInput } from "@/components/erp/phone-input"
import type { RecordFormItem } from "@/components/erp/record-form"
import { Input } from "@/components/ui/input"
import { formatPhone } from "@/lib/phone"

import { useContactsT } from "../use-contacts-t"

/** Телефон і email — однакові в організації й контакті. */
export function useContactChannelItems<TValues extends FieldValues>(
  control: Control<TValues>,
  prefix: "organization.form.fields" | "contact.form.fields",
): (RecordFormItem & { id: "phone" | "email" })[] {
  const t = useContactsT()
  const anyControl = control as unknown as Control<FieldValues>
  return [
    {
      id: "phone",
      label: t(`${prefix}.phone`),
      text: (value) => (typeof value === "string" ? formatPhone(value) : null),
      render: (props) => (
        <FormField
          {...props}
          control={anyControl}
          name="phone"
          render={({ field, control: aria }) => (
            <PhoneInput
              {...aria}
              ref={field.ref}
              name={field.name}
              value={field.value as string}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    {
      id: "email",
      label: t(`${prefix}.email`),
      render: (props) => (
        <FormField
          {...props}
          control={anyControl}
          name="email"
          render={({ field, control: aria }) => (
            <Input
              {...field}
              {...aria}
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
            />
          )}
        />
      ),
    },
  ]
}
