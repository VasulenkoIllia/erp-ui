import { useTranslation } from "react-i18next"

import { RecordTimeline } from "@/registry/erp/record-timeline"
import { Button } from "@/registry/ui/button"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Рахунки першої компанії демо: `inv-00001` має повну стрічку, `inv-00003` порожню. */
const FULL_RECORD = "inv-00001"
const CLOSED_RECORD = "inv-00002"
const EMPTY_RECORD = "inv-00003"

const colleague = () => import("@/mocks/colleague")

/** Стрічка запису (UI01, PF05, ADR-0053): усе разом, лише перегляд, порожньо й вузька колонка. */
export function TimelinePage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("app.pages.timeline")}
        lead={t("timelinePage.lead")}
      />
      <Section
        title={t("timelinePage.fullTitle")}
        description={t("timelinePage.fullDescription")}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void colleague().then(({ colleagueWritesNote }) => {
                colleagueWritesNote(FULL_RECORD)
              })
            }}
          >
            {t("timelinePage.colleagueNote")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void colleague().then(({ customerReplies }) => {
                customerReplies(FULL_RECORD)
              })
            }}
          >
            {t("timelinePage.customerReply")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void colleague().then(({ colleagueChangesInvoice }) => {
                colleagueChangesInvoice(FULL_RECORD)
              })
            }}
          >
            {t("timelinePage.changeInvoice")}
          </Button>
        </div>
        <div data-testid="timeline-full">
          <RecordTimeline
            resource="invoices"
            id={FULL_RECORD}
            label={t("timelinePage.fullTitle")}
          />
        </div>
      </Section>
      <Section
        title={t("timelinePage.readOnlyTitle")}
        description={t("timelinePage.readOnlyDescription")}
      >
        <div data-testid="timeline-read-only">
          <RecordTimeline
            resource="invoices"
            id={CLOSED_RECORD}
            label={t("timelinePage.readOnlyTitle")}
            readOnly
          />
        </div>
      </Section>
      <Section
        title={t("timelinePage.narrowTitle")}
        description={t("timelinePage.narrowDescription")}
      >
        <div data-testid="timeline-narrow" className="max-w-sm">
          <RecordTimeline
            resource="invoices"
            id={EMPTY_RECORD}
            label={t("timelinePage.narrowTitle")}
            messages={false}
            files={false}
          />
        </div>
      </Section>
    </div>
  )
}
