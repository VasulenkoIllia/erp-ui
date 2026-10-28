import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "@/registry/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

// erp-ui: основа — shadcn base-nova/checkbox (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

// erp-ui: неактивна — `data-disabled`, а не `:disabled`: Base UI рендерить <span role="checkbox">,
// і `disabled:` до нього не застосовується (ADR-0032). Лише для перегляду (`readOnly`) — у порядку
// Tab, без приглушення: рамка пунктиром, позначена — сіра, а не основного кольору (ADR-0033).
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-readonly:cursor-default data-readonly:border-dashed data-readonly:data-indeterminate:border-muted-foreground data-readonly:data-indeterminate:bg-muted-foreground data-readonly:data-indeterminate:text-background dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-indeterminate:bg-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary data-readonly:data-checked:border-muted-foreground data-readonly:data-checked:bg-muted-foreground data-readonly:data-checked:text-background dark:data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {/* erp-ui: стан «частково» (indeterminate) — риска замість галочки. */}
        <CheckIcon className="in-data-indeterminate:hidden" />
        <MinusIcon className="hidden in-data-indeterminate:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
