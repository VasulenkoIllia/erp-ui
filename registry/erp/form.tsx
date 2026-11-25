import * as React from "react"
import { useBlocker, useCanBlock } from "@/registry/lib/ra-core"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import {
  FormErrorSummary,
  FormField,
  keepFieldFocus,
  type FormControlProps,
  type FormErrorSummaryProps,
  type FormFieldProps,
} from "@/registry/erp/form-field"
import {
  KeptOverTabsContext,
  searchWithoutTab,
} from "@/registry/hooks/use-tab-param"
import { useErpUiT } from "@/registry/lib/i18n"
import { holdUnsavedChanges, isPageReloading } from "@/registry/lib/page-reload"

/**
 * Форми кіта (ADR-0015): поле, зведення помилок і кнопки — з erp/form-field (як працює форма — там), а тут ще
 * захист незбережених змін, якому потрібен роутер ra-core. Старі імпорти з erp/form працюють як були; проект
 * без ra-core бере erp/form-field (ADR-0099).
 */

/**
 * Незбережені зміни (SPEC §8.2): перехід у застосунку — діалог «Вийти без збереження?»,
 * закриття чи перезавантаження вкладки — запит браузера (`beforeunload`), а «Оновити сторінку» після
 * збою чанка питає на місці (`lib/page-reload`, ADR-0055).
 * Діалог — лише з роутером, що вміє блокувати перехід (data router; ra-core створює його сам);
 * в іншому роутері лишається `beforeunload`, як у `Form` з ra-core.
 * `when` тримайте увімкненим і під час збереження: після успіху (`reset`) перехід, на який
 * чекав діалог, відбудеться сам, а збій лишить користувача на сторінці з введеним.
 * Один на сторінку: роутер перевіряє лише останній блокувальник, навіть вимкнений, тож другий
 * захист під чистою формою вимкнув би перший.
 */
function UnsavedChangesGuard({ when }: { when: boolean }) {
  const canBlock = useCanBlock()

  React.useEffect(() => {
    if (!when) return
    const release = holdUnsavedChanges()
    const warn = (event: BeforeUnloadEvent) => {
      if (!isPageReloading()) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
      release()
    }
  }, [when])

  return canBlock ? <NavigationGuard when={when} /> : null
}

function NavigationGuard({ when }: { when: boolean }) {
  const t = useErpUiT()
  const isKeptOverTabs = React.useContext(KeptOverTabsContext)
  const searchOf = (search: string) =>
    isKeptOverTabs ? searchWithoutTab(search) : search
  // Зміна лише якоря (#розділ) форму не закриває — не питаємо. Те саме з вкладкою, якщо форма живе поза нею.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when &&
      (currentLocation.pathname !== nextLocation.pathname ||
        searchOf(currentLocation.search) !== searchOf(nextLocation.search)),
  )
  const blocked = blocker.state === "blocked"

  React.useEffect(() => {
    // Зміни зберегли чи скинули, поки діалог відкритий, — пропускаємо перехід.
    if (blocked && !when) blocker.proceed?.()
  }, [blocked, when, blocker])

  return (
    <ConfirmDialog
      open={blocked}
      title={t("forms.unsavedTitle")}
      description={t("forms.unsavedDescription")}
      confirmLabel={t("forms.unsavedLeave")}
      cancelLabel={t("forms.unsavedStay")}
      destructive
      onClose={() => {
        blocker.reset?.()
      }}
      onConfirm={() => {
        blocker.proceed?.()
      }}
    />
  )
}

export {
  FormErrorSummary,
  FormField,
  keepFieldFocus,
  UnsavedChangesGuard,
  type FormControlProps,
  type FormErrorSummaryProps,
  type FormFieldProps,
}
