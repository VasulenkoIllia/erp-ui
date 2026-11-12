import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/registry/lib/utils"

// erp-ui: основа — shadcn base-nova/input (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

// erp-ui: висота з токена щільності; read-only — тло muted (SPEC §8.3: відрізняється від disabled і лишається у фокусі).
// erp-ui: поле з помилкою — суцільна червона рамка в обох темах і блідий ореол лише без фокуса: у фокусі
// кільце --ring, як у будь-якого поля (WCAG 2.4.7). Так само в textarea, select, checkbox, switch, combobox,
// input-group, input-otp, button і erp/picker-field.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground read-only:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:not-focus-visible:ring-3 aria-invalid:not-focus-visible:ring-destructive/20 md:text-sm dark:bg-input/30 dark:read-only:bg-muted dark:disabled:bg-input/80 dark:aria-invalid:not-focus-visible:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
