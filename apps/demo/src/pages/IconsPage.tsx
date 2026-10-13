import { Euro, DollarSign, PoundSterling, type LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  ACTION_ICONS,
  HryvniaIcon,
  MODULE_ICONS,
  MODULE_IDS,
  SHELL_ICONS,
  STATUS_ICONS,
} from "@/registry/lib/icons"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Сітка «іконка + назва»: так словник видно цілком і легко звірити поняття. */
function IconGrid({
  items,
}: {
  items: { key: string; icon: LucideIcon; label: string; code?: string }[]
}) {
  return (
    <ul className="grid gap-x-4 gap-y-2 @md:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4">
      {items.map(({ key, icon: Icon, label, code }) => (
        <li key={key} className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card">
            <Icon aria-hidden className="size-5" />
          </span>
          <span className="min-w-0">
            {code ? (
              <code className="mr-1.5 text-xs text-muted-foreground">
                {code}
              </code>
            ) : null}
            <span>{label}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

const STROKES = [1.5, 1.75, 2]
const STROKE_SAMPLE = [
  MODULE_ICONS.K2,
  MODULE_ICONS.F2,
  MODULE_ICONS.B1,
  STATUS_ICONS.success,
  STATUS_ICONS.warning,
  ACTION_ICONS.print,
  SHELL_ICONS.notifications,
  HryvniaIcon,
]

export function IconsPage() {
  const { t, i18n } = useTranslation("demo", { keyPrefix: "iconsPage" })
  const kitT = useErpUiT()
  const number = (n: number) => new Intl.NumberFormat(i18n.language).format(n)
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />

      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-2">
        <Section title={t("stroke")} description={t("strokeHint")}>
          <div className="space-y-3">
            {STROKES.map((stroke) => (
              <div
                key={stroke}
                data-testid={`stroke-${String(stroke)}`}
                className="flex flex-wrap items-center gap-4"
              >
                <span className="w-24 shrink-0 text-muted-foreground">
                  {t("strokeValue", { value: number(stroke) })}
                </span>
                {STROKE_SAMPLE.map((Icon, i) => (
                  <Icon
                    key={i}
                    aria-hidden
                    strokeWidth={stroke}
                    className="size-5"
                  />
                ))}
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("hryvnia")} description={t("hryvniaHint")}>
          <div className="flex flex-wrap items-end gap-6">
            {[16, 20, 24, 32].map((size) => (
              <HryvniaIcon key={size} aria-hidden size={size} />
            ))}
            <span className="flex items-end gap-3">
              <Euro aria-hidden size={24} />
              <DollarSign aria-hidden size={24} />
              <PoundSterling aria-hidden size={24} />
            </span>
          </div>
        </Section>
      </div>

      <Section title={t("statuses")}>
        <IconGrid
          items={Object.entries(STATUS_ICONS).map(([key, icon]) => ({
            key,
            icon,
            label: key,
          }))}
        />
      </Section>

      <Section title={t("modules")}>
        <IconGrid
          items={MODULE_IDS.map((id) => ({
            key: id,
            icon: MODULE_ICONS[id],
            code: id,
            label: kitT(`modules.${id}`),
          }))}
        />
      </Section>

      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-2">
        <Section title={t("actions")}>
          <IconGrid
            items={Object.entries(ACTION_ICONS).map(([key, icon]) => ({
              key,
              icon,
              label: key,
            }))}
          />
        </Section>
        <Section title={t("shell")}>
          <IconGrid
            items={Object.entries(SHELL_ICONS).map(([key, icon]) => ({
              key,
              icon,
              label: key,
            }))}
          />
        </Section>
      </div>
    </div>
  )
}
