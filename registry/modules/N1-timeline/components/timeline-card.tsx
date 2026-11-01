import { useMemo } from "react"

import {
  RecordTimeline,
  type RecordTimelineProps,
} from "@/components/erp/record-timeline"
import { useTimelineVersionRefresh } from "@/hooks/use-timeline"

export interface TimelineCardProps extends RecordTimelineProps {
  /** Версія запису: нова версія перечитує стрічку, зміна поля видна одразу. */
  version?: number
}

/** Стрічка на картці запису: окремий чанк, картки без стрічки його не вантажать. */
export function TimelineCard({ version, ...props }: TimelineCardProps) {
  const { resource, id } = props
  const target = useMemo(() => ({ resource, id }), [resource, id])
  useTimelineVersionRefresh(target, version)
  return <RecordTimeline {...props} />
}
