import { useGetOne } from "ra-core"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import { EditLockNotice } from "@/registry/erp/edit-lock-notice"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useEditLock } from "@/registry/hooks/use-edit-lock"
import {
  useRealtimeEvent,
  useRealtimeStatus,
} from "@/registry/hooks/use-realtime"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import type { RealtimeEvent, RealtimeStatus } from "@/registry/lib/realtime"
import { Badge } from "@/registry/ui/badge"
import { Button, buttonVariants } from "@/registry/ui/button"

import type { Invoice } from "@/data/invoices"
import { ROUTES } from "@/router"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Рахунок першої компанії демо: перший п'ятий запис — у другої, цей є в обох прикладах. */
const INVOICE_ID = "inv-00001"
const LOG_SIZE = 8

const colleague = () => import("@/mocks/colleague")

/** Подія журналу сторінки: дві однакові за одну мілісекунду мають різні ключі. */
type LoggedEvent = RealtimeEvent & { readonly entry: number }

const BADGE: Record<RealtimeStatus, "secondary" | "default" | "outline"> = {
  idle: "outline",
  connecting: "secondary",
  open: "default",
  retrying: "secondary",
  off: "outline",
}

/** Реальний час (PF19, ADR-0051): канал подій, живе оновлення запису й «Редагує …». */
export function RealtimePage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("app.pages.realtime")}
        lead={t("realtimePage.lead")}
      />
      <ChannelSection />
      <RecordSection />
      <LockSection />
    </div>
  )
}

function ChannelSection() {
  const { t } = useTranslation()
  const status = useRealtimeStatus()
  const format = useFormat()
  const [events, setEvents] = useState<readonly LoggedEvent[]>([])
  const logged = useRef(0)
  useRealtimeEvent((event) => {
    logged.current += 1
    const entry = { ...event, entry: logged.current }
    setEvents((current) => [entry, ...current].slice(0, LOG_SIZE))
  })
  return (
    <Section
      title={t("realtimePage.channelTitle")}
      description={t("realtimePage.channelDescription")}
    >
      <p className="flex items-center gap-2 text-sm">
        {t("realtimePage.status")}
        <Badge
          variant={BADGE[status]}
          role="status"
          data-testid="realtime-status"
        >
          {t(`realtimePage.statuses.${status}`)}
        </Badge>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            void colleague().then(({ dropConnection }) => {
              dropConnection()
            })
          }}
        >
          {t("realtimePage.drop")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void colleague().then(({ colleagueSendsNotification }) => {
              colleagueSendsNotification()
            })
          }}
        >
          {t("realtimePage.notify")}
        </Button>
      </div>
      {events.length ? (
        <ol className="space-y-1 text-sm" data-testid="realtime-log">
          {events.map((event) => (
            <li key={event.entry}>
              <span className="text-muted-foreground">
                {format.date(event.at, "time")}
              </span>{" "}
              {event.type}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("realtimePage.noEvents")}
        </p>
      )}
    </Section>
  )
}

function RecordSection() {
  const { t } = useTranslation()
  const companyId = useCompanyId()
  const { data: invoice } = useGetOne<Invoice>("invoices", {
    id: INVOICE_ID,
    meta: companyScope(companyId),
  })
  return (
    <Section
      title={t("realtimePage.recordTitle")}
      description={t("realtimePage.recordDescription")}
    >
      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("realtimePage.client")}</dt>
          <dd data-testid="realtime-client">{invoice?.client}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("realtimePage.version")}</dt>
          <dd data-testid="realtime-version">{invoice?.version}</dd>
        </div>
      </dl>
      <Button
        variant="outline"
        onClick={() => {
          void colleague().then(({ colleagueChangesInvoice }) => {
            colleagueChangesInvoice(INVOICE_ID)
          })
        }}
      >
        {t("realtimePage.change")}
      </Button>
    </Section>
  )
}

function LockSection() {
  const { t } = useTranslation()
  const lock = useEditLock({ resource: "invoices", id: INVOICE_ID })
  const setEditing = (isEditing: boolean) => {
    void colleague().then(({ colleagueEditsInvoice }) => {
      colleagueEditsInvoice(INVOICE_ID, isEditing)
    })
  }
  return (
    <Section
      title={t("realtimePage.lockTitle")}
      description={t("realtimePage.lockDescription")}
    >
      <EditLockNotice holder={lock.holder} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setEditing(true)
          }}
        >
          {t("realtimePage.lockStart")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setEditing(false)
          }}
        >
          {t("realtimePage.lockEnd")}
        </Button>
        {lock.reason ? (
          <DeniedAction reason={lock.reason}>
            {t("realtimePage.edit")}
          </DeniedAction>
        ) : (
          <Link
            to={`${ROUTES.data}/${INVOICE_ID}`}
            className={buttonVariants({ variant: "default" })}
          >
            {t("realtimePage.edit")}
          </Link>
        )}
      </div>
    </Section>
  )
}
