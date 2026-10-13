import { AppearanceControls } from "@/appearance/AppearanceControls"
import { TokenPreview } from "@/preview/TokenPreview"
import { strings } from "@/strings"

import { PageHeader } from "./PageHeader"

export function AppearancePage() {
  const s = strings.appearancePage
  return (
    <div className="space-y-6">
      <PageHeader title={s.title} lead={s.lead} />
      <div className="grid items-start gap-6 @5xl:grid-cols-3">
        <AppearanceControls />
        <div className="@5xl:col-span-2">
          <TokenPreview />
        </div>
      </div>
    </div>
  )
}
