import * as React from "react"

import {
  getRealtimeStatus,
  subscribeRealtime,
  subscribeRealtimeStatus,
  type RealtimeEvent,
  type RealtimeStatus,
} from "@/registry/lib/realtime"

const serverSnapshot = (): RealtimeStatus => "idle"

/** Стан каналу подій (ADR-0051): `open` — опитувати не треба. */
export function useRealtimeStatus(): RealtimeStatus {
  return React.useSyncExternalStore(
    subscribeRealtimeStatus,
    getRealtimeStatus,
    serverSnapshot,
  )
}

/** Слухати події каналу, поки компонент змонтовано; відновлення після обриву — `REALTIME_RESYNC`. */
export function useRealtimeEvent(handler: (event: RealtimeEvent) => void) {
  const onEvent = React.useEffectEvent(handler)
  React.useEffect(
    () =>
      subscribeRealtime((event) => {
        onEvent(event)
      }),
    [],
  )
}
