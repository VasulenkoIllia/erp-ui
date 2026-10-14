import { useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"

import { Section } from "@/pages/Section"

/**
 * Токени руху (ADR-0009, SPEC §6.6): тривалості й криві з живим зразком. Смуги заповнюються
 * з різною тривалістю; з prefers-reduced-motion — одразу, без руху.
 */
const DURATIONS = [
  { token: "duration-fast", ms: 150, className: "duration-fast" },
  { token: "duration-base", ms: 200, className: "duration-base" },
  { token: "duration-slow", ms: 250, className: "duration-slow" },
] as const

const EASINGS = ["ease-standard", "ease-enter", "ease-exit"] as const

export function MotionPreview() {
  const { t } = useTranslation("demo", { keyPrefix: "appearancePage.motion" })
  const [filled, setFilled] = useState(false)
  return (
    <Section title={t("title")} description={t("lead")}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {DURATIONS.map(({ token, ms }) => (
          <div key={token} className="contents">
            <dt className="font-mono text-xs">
              {token} · {t("ms", { value: ms })}
            </dt>
            <dd className="text-muted-foreground">{t(`uses.${token}`)}</dd>
          </div>
        ))}
        {EASINGS.map((token) => (
          <div key={token} className="contents">
            <dt className="font-mono text-xs">{token}</dt>
            <dd className="text-muted-foreground">{t(`uses.${token}`)}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2" aria-hidden>
        {DURATIONS.map(({ token, className }) => (
          <div
            key={token}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full origin-left scale-x-0 rounded-full bg-primary transition-transform ease-standard",
                filled && "scale-x-100",
                className,
              )}
            />
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setFilled((value) => !value)
        }}
      >
        {t(filled ? "reset" : "run")}
      </Button>
    </Section>
  )
}
