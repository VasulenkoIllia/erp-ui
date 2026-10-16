"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useDataProvider, type Identifier } from "ra-core"
import { toast } from "sonner"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { announce } from "@/registry/lib/announce"
import { isApiError } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  isPinned,
  PIN_LIMIT_CODE,
  type PinnableRecord,
} from "@/registry/lib/pins"

/**
 * Закріплення запису вгорі списку цього користувача (lib/pins, ADR-0024).
 *
 * - Поки запит іде, `pinned` — стан, який людина вибрала; повторне натискання нічого не робить.
 * - Після відповіді — оголошення для скрінрідера («закріплено вгорі списку») і перечитування ресурсу:
 *   списки (порядок), картка (`pinned`). Вибраний стан тримається, доки не прийде новий запис: не
 *   вдалося перечитати — кнопка однаково показує те, що сервер зберіг.
 * - Помилка — сповіщення: межу вичерпано (`pin_limit`) — своїм текстом, інше — текстом за кодом.
 */
export interface PinApi {
  pinned: boolean
  isPending: boolean
  /** Закріпити чи відкріпити; `true` — зміну збережено. */
  toggle: () => Promise<boolean>
}

interface PinState {
  /** Вибраний стан, поки запис його ще не показує. */
  target: boolean | null
  isPending: boolean
  /** Запис, з яким вибирали: новий запис (перечитали) — вибраний стан більше не потрібен. */
  base: object | null
}

const IDLE: PinState = { target: null, isPending: false, base: null }

export function usePin(
  resource: string,
  record: { id: Identifier } & PinnableRecord,
  /** Назва запису для оголошення: «ТОВ «Ромашка» закріплено вгорі списку». */
  name: string,
): PinApi {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const queryClient = useQueryClient()
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const [state, setState] = React.useState<PinState>(IDLE)
  // Подвійний клік до наступного рендеру: стан ще не встиг змінитись.
  const inFlight = React.useRef(false)
  const saved = isPinned(record)
  if (!state.isPending && state.target !== null && record !== state.base)
    setState(IDLE)

  const toggle = async () => {
    if (inFlight.current) return false
    inFlight.current = true
    const next = !saved
    setState({ target: next, isPending: true, base: record })
    try {
      await dataProvider.setPinned(resource, record.id, next)
    } catch (error) {
      toast.error(
        isApiError(error) && error.code === PIN_LIMIT_CODE
          ? t("pins.limit")
          : t("pins.failed", { message: errorText(error) }),
      )
      setState(IDLE)
      return false
    } finally {
      inFlight.current = false
    }
    announce(t(next ? "pins.pinned" : "pins.unpinned", { name }))
    // Рядок міг уже перемонтуватись на новому місці: тоді стан не потрібен, і React це пропустить.
    setState({ target: next, isPending: false, base: record })
    await queryClient.invalidateQueries({ queryKey: [resource] })
    return true
  }

  return {
    pinned: state.target ?? saved,
    isPending: state.isPending,
    toggle,
  }
}
