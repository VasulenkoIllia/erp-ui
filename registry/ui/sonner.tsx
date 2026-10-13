import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

import { useResolvedTheme } from "@/registry/hooks/use-resolved-theme"
import { useErpUiT } from "@/registry/lib/i18n"

// erp-ui: основа — shadcn base-nova/sonner (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

const TOAST_DURATION_MS = 8000

// erp-ui: тема — з класу dark на <html> (без next-themes), тож працює з будь-яким перемикачем тем.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme()
  const t = useErpUiT()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      // erp-ui: помилку встигають прочитати (типові 4 с замало, WCAG 2.2.1) і можуть закрити самі.
      duration={TOAST_DURATION_MS}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
        closeButtonAriaLabel: t("common.close"),
      }}
      {...props}
    />
  )
}

export { Toaster }
