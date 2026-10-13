import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Стани сторінки SPEC §8.1 у контейнерах — так, як їх побачить користувач у списку. */
export function StatesPage() {
  const { t } = useTranslation("demo", { keyPrefix: "statesPage" })
  const Create = ACTION_ICONS.create
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-2">
        <Section title={t("loading")}>
          <PageSkeleton rows={4} />
        </Section>
        <PageState
          kind="empty"
          action={
            <Button>
              <Create aria-hidden />
              {t("createInvoice")}
            </Button>
          }
        />
        <PageState
          kind="no-results"
          onReset={() => {
            toast(t("reset"))
          }}
        />
        <PageState
          kind="error"
          onRetry={() => {
            toast(t("retried"))
          }}
        />
        <PageState kind="forbidden" />
        <PageState
          kind="offline"
          onRetry={() => {
            toast(t("retried"))
          }}
        />
        <PageState kind="not-found" />
      </div>
    </div>
  )
}
