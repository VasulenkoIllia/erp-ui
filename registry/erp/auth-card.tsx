import * as React from "react"

import { useFocusHeadingOnMount } from "@/registry/hooks/use-focus-heading"
import { cn } from "@/registry/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/registry/ui/card"

export interface AuthCardProps {
  title: string
  description?: React.ReactNode
  /** Знак над карткою (логотип продукту). */
  logo?: React.ReactNode
  /** Під карткою: перемикач мови, підказка «пароль скидає адміністратор», посилання. */
  footer?: React.ReactNode
  /** Бічна панель лише на широкому контейнері (від `@5xl`, вужче схована): картинка й текст бренду. */
  aside?: React.ReactNode
  /** Заголовок вкладки; за замовчуванням — `title`. */
  documentTitle?: string
  className?: string
  children: React.ReactNode
}

/**
 * Картка екрана входу по центру сторінки (ADR-0010): вхід, новий пароль, запрошення. Заголовок (h1) отримує
 * фокус, коли змінюється крок (`title`), — скрінрідер чує новий крок, а не мовчить; і коли екран з'являється
 * на місці зниклого вмісту (після виходу, після вдалого «Спробувати ще»), а фокус загубився.
 *
 * Без провайдера входу й ra-core (ADR-0099): проект зі своїм сервером кладе сюди `LoginForm` чи
 * `SetPasswordForm` (erp/login-form). Екрани входу кіта беруть її через `AuthLayout` (erp/auth-layout), де ще бренд.
 */
export function AuthCard({
  title,
  description,
  logo,
  footer,
  aside,
  documentTitle = title,
  className,
  children,
}: AuthCardProps) {
  const heading = React.useRef<HTMLHeadingElement>(null)
  const first = React.useRef(true)
  useFocusHeadingOnMount(heading)
  React.useEffect(() => {
    document.title = documentTitle
  }, [documentTitle])
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
  }, [title])

  return (
    <main
      id="erp-ui-main"
      data-slot="auth-layout"
      className={cn("@container min-h-svh bg-muted/40", className)}
    >
      <div className={cn("grid min-h-svh", aside && "@5xl:grid-cols-2")}>
        <div className="grid place-items-center px-4 py-8">
          <div className="w-full max-w-sm space-y-4">
            {logo}
            <Card>
              <CardHeader>
                <CardTitle>
                  <h1
                    ref={heading}
                    tabIndex={-1}
                    className="text-xl font-semibold focus-visible:outline-none"
                  >
                    {title}
                  </h1>
                </CardTitle>
                {description ? (
                  <CardDescription>{description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">{children}</CardContent>
            </Card>
            {footer}
          </div>
        </div>
        {aside ? <div className="hidden @5xl:contents">{aside}</div> : null}
      </div>
    </main>
  )
}
