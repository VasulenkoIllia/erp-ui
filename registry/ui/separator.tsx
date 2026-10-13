import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn } from "@/registry/lib/utils"

// erp-ui: основа — shadcn base-nova/separator (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
