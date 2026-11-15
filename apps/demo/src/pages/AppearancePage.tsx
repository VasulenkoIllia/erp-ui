import { AppearanceControls } from "@/appearance/AppearanceControls"
import { UserMenuVariants } from "@/appearance/UserMenuVariants"
import { MotionPreview } from "@/preview/MotionPreview"
import { TokenPreview } from "@/preview/TokenPreview"
import { useDemoTranslation } from "@/i18n"
import { ukAppearancePage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"

export function AppearancePage() {
  const { t } = useDemoTranslation([ukAppearancePage])
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("appearancePage.title")}
        lead={t("appearancePage.lead")}
      />
      <div className="grid grid-cols-1 items-start gap-6 @5xl:grid-cols-3">
        <div className="space-y-6">
          <AppearanceControls />
          <UserMenuVariants />
        </div>
        <div className="space-y-6 @5xl:col-span-2">
          <TokenPreview />
          <MotionPreview />
        </div>
      </div>
    </div>
  )
}
