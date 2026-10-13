import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Loader2Icon } from "lucide-react"

// erp-ui: основа — shadcn base-nova/spinner (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

// erp-ui: підпис для скрінрідера — параметр; за замовчуванням «Завантаження» мовою інтерфейсу.
function Spinner({
  className,
  label,
  ...props
}: React.ComponentProps<"svg"> & { label?: string }) {
  const t = useErpUiT()
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={label ?? t("common.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
