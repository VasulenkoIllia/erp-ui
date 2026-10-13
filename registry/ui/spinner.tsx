// erp-ui: основа — shadcn base-nova/spinner (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».
import { cn } from "@/registry/lib/utils"
import { Loader2Icon } from "lucide-react"

// erp-ui: підпис для скрінрідера — параметр (uk за замовчуванням; i18n — крок 0.3).
function Spinner({
  className,
  label = "Завантаження",
  ...props
}: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
