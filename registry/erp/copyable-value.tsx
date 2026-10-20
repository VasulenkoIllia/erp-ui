import { CopyButton } from "@/registry/erp/copy-button"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"

/**
 * Значення з кнопкою «Копіювати» (UI43, ADR-0023): реквізити в картці — ЄДРПОУ, РНОКПП, IBAN,
 * телефон, email, посилання й коди.
 *
 * - Показ — для людини, копія — те, що вставляють у банк чи пошту: IBAN групами по 4, у буфер — без
 *   пробілів, країна як є (не лише UA); не схоже на IBAN — як є; телефон показує `display` проекту (`formatPhone` з lib/phone — бібліотека телефонів не
 *   тягнеться в кожен екран зі значенням), у буфер — як зберігається (+380…).
 * - email і телефон — посилання `mailto:` і `tel:` (email з `?`, `&`, пробілами — простий текст: не
 *   підставить копію чи тему листа); посилання — лише http(s), у новій вкладці; коди й IBAN —
 *   моноширинні.
 * - Порожнє значення — «—» і «Не вказано» для скрінрідера, без кнопки.
 * - Довге значення переноситься в межах контейнера, кнопка лишається поруч.
 */

export type CopyableKind = "text" | "code" | "iban" | "phone" | "email" | "url"

export interface CopyableValueProps {
  value: string | null | undefined
  /** Що це: «IBAN», «ЄДРПОУ» — назва кнопки «Копіювати: IBAN». */
  label: string
  kind?: CopyableKind
  /** Як показати, коли інакше, ніж зберігається: телефон через `formatPhone`. */
  display?: string
  className?: string
}

const SAFE_URL = /^https?:\/\//i
/** Адреса без параметрів листа (`?cc=`, `&body=`) і без кількох адрес. */
const SAFE_EMAIL = /^[^\s@?&#,;:/]+@[^\s@?&#,;:/]+\.[^\s@?&#,;:/]+$/
/** Код країни, контрольні цифри, рахунок: «UA21…», «DE89…». */
const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]+$/

function hrefOf(kind: CopyableKind, value: string): string | undefined {
  if (kind === "email")
    return SAFE_EMAIL.test(value) ? `mailto:${value}` : undefined
  if (kind === "phone") {
    const dialable = value.replace(/[^\d+]/g, "")
    return /\d/.test(dialable) ? `tel:${dialable}` : undefined
  }
  if (kind === "url" && SAFE_URL.test(value)) return value
  return undefined
}

/** IBAN будь-якої країни: на екрані групами по 4, у буфер — без пробілів; інше — як є. */
function ibanText(raw: string): { shown: string; copied: string } {
  const compact = raw.replace(/\s+/g, "").toUpperCase()
  if (!IBAN_SHAPE.test(compact)) return { shown: raw, copied: raw }
  return { shown: compact.replace(/(.{4})(?=.)/g, "$1 "), copied: compact }
}

export function CopyableValue({
  value,
  label,
  kind = "text",
  display,
  className,
}: CopyableValueProps) {
  const t = useErpUiT()
  const raw = value?.trim() ?? ""
  if (!raw)
    return (
      <span
        data-slot="copyable-value"
        className={cn("text-muted-foreground", className)}
      >
        <span aria-hidden>—</span>
        <span className="sr-only">{t("copyableValue.empty")}</span>
      </span>
    )

  const isIban = kind === "iban"
  const iban = isIban ? ibanText(raw) : { shown: raw, copied: raw }
  const shown = display || iban.shown
  const href = hrefOf(kind, raw)
  const external = kind === "url" && href !== undefined
  return (
    <span
      data-slot="copyable-value"
      className={cn("inline-flex max-w-full items-center gap-1", className)}
    >
      <span
        className={cn(
          "min-w-0 wrap-anywhere",
          (kind === "code" || isIban) && "font-mono tabular-nums",
        )}
      >
        {href ? (
          <a
            href={href}
            className="text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {shown}
          </a>
        ) : (
          shown
        )}
      </span>
      <CopyButton
        value={iban.copied}
        label={t("copyableValue.copy", { label })}
        className="shrink-0"
      />
    </span>
  )
}
