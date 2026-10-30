import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"

/**
 * Дії відкритого запису в палітрі команд (SPEC §7, PF06, ADR-0044). Шапка картки бере дії вузлами
 * (`ObjectPageAction`), палітрі потрібні дані, тож картка описує їх окремо:
 *
 *   usePaletteActions(contact && { title: contact.name, actions: [{ id: "edit", label, onSelect }] })
 *
 * Поки сторінка відкрита, група стоїть у палітрі першою, а зі сторінкою зникає. Запис палітри лежить
 * у спільному сховищі модуля: палітру рендерить оболонка проекту, а картку — модуль, і проект нічого
 * не прокидає. Слот проекту на картці викликає той самий хук: групи складаються.
 */
export interface PaletteAction {
  id: string
  label: string
  icon?: LucideIcon
  /** Додаткові слова для пошуку (синоніми, англійська назва). */
  keywords?: string[]
  /** Причина, чому дія зараз недоступна (SPEC §8.4): рядок видно, він у фокусі, але не виконується. */
  deniedReason?: string
  onSelect: () => void
}

export interface PaletteActionGroup {
  /** Назва запису: палітра показує її в заголовку групи. */
  title: string
  actions: readonly PaletteAction[]
}

type Registered = PaletteActionGroup & {
  key: string
  /** Що бачить людина: без змін палітра не перемальовується й підсвічений рядок не стрибає. */
  signature: string
  /** Остання група картки: `onSelect` бере звідси свіже замикання. */
  latest: PaletteActionGroup
}

let registered: readonly Registered[] = []
const listeners = new Set<() => void>()

function publish(next: readonly Registered[]) {
  registered = next
  for (const listener of listeners) listener()
}

function signatureOf({ title, actions }: PaletteActionGroup) {
  return JSON.stringify([
    title,
    actions.map(({ id, label, keywords, deniedReason }) => [
      id,
      label,
      keywords,
      deniedReason,
    ]),
  ])
}

function setGroup(key: string, group: PaletteActionGroup) {
  const signature = signatureOf(group)
  const current = registered.find((item) => item.key === key)
  if (current?.signature === signature) {
    current.latest = group
    return
  }
  const entry: Registered = {
    key,
    signature,
    latest: group,
    title: group.title,
    actions: group.actions.map((action) => ({
      ...action,
      onSelect: () => {
        entry.latest.actions.find((item) => item.id === action.id)?.onSelect()
      },
    })),
  }
  publish(
    current
      ? registered.map((item) => (item.key === key ? entry : item))
      : [...registered, entry],
  )
}

function removeGroup(key: string) {
  if (registered.some((item) => item.key === key))
    publish(registered.filter((item) => item.key !== key))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Дії запису для палітри; `null` — запису ще немає. Список можна будувати на кожен рендер. */
export function usePaletteActions(
  group: PaletteActionGroup | null | undefined,
) {
  const key = React.useId()
  React.useEffect(() => {
    if (group) setGroup(key, group)
    else removeGroup(key)
  }, [key, group])
  React.useEffect(
    () => () => {
      removeGroup(key)
    },
    [key],
  )
}

/** Перехід на вкладки картки: однаковий для всіх карток із вкладками. */
export function useSectionActions(
  sections: readonly { id: string; title: string }[],
  onOpen: (sectionId: string) => void,
): PaletteAction[] {
  const t = useErpUiT()
  return sections.map((section) => ({
    id: `section-${section.id}`,
    label: t("commandPalette.openSection", { section: section.title }),
    onSelect: () => {
      onOpen(section.id)
    },
  }))
}

/** Групи відкритих записів: їх читає палітра (erp/command-palette). */
export function usePaletteActionGroups(): readonly (PaletteActionGroup & {
  key: string
})[] {
  return React.useSyncExternalStore(subscribe, () => registered)
}
