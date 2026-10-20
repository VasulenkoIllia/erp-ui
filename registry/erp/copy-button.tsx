import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"

/**
 * Кнопка «Копіювати» (UI43): копіює значення в буфер, на дві секунди показує галочку й повідомляє
 * скрінрідеру «Скопійовано». Підпис кнопки — що саме копіюємо («Копіювати ключ»).
 */
export function CopyButton({
  value,
  label,
  showLabel = false,
  variant = "ghost",
  className,
}: {
  value: string
  /** Доступна назва: «Копіювати ключ». */
  label: string
  /** Показати підпис поруч з іконкою. */
  showLabel?: boolean
  variant?: React.ComponentProps<typeof Button>["variant"]
  className?: string
}) {
  const t = useErpUiT()
  const [copied, setCopied] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => {
      setCopied(false)
    }, 2000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [copied])

  const Icon = copied ? CheckIcon : CopyIcon
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={showLabel ? "sm" : "icon-sm"}
        className={className}
        aria-label={showLabel ? undefined : label}
        onClick={() => {
          setFailed(false)
          navigator.clipboard.writeText(value).then(
            () => {
              setCopied(true)
            },
            () => {
              setFailed(true)
            },
          )
        }}
      >
        <Icon aria-hidden />
        {showLabel ? label : null}
      </Button>
      <span className="sr-only" role="status">
        {copied ? t("common.copied") : failed ? t("common.copyFailed") : ""}
      </span>
    </>
  )
}
