"use client"

import * as React from "react"

import { PageState } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"
import { ChunkLoadError } from "@/registry/lib/lazy"
import { Button } from "@/registry/ui/button"

/**
 * Межа помилок для частини інтерфейсу — сторінки, діалогу, лінивого чанка (SPEC §8.1, ADR-0009):
 * замість білого екрана — стан «Не вдалося завантажити» з «Спробувати ще», без мережі — «Немає з'єднання».
 *
 * - Чанк, що не завантажився (`ChunkLoadError` з lib/lazy), «Спробувати ще» вантажить заново. Не
 *   вийшло й удруге (напр. після деплою старого чанка вже немає) — з'являється «Оновити сторінку».
 * - Інша помилка рендеру — повтор перемальовує частину ще раз; React сам пише помилку в консоль.
 * - `onError` — передати помилку в моніторинг (Sentry тощо).
 * - `fallback` — власний вигляд для тісних місць (кнопка в шапці); `key` на межі скидає її, напр.
 *   при переході на іншу сторінку.
 * - `frame` — рамка навколо стану помилки за замовчуванням: лінива форма в діалозі показує її в
 *   діалозі зі своєю назвою, а повтор і «Оновити сторінку» лишаються від межі.
 *
 *   <ErrorBoundary key={pathname}><Suspense fallback={<PageSkeleton />}><Page /></Suspense></ErrorBoundary>
 */
export interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: (retry: () => void) => React.ReactNode
  frame?: (content: React.ReactNode) => React.ReactNode
  onError?: (error: unknown, info: React.ErrorInfo) => void
  className?: string
}

interface ErrorBoundaryState {
  error: unknown
  failed: boolean
  /** Скільки разів уже повторювали. */
  retries: number
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    error: undefined,
    failed: false,
    retries: 0,
  }

  static getDerivedStateFromError(
    error: unknown,
  ): Pick<ErrorBoundaryState, "error" | "failed"> {
    return { error, failed: true }
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo) {
    this.props.onError?.(error, info)
  }

  retry = () => {
    const { error } = this.state
    if (error instanceof ChunkLoadError) error.retry()
    this.setState(({ retries }) => ({
      error: undefined,
      failed: false,
      retries: retries + 1,
    }))
  }

  override render() {
    const { error, failed, retries } = this.state
    if (!failed) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.retry)
    const content = (
      <PageState
        kind={navigator.onLine ? "error" : "offline"}
        onRetry={this.retry}
        action={
          error instanceof ChunkLoadError && retries > 0 ? (
            <ReloadButton />
          ) : undefined
        }
        className={this.props.className}
      />
    )
    return this.props.frame ? this.props.frame(content) : content
  }
}

function ReloadButton() {
  const t = useErpUiT()
  return (
    <Button
      onClick={() => {
        window.location.reload()
      }}
    >
      {t("pageState.error.reload")}
    </Button>
  )
}
