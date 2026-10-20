import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/registry/lib/utils"

// erp-ui: основа — shadcn base-nova/slider (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabel,
  getAriaValueText,
  ...props
}: SliderPrimitive.Root.Props & {
  /**
   * erp-ui: доступна назва повзунка («Масштаб»); для діапазону — назва кожного: (index) => …
   * Без неї скрінрідер оголошує лише число.
   */
  thumbLabel?: string | ((index: number) => string)
  /** erp-ui: текст значення для скрінрідера («150 %»). */
  getAriaValueText?: (
    formattedValue: string,
    value: number,
    index: number,
  ) => string
}) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        {/* erp-ui: доріжка — bg-input (≥ 3:1 до тла, WCAG 1.4.11) замість bg-muted. */}
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-input select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            getAriaLabel={
              thumbLabel === undefined
                ? undefined
                : typeof thumbLabel === "string"
                  ? () => thumbLabel
                  : thumbLabel
            }
            getAriaValueText={getAriaValueText}
            // erp-ui: тло повзунка — токен bg-background (стандартна палітра Tailwind вимкнена).
            className="relative block size-4 shrink-0 rounded-full border border-ring bg-background ring-ring transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden active:ring-2 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
