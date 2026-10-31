import { useGetList, useRefresh } from "ra-core"
import { useEffect, useRef } from "react"

import { IMPORT_RUNS, type ImportRun } from "../contract"

/** Як часто питати, чи запуск ще йде: рідше за опитування задачі, бо людина просто дивиться список. */
const RUNS_POLL_MS = 3000
const RUNNING_FILTER = { status: "running" }
const ONE_RECORD = { page: 1, perPage: 1 }

/** Поки якийсь запуск іде, сторінка питає про нього; коли всі закінчились, список оновлюється сам. */
export function useRefreshWhileRunning(): void {
  const refresh = useRefresh()
  const { total = 0 } = useGetList<ImportRun>(
    IMPORT_RUNS,
    { filter: RUNNING_FILTER, pagination: ONE_RECORD },
    {
      refetchInterval: (query) =>
        (query.state.data?.total ?? 0) > 0 ? RUNS_POLL_MS : false,
    },
  )
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && total === 0) refresh()
    wasRunning.current = total > 0
  }, [total, refresh])
}
