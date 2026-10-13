import { cn } from "@/registry/lib/utils"

// erp-ui: основа — shadcn base-nova/skeleton (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
