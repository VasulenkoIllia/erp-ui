import * as React from "react"
import { FlaskConicalIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import {
  getScenarioState,
  resetScenarios,
  SCENARIOS,
  setScenario,
  subscribeScenarios,
  type Scenario,
} from "@/registry/lib/mock-scenarios"
import { Button } from "@/registry/ui/button"
import { Field, FieldLabel } from "@/registry/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/registry/ui/sheet"

/**
 * Панель розробника (SPEC §17): перемикає сценарії моків — для всіх ресурсів або окремо.
 * Показуйте лише в розробці й демо. `onChange` — оновити дані після зміни (напр. invalidateQueries).
 * `children` — додаткові інструменти проекту (вхід іншим користувачем тощо).
 *
 * Кнопку ставте в топбар (`compact` — лише іконка): плаваюча кнопка перекривала б елемент
 * у фокусі (WCAG 2.4.11). Крапка на кнопці — увімкнено сценарій, відмінний від «Успіх».
 */
const INHERIT = "inherit"

export function DevPanel({
  resources,
  onChange,
  compact = false,
  className,
  children,
}: {
  resources: string[]
  onChange?: () => void
  /** Лише іконка з підписом для скрінрідера — для топбара на вузьких екранах. */
  compact?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const state = React.useSyncExternalStore(
    subscribeScenarios,
    getScenarioState,
    getScenarioState,
  )
  const ids = React.useId()
  const scenarioItems = SCENARIOS.map((value) => ({
    value,
    label: t(`devPanel.scenarios.${value}`),
  }))
  const customized =
    state.global !== "success" || Object.keys(state.resources).length > 0
  const label = t("devPanel.open", {
    name: t(`devPanel.scenarios.${state.global}`),
  })
  const change = (scenario: Scenario, resource?: string) => {
    setScenario(scenario, resource)
    onChange?.()
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant={compact ? "ghost" : "outline"}
            size={compact ? "icon" : "sm"}
            aria-label={compact ? label : undefined}
            className={cn("relative", className)}
          />
        }
      >
        <FlaskConicalIcon aria-hidden />
        {compact ? null : label}
        {customized ? (
          <span
            aria-hidden
            data-slot="dev-panel-indicator"
            className="absolute top-1 right-1 size-2 rounded-full bg-warning"
          />
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>{t("devPanel.title")}</SheetTitle>
          <SheetDescription>{t("devPanel.description")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <Field>
            <FieldLabel htmlFor={`${ids}-all`}>{t("devPanel.all")}</FieldLabel>
            <Select
              items={scenarioItems}
              value={state.global}
              onValueChange={(value: Scenario | null) => {
                if (value) change(value)
              }}
            >
              <SelectTrigger id={`${ids}-all`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scenarioItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {resources.map((resource) => {
            const items = [
              { value: INHERIT, label: t("devPanel.inherit") },
              ...scenarioItems,
            ]
            return (
              <Field key={resource}>
                <FieldLabel htmlFor={`${ids}-${resource}`}>
                  <code>{resource}</code>
                </FieldLabel>
                <Select
                  items={items}
                  value={state.resources[resource] ?? INHERIT}
                  onValueChange={(value: string | null) => {
                    change(
                      value && value !== INHERIT
                        ? (value as Scenario)
                        : state.global,
                      resource,
                    )
                  }}
                >
                  <SelectTrigger id={`${ids}-${resource}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )
          })}
          {children}
        </div>
        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetScenarios()
              onChange?.()
            }}
          >
            {t("devPanel.reset")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
