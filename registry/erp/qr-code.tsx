import * as React from "react"
import { correction, generate } from "lean-qr"
import { toSvgPath } from "lean-qr/extras/svg"

import { cn } from "@/registry/lib/utils"

/** Тиха зона навколо коду (модулі): без неї деякі сканери не бачать код. */
const QUIET_ZONE = 4

/**
 * QR-код у SVG (lean-qr, MIT): для застосунку-автентифікатора, оплати, посилань.
 * Завжди темний на світлому (`bg-scan`) — інвертовані коди читає не кожен застосунок.
 * `label` — що закодовано, для скрінрідера; поруч варто дати те саме текстом.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const code = React.useMemo(
    () => generate(value, { minCorrectionLevel: correction.M }),
    [value],
  )
  const side = code.size + QUIET_ZONE * 2
  return (
    <svg
      data-slot="qr-code"
      role="img"
      aria-label={label}
      viewBox={`${String(-QUIET_ZONE)} ${String(-QUIET_ZONE)} ${String(side)} ${String(side)}`}
      shapeRendering="crispEdges"
      className={cn(
        "size-48 rounded-md bg-scan text-scan-foreground",
        className,
      )}
    >
      <path d={toSvgPath(code)} fill="currentColor" />
    </svg>
  )
}
