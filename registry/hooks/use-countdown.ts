import * as React from "react"

interface Clock {
  /** Коли відлік закінчиться, мс. */
  until: number
  /** Останній такт годинника, мс. */
  now: number
}

/** Секунди відліку в мілісекунди; не число, нескінченність чи від'ємне з сервера — без відліку. */
const durationMs = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0

/**
 * Відлік секунд: «Надіслати ще раз через 0:42», «Забагато спроб, спробуйте через…». `start(секунди)` запускає
 * новий відлік з цієї миті (час береться в обробнику, а не під час рендеру), далі `secondsLeft` зменшується
 * щосекунди, і кнопка стає доступною сама. `until` змінюється з кожним `start` — за ним ефект може почати знову.
 */
export function useCountdown(initialSeconds = 0) {
  const [clock, setClock] = React.useState<Clock>(() => {
    const now = Date.now()
    return { until: now + durationMs(initialSeconds), now }
  })
  const { until } = clock
  const running = clock.until > clock.now
  React.useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const now = Date.now()
      setClock((current) =>
        current.until === until ? { until, now } : current,
      )
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [until, running])
  const start = React.useCallback((seconds: number) => {
    const now = Date.now()
    setClock({ until: now + durationMs(seconds), now })
  }, [])
  return {
    secondsLeft: Math.max(0, Math.ceil((clock.until - clock.now) / 1000)),
    until,
    start,
  }
}

/** 102 → «1:42»: хвилини й секунди для відліку. */
export const formatMinutesSeconds = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`
