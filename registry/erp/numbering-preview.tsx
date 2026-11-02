import { useGetList } from "ra-core"
import * as React from "react"
import { useWatch, type Control } from "react-hook-form"

import { FormSelect } from "@/registry/erp/form-select"
import type { RecordFormItemProps } from "@/registry/erp/record-form"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { announce } from "@/registry/lib/announce"
import { MAX_PER_PAGE } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { todayIn } from "@/registry/lib/dates"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  NUMBERING_COUNTERS,
  NUMBERING_TEMPLATE_MAX_LENGTH,
  nextDocumentNumber,
  numberingTemplateIssue,
  usesBranch,
  type NumberingCounter,
  type NumberingRules,
  type NumberingSeries,
  type NumberingTemplateIssue,
} from "@/registry/lib/numbering"
import { Field, FieldLabel } from "@/registry/ui/field"

/**
 * Перегляд наступного номера серії (PF03b, ADR-0058), частина `erp/numbering-series-form`: номер для
 * шаблону у формі, зокрема ще не збереженого, з лічильників сервера; філію питає, лише якщо номер її має.
 * Скрінрідер чує номер після паузи в наборі, а не на кожну літеру шаблону.
 */
export type NumberingPreviewValues = NumberingRules & { template: string }

/** Текст помилки шаблону мовою інтерфейсу: біля поля, у перегляді й для коду 422 сервера. */
export function useNumberingIssueText() {
  const t = useErpUiT()
  return React.useCallback(
    (issue: NumberingTemplateIssue) =>
      t(`numbering.issues.${issue}`, { max: NUMBERING_TEMPLATE_MAX_LENGTH }),
    [t],
  )
}

export function NumberingPreview({
  control,
  series,
  label,
  description,
  className,
}: RecordFormItemProps & {
  control: Control<NumberingPreviewValues>
  series: NumberingSeries
}) {
  const t = useErpUiT()
  const issueText = useNumberingIssueText()
  const id = React.useId()
  const companyId = useCompanyId()
  const values = useWatch({ control })
  const profile = useCompanyProfile()
  // `undefined` — людина ще не вибирала: перегляд для першої філії, а не номер без коду.
  const [chosen, setChosen] = React.useState<string | null>()
  const counters = useGetList<NumberingCounter>(
    NUMBERING_COUNTERS,
    {
      filter: { series: series.id },
      pagination: { page: 1, perPage: MAX_PER_PAGE },
      meta: companyScope(companyId),
    },
    // Лічильник росте з кожним проведенням: відкрили форму знову — свіжі значення, а не кеш.
    { staleTime: 0 },
  )
  const rules = {
    id: series.id,
    template: values.template ?? series.template,
    resetYearly: values.resetYearly ?? series.resetYearly,
    perBranch: values.perBranch ?? series.perBranch,
  }
  const branches = profile.data?.branches ?? []
  const branch =
    chosen === undefined
      ? branches[0]
      : branches.find((item) => item.id === chosen)
  const issue = numberingTemplateIssue(rules.template, rules)
  const text = issue
    ? issueText(issue)
    : counters.error
      ? t("numbering.previewFailed")
      : counters.data
        ? (nextDocumentNumber(rules, counters.data, {
            date: todayIn(profile.data?.timezone ?? undefined),
            branchId: branch?.id ?? null,
            branchCode: branch?.code,
          }) ?? "")
        : t("common.loading")
  // Вибір людини, а не похідна філія: профіль, що прийшов пізніше, не оголошує номер сам.
  useSettledAnnouncement(
    JSON.stringify([
      rules.template,
      rules.resetYearly,
      rules.perBranch,
      chosen,
    ]),
    `${label}: ${text}`,
  )
  return (
    <div className={className}>
      <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] @lg:items-end">
        <div className="grid min-w-0 gap-1">
          <p id={`${id}-label`} className="text-sm text-muted-foreground">
            {label}
          </p>
          <output
            aria-live="off"
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            className="font-mono text-lg font-semibold break-all"
          >
            {text}
          </output>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {usesBranch(rules.template) && branches.length ? (
          <Field>
            <FieldLabel htmlFor={`${id}-branch`}>
              {t("numbering.previewBranch")}
            </FieldLabel>
            <FormSelect<string | null>
              id={`${id}-branch`}
              items={[
                { value: null, label: t("numbering.noBranch") },
                ...branches.map((item) => ({
                  value: item.id,
                  label: item.code ? `${item.name} (${item.code})` : item.name,
                })),
              ]}
              value={branch?.id ?? null}
              onValueChange={setChosen}
            />
          </Field>
        ) : null}
      </div>
    </div>
  )
}

/** Пауза в наборі, після якої перегляд звучить для скрінрідера, як у `erp/save-bar`. */
const PREVIEW_ANNOUNCE_DELAY_MS = 700

/**
 * Оголосити `message`, коли змінився `key` (шаблон, правила, філія) і людина зробила паузу. Перший
 * показ і нові лічильники з сервера не оголошуються: людина нічого не змінювала.
 */
function useSettledAnnouncement(key: string, message: string) {
  const announced = React.useRef(key)
  const latest = React.useRef(message)
  React.useEffect(() => {
    latest.current = message
  })
  React.useEffect(() => {
    if (key === announced.current) return
    announced.current = key
    const timer = setTimeout(() => {
      announce(latest.current)
    }, PREVIEW_ANNOUNCE_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [key])
}
