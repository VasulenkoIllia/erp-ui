import * as React from "react"

import { ShortcutKeys } from "@/registry/erp/shortcut-keys"
import { isFocusLost } from "@/registry/hooks/use-focus-heading"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  areCharacterShortcutsEnabled,
  isCharacterShortcut,
  isMacPlatform,
  setCharacterShortcutsEnabled,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  subscribeCharacterShortcuts,
  type ProjectShortcut,
  type ShortcutId,
} from "@/registry/lib/shortcuts"
import { Field, FieldDescription, FieldLabel } from "@/registry/ui/field"
import { Switch } from "@/registry/ui/switch"

const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[]

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-1">
      <dt className="min-w-0">{label}</dt>
      <dd className="flex shrink-0 flex-wrap justify-end gap-1">{children}</dd>
    </div>
  )
}

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1 font-medium">{title}</h3>
      <dl className="divide-y text-muted-foreground">{children}</dl>
    </div>
  )
}

/** Вимикач клавіші «?»: на ньому тримається виконання WCAG 2.1.4. */
function CharacterKeysSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const t = useErpUiT()
  const id = React.useId()
  return (
    <Field orientation="horizontal">
      <Switch
        id={id}
        checked={enabled}
        aria-describedby={`${id}-hint`}
        onCheckedChange={onChange}
      />
      <div className="grid gap-1">
        <FieldLabel htmlFor={id}>{t("shortcuts.characterKeys")}</FieldLabel>
        <FieldDescription id={`${id}-hint`}>
          {t("shortcuts.characterKeysHint")}
        </FieldDescription>
      </div>
    </Field>
  )
}

/**
 * Перелік клавіш за групами й перемикач «?». Вузький контейнер — одна колонка, широкий — дві
 * (`@container`, SPEC §9). Окремий файл, щоб довідка вантажила його лише при відкритті.
 */
export function ShortcutsHelpList({
  extra = [],
}: {
  extra?: readonly ProjectShortcut[]
}) {
  const t = useErpUiT()
  const charactersEnabled = React.useSyncExternalStore(
    subscribeCharacterShortcuts,
    areCharacterShortcutsEnabled,
    () => true,
  )
  // Після «Спробувати ще» кнопка зникла разом зі станом помилки, і фокус упав на body: повертаємо
  // на вікно довідки, інакше скрінрідер мовчить, а модальне вікно лишається без фокуса.
  const root = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!isFocusLost()) return
    root.current?.closest<HTMLElement>("[role=dialog]")?.focus()
  }, [])
  return (
    <div ref={root} className="@container space-y-4">
      <div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <Group key={group} title={t(`shortcuts.groups.${group}`)}>
            {SHORTCUT_IDS.filter((id) => SHORTCUTS[id].group === group).map(
              (id) => (
                <Row key={id} label={t(`shortcuts.items.${id}`)}>
                  {id === "help" && !charactersEnabled ? (
                    t("shortcuts.off")
                  ) : (
                    <ShortcutKeys shortcut={SHORTCUTS[id]} />
                  )}
                </Row>
              ),
            )}
          </Group>
        ))}
        {extra.length ? (
          <Group title={t("shortcuts.groups.project")}>
            {extra.map((shortcut) => (
              <Row key={shortcut.id} label={shortcut.label}>
                {isCharacterShortcut(shortcut) && !charactersEnabled ? (
                  t("shortcuts.off")
                ) : (
                  <ShortcutKeys shortcut={shortcut} />
                )}
              </Row>
            ))}
          </Group>
        ) : null}
      </div>
      {isMacPlatform() ? (
        <p className="text-muted-foreground">{t("shortcuts.macNote")}</p>
      ) : null}
      <CharacterKeysSwitch
        enabled={charactersEnabled}
        onChange={setCharacterShortcutsEnabled}
      />
    </div>
  )
}
