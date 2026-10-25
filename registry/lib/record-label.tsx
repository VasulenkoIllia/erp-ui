import { Fragment, memo, useMemo, useSyncExternalStore } from "react"
import { useGetManyAggregate, type RaRecord } from "ra-core"

import { isApiError } from "@/registry/lib/api"
import {
  companyScope,
  getCompanyId,
  subscribeCompany,
} from "@/registry/lib/company-scope"
import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"

/**
 * Підпис запису довідника сервера за `id` (крок A2a, ADR-0030): поле розширення «запис із
 * довідника» в колонці списку, шапці картки й порівнянні при конфлікті, чип фільтра за ним.
 *
 * - `getMany` ra-core збирає підписи, які сторінка просить за один такт, в один запит
 *   (`GET /<ресурс>?id=a&id=b`, ADR-0002): двадцять рядків списку — один запит, а не двадцять.
 * - Поки вантажиться — «Завантаження…»; запису немає (видалили) — «Запис не знайдено»; немає права
 *   читати довідник (403) — «Немає доступу»; інша помилка — «Не вдалося завантажити запис». Тексти —
 *   як у полі вибору запису (`erp/record-picker`). Запис є, а назви немає — його `id`.
 * - Тимчасовий збій повторюється за політикою застосунку (`createQueryClient`); стійка помилка не
 *   перезапитується з кожним новим рядком, що з'явився під час прокрутки.
 * - Компонент у `lib`, бо його ставить `useExtensionFields` з `lib/extension-fields`: модуль не знає
 *   типів полів розширення, а колонка поля-запису сама показує підпис.
 */
export interface RecordLabelProps {
  /** Ресурс API довідника: `users`. */
  resource: string
  id: string
  /** Поле запису з назвою: `name`. */
  labelField: string
}

const noCompany = () => null

/** Назва запису з його поля; не рядок чи порожньо — `null`. */
export function recordLabelOf(
  record: RaRecord | undefined,
  labelField: string,
): string | null {
  const label: unknown = record?.[labelField]
  return typeof label === "string" && label.trim() ? label : null
}

/** Підпис і другий рядок варіанта у виборі запису (`erp/record-picker`) з полів запису довідника. */
export function recordOptionTexts(
  labelField: string,
  descriptionField?: string,
): {
  optionLabel: (record: RaRecord) => string
  optionDescription?: (record: RaRecord) => string | undefined
} {
  return {
    optionLabel: (record) =>
      recordLabelOf(record, labelField) ?? String(record.id),
    optionDescription: descriptionField
      ? (record) => recordLabelOf(record, descriptionField) ?? undefined
      : undefined,
  }
}

// memo: комірки списку перемальовуються під час прокрутки, а пропси підпису — рядки.
export const RecordLabel = memo(function RecordLabel({
  resource,
  id,
  labelField,
}: RecordLabelProps) {
  const t = useErpUiT()
  // Як `useCompanyId` з hooks/use-company: шар lib не імпортує hooks.
  const companyId = useSyncExternalStore(
    subscribeCompany,
    getCompanyId,
    noCompany,
  )
  const params = useMemo(
    () => ({ ids: [id], meta: companyScope(companyId) }),
    [id, companyId],
  )
  const { data, isPending, error } = useGetManyAggregate<RaRecord>(
    resource,
    params,
    // Сам запит getMany ra-core повторює за політикою застосунку (`fetchQuery` бере `retry` клієнта),
    // тож зовнішній повтор вимкнено, як у ra-core. Помилку не перезапитуємо, коли рядок знову
    // з'явився під час прокрутки: 403 у кожному рядку — не причина для запитів; оновить фокус вікна.
    { retryOnMount: false },
  )
  const record = data?.find((item) => String(item.id) === id)
  if (record) return <>{recordLabelOf(record, labelField) ?? id}</>
  return (
    <span className="text-muted-foreground">
      {t(stateText(isPending, error))}
    </span>
  )
})

function stateText(isPending: boolean, error: unknown): ErpUiKey {
  if (isPending) return "recordPicker.loadingValue"
  if (isApiError(error) && error.status === 403)
    return "recordPicker.valueForbidden"
  return error ? "recordPicker.valueError" : "recordPicker.missing"
}

/** Кілька записів через кому: чип фільтра «одне з». */
export function RecordLabels({
  resource,
  ids,
  labelField,
}: Omit<RecordLabelProps, "id"> & { ids: readonly string[] }) {
  return ids.map((id, position) => (
    <Fragment key={id}>
      {position > 0 ? ", " : null}
      <RecordLabel resource={resource} id={id} labelField={labelField} />
    </Fragment>
  ))
}
