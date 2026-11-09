import { useAuthenticated } from "ra-core"
import { useTranslation } from "react-i18next"

import { PageSkeleton } from "@/registry/erp/page-state"
import { PeriodLockNotice } from "@/registry/erp/period-lock-banner"
import { PeriodLockExceptions } from "@/registry/erp/period-lock-exceptions"
import { PeriodLockSettings } from "@/registry/erp/period-lock-settings"
import { useErpUiT } from "@/registry/lib/i18n"

import { DOCUMENTS_LOCKED_THROUGH } from "@/data/documents"

import { PageHeader } from "./PageHeader"
import { PeriodLockDocument } from "./period-lock-document"
import { Section } from "./Section"

const HOUR_MS = 3_600_000
/** Кінець винятку у варіанті смуги: година від завантаження сторінки. */
const VARIANT_UNTIL = new Date(Date.now() + HOUR_MS).toISOString()

/**
 * Закриті періоди (PF13, ADR-0069): дата закриття, роки компанії, винятки й документ демо в закритому
 * періоді — смуга, причина на кнопці й 422 біля поля дати; варіанти смуги без запитів.
 */
export function PeriodLockPage() {
  const { t } = useTranslation("demo", { keyPrefix: "periodLockPage" })
  const kitT = useErpUiT()
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={kitT("periodLock.title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <>
          <Section
            title={t("settingsTitle")}
            description={t("settingsDescription")}
          >
            <PeriodLockSettings headingLevel={3} />
          </Section>
          <Section
            title={kitT("periodLock.exceptions.title")}
            description={t("exceptionsDescription")}
          >
            <PeriodLockExceptions headingLevel={3} />
          </Section>
          <PeriodLockDocument />
          <BannerVariants />
        </>
      )}
    </div>
  )
}

/** Смуга з явними даними: закритий період, чинний виняток, збій читання. */
function BannerVariants() {
  const { t } = useTranslation("demo", { keyPrefix: "periodLockPage" })
  return (
    <Section title={t("variantsTitle")} description={t("variantsDescription")}>
      <div className="grid gap-4">
        <Variant title={t("variants.locked")}>
          <PeriodLockNotice
            state="locked"
            date="2026-10-15"
            lockedThrough={DOCUMENTS_LOCKED_THROUGH}
            hint={t("hint")}
          />
        </Variant>
        <Variant title={t("variants.exception")}>
          <PeriodLockNotice
            state="locked"
            date="2026-10-15"
            lockedThrough={DOCUMENTS_LOCKED_THROUGH}
            exception={{ until: VARIANT_UNTIL, reason: t("variants.reason") }}
          />
        </Variant>
        <Variant title={t("variants.error")}>
          <PeriodLockNotice state="error" onRetry={() => undefined} />
        </Variant>
        <Variant title={t("variants.narrow")}>
          <div className="max-w-xs">
            <PeriodLockNotice state="error" onRetry={() => undefined} />
          </div>
        </Variant>
        <p className="text-sm text-muted-foreground">{t("variants.open")}</p>
      </div>
    </Section>
  )
}

function Variant({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  )
}
