import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { UnsavedChangesGuard } from "@/registry/erp/form"
import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { ChunkLoadError } from "@/registry/lib/lazy"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import { Label } from "@/registry/ui/label"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Те, що межа помилок отримує, коли файла чанка вже немає на сервері. */
function FailedChunk(): never {
  throw new ChunkLoadError(new Error("demo"), () => undefined)
}

/** Збій чанка (ADR-0055): справжня межа помилок, «Оновити сторінку» оновлює цю сторінку. */
function ChunkFailureSection() {
  const { t } = useTranslation("demo", { keyPrefix: "statesPage" })
  const [isDirty, setIsDirty] = useState(false)
  return (
    <Section title={t("chunkFailed")} description={t("chunkFailedLead")}>
      <UnsavedChangesGuard when={isDirty} />
      <Label>
        <Checkbox checked={isDirty} onCheckedChange={setIsDirty} />
        {t("unsavedChanges")}
      </Label>
      <div data-testid="chunk-failure">
        <ErrorBoundary headingLevel={3}>
          <FailedChunk />
        </ErrorBoundary>
      </div>
    </Section>
  )
}

/** Стани сторінки SPEC §8.1 у контейнерах — так, як їх побачить користувач у списку. */
export function StatesPage() {
  const { t } = useTranslation("demo", { keyPrefix: "statesPage" })
  const kitT = useErpUiT()
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
        {/* Стан частини під заголовком секції — h3; так виглядає й брама сесії (erp/app-gate), коли профіль не завантажився, лише з h1. */}
        <Section title={t("sessionGate")}>
          <PageState
            kind="error"
            headingLevel={3}
            title={kitT("auth.session.meFailedTitle")}
            description={kitT("auth.session.meFailedDescription")}
            onRetry={() => {
              toast(t("retried"))
            }}
          />
        </Section>
        <ChunkFailureSection />
        <Section title={t("chunkReloadFutile")}>
          <PageState
            kind="error"
            headingLevel={3}
            title={kitT("pageState.chunk.futileTitle")}
            description={kitT("pageState.chunk.futileDescription")}
            onRetry={() => {
              toast(t("retried"))
            }}
          />
        </Section>
      </div>
    </div>
  )
}
