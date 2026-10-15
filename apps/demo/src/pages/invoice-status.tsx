import { type LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ACTION_ICONS, STATUS_ICONS } from "@/registry/lib/icons"
import { Badge } from "@/registry/ui/badge"

import type { InvoiceStatus } from "@/data/invoices"

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

const STATUS_BADGES: Record<
  InvoiceStatus,
  {
    variant: "secondary" | "info" | "warning" | "success" | "destructive"
    icon: LucideIcon
  }
> = {
  draft: { variant: "secondary", icon: STATUS_ICONS.draft },
  approved: { variant: "info", icon: ACTION_ICONS.approve },
  sent: { variant: "info", icon: STATUS_ICONS.info },
  partially_paid: { variant: "warning", icon: STATUS_ICONS.pending },
  paid: { variant: "success", icon: STATUS_ICONS.success },
  overdue: { variant: "destructive", icon: STATUS_ICONS.destructive },
}

/** Статус рахунку: бейдж у списку й на картці. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const t = usePageT()
  const { variant, icon: Icon } = STATUS_BADGES[status]
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {t(`statuses.${status}`)}
    </Badge>
  )
}
