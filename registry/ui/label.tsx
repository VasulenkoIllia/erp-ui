// erp-ui: основа — shadcn base-nova/label (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».
import * as React from "react"
import { cn } from "@/registry/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // erp-ui: обгортка над <label>; htmlFor чи вкладений контрол передає той, хто використовує Label.
    // eslint-disable-next-line jsx-a11y-x/label-has-associated-control
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Label }
