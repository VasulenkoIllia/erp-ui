"use client"

import * as React from "react"

import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Перевірка «не бот» (ADR-0010): Cloudflare Turnstile, лише коли сервер відповів
 * `captcha_required`. Режим «interaction-only» — більшість людей не бачать жодного завдання
 * (WCAG 3.3.8: без головоломок). Скрипт вантажиться тільки тоді, коли перевірка потрібна.
 *
 * `CaptchaRenderer` дозволяє замінити віджет (інший провайдер чи демо без мережі).
 */
export type CaptchaRenderer = (props: {
  onToken: (token: string) => void
  onError: () => void
}) => React.ReactNode

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      language?: string
      appearance?: "always" | "execute" | "interaction-only"
      callback: (token: string) => void
      "error-callback": () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
      if (api) resolve(api)
      else reject(new Error("Turnstile is unavailable"))
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("Turnstile failed to load"))
    }
    document.head.append(script)
  })
  return scriptPromise
}

export function TurnstileCaptcha({
  siteKey,
  onToken,
  onError,
  className,
}: {
  siteKey: string
  onToken: (token: string) => void
  onError: () => void
  className?: string
}) {
  const t = useErpUiT()
  const { language } = useLanguage()
  const container = React.useRef<HTMLDivElement>(null)
  const [state, setState] = React.useState<"loading" | "ready" | "failed">(
    "loading",
  )
  const handlers = React.useRef({ onToken, onError })
  React.useEffect(() => {
    handlers.current = { onToken, onError }
  })

  React.useEffect(() => {
    let widgetId: string | undefined
    let api: TurnstileApi | undefined
    let cancelled = false
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !container.current) return
        api = turnstile
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          language,
          appearance: "interaction-only",
          callback: (token) => {
            setState("ready")
            handlers.current.onToken(token)
          },
          "error-callback": () => {
            setState("failed")
            handlers.current.onError()
          },
        })
      },
      () => {
        if (cancelled) return
        setState("failed")
        handlers.current.onError()
      },
    )
    return () => {
      cancelled = true
      if (api && widgetId) api.remove(widgetId)
    }
  }, [siteKey, language])

  return (
    <div data-slot="captcha" className={cn("space-y-2", className)}>
      <div ref={container} />
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        {state === "loading" ? <Spinner aria-hidden /> : null}
        {state === "failed"
          ? t("auth.captcha.failed")
          : state === "ready"
            ? t("auth.captcha.done")
            : t("auth.captcha.checking")}
      </p>
    </div>
  )
}
