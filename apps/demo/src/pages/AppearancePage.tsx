import { useTranslation } from "react-i18next"

import { AppearanceControls } from "@/appearance/AppearanceControls"
import { TokenPreview } from "@/preview/TokenPreview"

import { PageHeader } from "./PageHeader"

export function AppearancePage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("appearancePage.title")}
        lead={t("appearancePage.lead")}
      />
      <div className="grid grid-cols-1 items-start gap-6 @5xl:grid-cols-3">
        <AppearanceControls />
        <div className="@5xl:col-span-2">
          <TokenPreview />
        </div>
      </div>
    </div>
  )
}
