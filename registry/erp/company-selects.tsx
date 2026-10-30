import { PALETTES } from "@/registry/lib/appearance"
import { COMPANY_KINDS, type CompanyKind } from "@/registry/lib/company"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

/** Вибір типу компанії й палітри: форма реквізитів (erp/company-settings) і майстер першого запуску. */

/** Пункт «Як у бренду» у виборі палітри (палітри компанії немає). */
const BRAND = "brand"

interface SelectFieldProps<TValue> {
  readonly id: string
  readonly value: TValue
  readonly disabled?: boolean
  readonly describedBy?: string
  readonly onValueChange: (value: TValue) => void
}

function CompanySelect({
  id,
  items,
  value,
  disabled,
  describedBy,
  onValueChange,
}: SelectFieldProps<string> & {
  items: readonly { value: string; label: string }[]
}) {
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next: string | null) => {
        onValueChange(next ?? "")
      }}
    >
      <SelectTrigger id={id} className="w-full" aria-describedby={describedBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CompanyKindSelect({
  onValueChange,
  ...props
}: SelectFieldProps<CompanyKind>) {
  const t = useErpUiT()
  return (
    <CompanySelect
      {...props}
      items={COMPANY_KINDS.map((kind) => ({
        value: kind,
        label: t(`companySettings.kinds.${kind}`),
      }))}
      onValueChange={(next) => {
        if (next) onValueChange(next as CompanyKind)
      }}
    />
  )
}

/** Значення `""` — як у бренду. */
export function CompanyPaletteSelect({
  value,
  onValueChange,
  ...props
}: SelectFieldProps<string>) {
  const t = useErpUiT()
  return (
    <CompanySelect
      {...props}
      value={value || BRAND}
      items={[
        { value: BRAND, label: t("companySettings.paletteNone") },
        ...PALETTES.map((palette) => ({
          value: palette,
          label: t(`palettes.${palette}`),
        })),
      ]}
      onValueChange={(next) => {
        onValueChange(next === BRAND ? "" : next)
      }}
    />
  )
}
