import * as React from "react"

import { PageState, type PageStateProps } from "@/registry/erp/page-state"
import { isFocusLost } from "@/registry/hooks/use-focus-heading"
import { useErpUiT } from "@/registry/lib/i18n"
import { ChunkLoadError, isChunkLoadError } from "@/registry/lib/lazy"
import {
  hasUnsavedChanges,
  reloadDidNotHelp,
  reloadPage,
} from "@/registry/lib/page-reload"
import { Button } from "@/registry/ui/button"

/**
 * Межа помилок для частини інтерфейсу — сторінки, діалогу, лінивого чанка (SPEC §8.1, ADR-0009):
 * замість білого екрана — стан «Не вдалося завантажити» з «Спробувати ще», без мережі — «Немає з'єднання».
 *
 * - Чанк, що не завантажився (`isChunkLoadError` з lib/lazy): після деплою старого файла вже немає,
 *   тож стан одразу пропонує «Оновити сторінку», а «Спробувати ще» лишає для збою мережі (ADR-0055).
 *   Без мережі кнопки оновлення немає: сторінка б не відкрилась зовсім. Якщо оновлення щойно не
 *   допомогло, кнопки теж немає, і стан каже про це прямо (`lib/page-reload`).
 * - Інша помилка рендеру — повтор перемальовує частину ще раз; React сам пише помилку в консоль.
 * - `onError` — передати помилку в моніторинг (Sentry тощо).
 * - `fallback` — власний вигляд для тісних місць (кнопка в шапці); другий аргумент — помилка, щоб
 *   показати `ReloadPageAction` при збої чанка. `key` на межі скидає її, напр. при переході на іншу
 *   сторінку.
 * - `frame` — рамка навколо стану помилки за замовчуванням: лінива форма в діалозі показує її в
 *   діалозі зі своєю назвою, а повтор і «Оновити сторінку» лишаються від межі.
 * - `headingLevel` — рівень заголовка стану помилки (`PageState`): 1 — межа на місці всієї сторінки.
 * - Фокус після «Спробувати ще» (WCAG 2.4.3): невдалий повтор ставить фокус на заголовок стану
 *   помилки будь-якого рівня — і коли кнопка зникла разом зі станом (чанк не завантажився вдруге),
 *   і коли помилка повторилась одразу (стан той самий, інакше скрінрідер нічого б не сказав).
 *   Вдалий повтор лишає фокус вмісту — сторінки шаблонів і екрани входу ставлять його на свій h1
 *   (`hooks/use-focus-heading`).
 *
 *   <ErrorBoundary key={pathname}><Suspense fallback={<PageSkeleton />}><Page /></Suspense></ErrorBoundary>
 */
export interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: (retry: () => void, error: unknown) => React.ReactNode
  frame?: (content: React.ReactNode) => React.ReactNode
  onError?: (error: unknown, info: React.ErrorInfo) => void
  headingLevel?: PageStateProps["headingLevel"]
  className?: string
}

interface ErrorBoundaryState {
  error: unknown
  failed: boolean
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    error: undefined,
    failed: false,
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, failed: true }
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo) {
    this.props.onError?.(error, info)
  }

  /** Заголовок стану помилки за замовчуванням: на нього фокус після невдалого повтору. */
  private heading = React.createRef<HTMLHeadingElement>()
  private retried = false

  override componentDidUpdate(
    _props: ErrorBoundaryProps,
    previous: ErrorBoundaryState,
  ) {
    if (!this.state.failed || !this.retried) return
    this.retried = false
    // Помилка під час самого повтору лишає стан на місці (фокус на кнопці, той самий alert) —
    // заголовок у фокусі каже, що повтор не вдався. Після завантаження (чанк) стан новий, кнопка
    // зникла, і фокус загубився.
    if (previous.failed || isFocusLost()) this.heading.current?.focus()
  }

  retry = () => {
    this.retried = true
    const { error } = this.state
    if (error instanceof ChunkLoadError) error.retry()
    this.setState({ error: undefined, failed: false })
  }

  override render() {
    const { error, failed } = this.state
    if (!failed) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.retry, error)
    const { headingLevel, className, frame } = this.props
    const state = {
      onRetry: this.retry,
      headingLevel,
      headingRef: this.heading,
      className,
    }
    const content =
      navigator.onLine && isChunkLoadError(error) ? (
        <ChunkFailure {...state} />
      ) : (
        <PageState kind={navigator.onLine ? "error" : "offline"} {...state} />
      )
    return frame ? frame(content) : content
  }
}

function ChunkFailure(
  props: Pick<
    PageStateProps,
    "onRetry" | "headingLevel" | "headingRef" | "className"
  >,
) {
  const t = useErpUiT()
  const [isReloadFutile] = React.useState(reloadDidNotHelp)
  if (isReloadFutile)
    return (
      <PageState
        kind="error"
        title={t("pageState.chunk.futileTitle")}
        description={t("pageState.chunk.futileDescription")}
        {...props}
      />
    )
  return (
    <PageState
      kind="error"
      title={t("pageState.chunk.title")}
      description={t("pageState.chunk.description")}
      action={<ReloadPageAction />}
      {...props}
    />
  )
}

const subscribeToNetwork = (onChange: () => void) => {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

const readOnline = () => navigator.onLine

/**
 * «Оновити сторінку» для збою чанка, і в стані межі, і у власному `fallback` тісного місця. Є
 * незбережені зміни — питає на місці. Не діалогом: він не входить у вхідний чанк, а лінивий після
 * деплою теж міг би не завантажитись (ADR-0055). Без мережі чи після марного оновлення нічого не
 * показує: мережа могла зникнути вже після збою. Кнопки стають елементами батьківського `flex-wrap`,
 * текст попередження — окремим рядком.
 */
export function ReloadPageAction({
  size,
  variant,
}: Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
  const t = useErpUiT()
  const isOnline = React.useSyncExternalStore(subscribeToNetwork, readOnline)
  const [isReloadFutile] = React.useState(reloadDidNotHelp)
  const [isConfirming, setIsConfirming] = React.useState(false)
  const warningId = React.useId()
  // Кнопка, на якій клікнули, зникає: фокус на безпечну дію, а після відмови — назад (WCAG 2.4.3).
  const focusTarget = React.useRef<HTMLButtonElement>(null)
  const wasConfirming = React.useRef(false)
  React.useEffect(() => {
    if (wasConfirming.current === isConfirming) return
    wasConfirming.current = isConfirming
    focusTarget.current?.focus()
  }, [isConfirming])

  if (!isOnline || isReloadFutile) return null
  if (!isConfirming)
    return (
      <Button
        ref={focusTarget}
        type="button"
        size={size}
        variant={variant}
        onClick={() => {
          if (hasUnsavedChanges()) setIsConfirming(true)
          else reloadPage()
        }}
      >
        {t("pageState.error.reload")}
      </Button>
    )
  return (
    <>
      <p id={warningId} className="w-full text-sm">
        {t("pageState.chunk.unsavedWarning")}
      </p>
      <Button
        type="button"
        size={size}
        variant="destructive"
        onClick={reloadPage}
      >
        {t("pageState.chunk.reloadAnyway")}
      </Button>
      <Button
        ref={focusTarget}
        type="button"
        size={size}
        variant="outline"
        aria-describedby={warningId}
        onClick={() => {
          setIsConfirming(false)
        }}
      >
        {t("pageState.chunk.keepEditing")}
      </Button>
    </>
  )
}
