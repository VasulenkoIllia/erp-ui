import { CompanyImages } from "@/components/erp/company-images"
import { CompanyPaletteSelect } from "@/components/erp/company-selects"
import { FormField } from "@/components/erp/form"
import { useErpUiT } from "@/lib/i18n"

import type { SetupForm } from "./use-setup-form"

/** Крок «Логотип і палітра»: зображення зберігаються одразу, палітра — кнопкою «Далі». */
export function SetupBrandStep({
  form,
  showLogo,
}: {
  form: SetupForm
  showLogo: boolean
}) {
  const t = useErpUiT()
  return (
    <div className="space-y-6">
      {showLogo ? <CompanyImages /> : null}
      <FormField
        control={form.control}
        name="palette"
        label={t("companySettings.palette")}
        description={t("companySettings.paletteHint")}
        render={({ field, control }) => (
          <CompanyPaletteSelect
            id={control.id}
            value={field.value}
            describedBy={control["aria-describedby"]}
            onValueChange={field.onChange}
          />
        )}
      />
    </div>
  )
}
