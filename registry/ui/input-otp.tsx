import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"
import { MinusIcon } from "lucide-react"

import { cn } from "@/registry/lib/utils"

// erp-ui: основа — shadcn base-nova/input-otp (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».
// Одне справжнє поле під клітинками: автозаповнення кодом з SMS (autocomplete="one-time-code"),
// вставка й скрінрідер працюють як зі звичайним полем. aria-invalid стоїть на ньому, а воно поза групою
// клітинок: помилку групи й клітинок показує контейнер group/otp (рамка, ореол лише без фокуса).

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "cn-input-otp group/otp flex items-center has-disabled:opacity-50",
        containerClassName,
      )}
      spellCheck={false}
      // erp-ui: код з SMS підставляється системою (iOS, Android, менеджери паролів).
      autoComplete="one-time-code"
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn(
        "flex items-center rounded-lg group-has-[[data-input-otp][aria-invalid=true]:not(:focus)]/otp:ring-3 group-has-[[data-input-otp][aria-invalid=true]:not(:focus)]/otp:ring-destructive/20 dark:group-has-[[data-input-otp][aria-invalid=true]:not(:focus)]/otp:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        // erp-ui: висота з токена щільності, ширша клітинка й більший шрифт — код читається з телефона;
        // активна клітинка — суцільне кільце --ring 2 px (контраст ≥ 3:1), і в клітинці з помилкою.
        "relative flex h-control w-10 items-center justify-center border-y border-r border-input text-base tabular-nums transition outline-none group-has-[[data-input-otp][aria-invalid=true]]/otp:border-destructive first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-2 data-[active=true]:ring-ring data-[active=true]:aria-invalid:border-destructive dark:bg-input/30",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon aria-hidden />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
