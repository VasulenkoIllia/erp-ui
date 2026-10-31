/**
 * Форма запису ресурсу (SPEC §8.2, §8.3; ADR-0002, ADR-0015, ADR-0026): react-hook-form з
 * налаштуваннями кіта, створення (`POST` усіх полів) і зміна (`PATCH` лише змінених полів з `version`).
 *
 * - Форму створює хук: перевірка при виході з поля (`onTouched`), фокус після невдалої спроби — на
 *   зведенні помилок (`shouldFocusError: false`), схема zod — `schema`.
 * - Конфлікт 409: `current` з відповіді розбирає `recordSchema` (схема контракту з полями
 *   розширення), і форма показує порівняння змінених полів (`conflict`, `erp/record-form`).
 *   «Зберегти мої зміни» — ті самі поля з новою версією, «Взяти збережене» — значення сервера у
 *   формі. Не розібралось — звичайна помилка над формою.
 * - 422 `fieldErrors` — помилки полів, коди — текстом мовою інтерфейсу; поле, якого у формі немає,
 *   діалог показує над формою. Введене не губиться.
 * - Відправка без змін — тост «Змін немає» і `onUnchanged`.
 * - Поки йде запит, повторна відправка (Enter у полі) нічого не надсилає. Без мережі запит одразу
 *   завершується помилкою «офлайн», а не чекає мережі. Межі часу немає: `POST` не можна безпечно
 *   повторити, тож тайм-аут підштовхнув би до дубліката.
 * - Після успіху форма скидається на збережене (захист незбережених змін вимикається), списки
 *   ресурсу перечитуються: вкладки, лічильники, вибір запису. `onSaved` — після рендера зі
 *   скинутою формою: перехід на картку нового запису захист уже не зупиняє.
 */
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useCreate, useUpdate, type RaRecord } from "ra-core"
import * as React from "react"
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"

export interface RecordFormOptions<
  TValues extends FieldValues,
  TRecord extends RaRecord,
> {
  /** Ресурс API (ADR-0002): `organizations`. */
  readonly resource: string
  /** Запис, який змінюємо; без нього — створення. */
  readonly record?: TRecord
  /**
   * Форма на сторінці живе довше за запит: перечитаний запис замінює значення й версію, поки людина
   * нічого не змінила. Зі змінами форма лишається на своїй версії, збереження покаже конфлікт.
   */
  readonly followRecord?: boolean
  /** Схема форми: поля модуля й розширення. Тексти помилок — мовою інтерфейсу (`useMemo`). */
  readonly schema: z.ZodType<TValues, TValues>
  /** Початкові значення: із запису чи порожні для створення. */
  readonly defaultValues: TValues
  /** Схема запису контракту з полями розширення: розбирає `current` з відповіді 409. */
  readonly recordSchema: z.ZodType<TRecord>
  /**
   * Значення форми → поля запиту; `keys` — що надсилати (при зміні — лише змінені поля). `target` —
   * запис, до якого застосовують зміну: збережений чи, після «Зберегти мої зміни», збережений зараз.
   * Форма одного елемента вкладеної колекції (адреса організації) будує з нього всю колекцію, щоб
   * не затерти чужих змін (ADR-0028).
   */
  readonly toPayload: (
    values: TValues,
    keys: readonly Path<TValues>[],
    target: TRecord | undefined,
  ) => Record<string, unknown>
  /**
   * Поле форми для помилки 422 сервера: `bankAccounts.1.iban` → `iban`. Без нього — ім'я з відповіді;
   * поле, якого у формі немає, діалог показує над формою.
   */
  readonly fieldOfServerError?: (field: string) => string
  /** Запис → значення форми: «Взяти збережене» після конфлікту. */
  readonly toValues: (record: TRecord) => TValues
  readonly onSaved: (record: TRecord) => void
  /** Відправили без змін. */
  readonly onUnchanged?: () => void
}

export interface RecordFormConflict<TValues> {
  /** Значення, збережені зараз, — у вигляді значень форми. */
  readonly theirs: TValues
  /** Змінені поля форми: їх порівнює діалог. */
  readonly keys: readonly Path<TValues>[]
}

export interface RecordFormState<TValues extends FieldValues> {
  readonly form: UseFormReturn<TValues>
  readonly submit: (event?: React.BaseSyntheticEvent) => Promise<void>
  readonly isSaving: boolean
  /** Помилка над формою: не прив'язана до поля. */
  readonly error: string | null
  readonly conflict: RecordFormConflict<TValues> | null
  /** «Зберегти мої зміни» поверх версії, збереженої зараз. */
  readonly overwrite: () => void
  /** «Взяти збережене»: значення сервера у формі. */
  readonly reload: () => void
  readonly dismissConflict: () => void
  /** Повернути збережені значення й прибрати помилку над формою. */
  readonly discard: () => void
}

/** Відповіді, після яких доступ до запису міг змінитись: 403 — чужий, 404 — чужого вже не видно. */
const DENIED_STATUSES: ReadonlySet<number> = new Set([403, 404])

/** Коди 422 `fieldErrors` із текстом у кіті; решта — «Сервер не прийняв це значення». */
const SERVER_ERROR_KEYS: Readonly<Record<string, ErpUiKey>> = {
  required: "validation.required",
  duplicate: "recordForm.serverErrors.duplicate",
  tooLong: "recordForm.serverErrors.tooLong",
}

const NO_RECORD = new Error("erp-ui: save response has no record")

interface PendingConflict<TValues, TRecord> {
  readonly record: TRecord
  readonly values: TValues
  readonly keys: readonly Path<TValues>[]
}

/** Поле змінене: `true` чи вкладене (масив, об'єкт) з хоч одним `true`. */
function isDirtyMark(mark: unknown): boolean {
  if (mark === true) return true
  return (
    typeof mark === "object" &&
    mark !== null &&
    Object.values(mark).some(isDirtyMark)
  )
}

/** Змінені поля форми з `formState.dirtyFields`. */
function dirtyKeys(dirtyFields: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(dirtyFields).filter((key) => isDirtyMark(dirtyFields[key]))
}

/** Форма з налаштуваннями кіта (ADR-0015): перевірка при виході з поля, фокус — на зведенні помилок. */
function useKitForm<TValues extends FieldValues>(
  schema: z.ZodType<TValues, TValues>,
  defaultValues: TValues,
) {
  return useForm<TValues, unknown, TValues>({
    mode: "onTouched",
    shouldFocusError: false,
    resolver: zodResolver(schema),
    // Повні значення — підтип часткового `DefaultValues`, але для узагальненого TValues TS цього не виводить.
    defaultValues: defaultValues as DefaultValues<TValues>,
  })
}

/** Серверні помилки полів; `false` — у відповіді їх немає. */
function useServerFieldErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  fieldOf: (field: string) => string = (field) => field,
) {
  const t = useErpUiT()
  return (failure: unknown): boolean => {
    if (!isApiError(failure) || !failure.fieldErrors) return false
    const entries = Object.entries(failure.fieldErrors)
    // Фокус не ставимо: після невдалої спроби його бере зведення помилок (`FormErrorSummary`), а
    // помилку поля, якого у формі немає, — повідомлення над формою (`erp/record-form`).
    for (const [name, code] of entries) {
      const key = Object.hasOwn(SERVER_ERROR_KEYS, code)
        ? SERVER_ERROR_KEYS[code]
        : undefined
      form.setError(fieldOf(name) as Path<TValues>, {
        type: "server",
        message: t(key ?? "recordForm.serverErrors.invalid"),
      })
    }
    return entries.length > 0
  }
}

/** Запис, збережений зараз, з відповіді 409 (`current`); не конфлікт чи не розібрався — `null`. */
function conflictRecord<TRecord>(
  failure: unknown,
  recordSchema: z.ZodType<TRecord>,
): TRecord | null {
  if (!isApiError(failure) || failure.code !== "conflict") return null
  const parsed = recordSchema.safeParse(failure.current)
  return parsed.success ? parsed.data : null
}

/** Версія запису (ADR-0002): у `RaRecord` поля без типу. */
const versionOf = (record: RaRecord): unknown => record.version

/** Запит створення чи зміни в компанії користувача; відповідь — збережений запис. */
function useSaveRequest<TRecord extends RaRecord>(resource: string) {
  const companyId = useCompanyId()
  // Без мережі мутація TanStack Query інакше стає на паузу, і «Зберегти» крутиться без кінця.
  const [create] = useCreate<TRecord>(undefined, undefined, {
    networkMode: "always",
  })
  const [update] = useUpdate<TRecord>(undefined, undefined, {
    networkMode: "always",
  })
  return (payload: Record<string, unknown>, target: TRecord | undefined) => {
    // Той самий ключ, що в запиту картки: ra-core оновить її кеш відповіддю сервера.
    const meta = companyScope(companyId)
    if (!target)
      return create(
        resource,
        { data: payload as Partial<TRecord>, meta },
        { returnPromise: true },
      )
    return update(
      resource,
      {
        id: target.id,
        data: {
          ...payload,
          version: versionOf(target),
        } as unknown as Partial<TRecord>,
        previousData: target,
        meta,
      },
      { mutationMode: "pessimistic", returnPromise: true },
    )
  }
}

/**
 * `onSaved` після рендера зі скинутою формою: інакше захист незбережених змін ще бачить старий стан
 * і зупиняє перехід, який робить `onSaved` (картка щойно створеного запису).
 */
function useSavedCallback<TRecord>(
  isDirty: boolean,
  onSaved: (record: TRecord) => void,
) {
  // Обгортка — своя на кожне збереження: `onSaved` викликається один раз на неї.
  const [saved, setSaved] = React.useState<{ record: TRecord } | null>(null)
  const notifiedRef = React.useRef<object | null>(null)
  const notify = React.useEffectEvent(onSaved)
  React.useEffect(() => {
    if (!saved || isDirty || notifiedRef.current === saved) return
    notifiedRef.current = saved
    notify(saved.record)
  }, [saved, isDirty])
  return (record: TRecord) => {
    setSaved({ record })
  }
}

/** Нова версія запису — у `apply`, коли форма без змін. Зі змінами версія дочекається їх скасування. */
function useFollowedRecord<TRecord extends RaRecord>(
  record: TRecord | undefined,
  isDirty: boolean,
  apply: (record: TRecord) => void,
) {
  const version = record ? versionOf(record) : undefined
  const seenRef = React.useRef(version)
  const follow = React.useEffectEvent(apply)
  React.useEffect(() => {
    if (!record || isDirty || seenRef.current === version) return
    seenRef.current = version
    follow(record)
  }, [record, version, isDirty])
}

export function useRecordForm<
  TValues extends FieldValues,
  TRecord extends RaRecord,
>(options: RecordFormOptions<TValues, TRecord>): RecordFormState<TValues> {
  const { resource, record, schema, toValues } = options
  const t = useErpUiT()
  const errorMessage = useApiErrorMessage()
  const queryClient = useQueryClient()
  const form = useKitForm(schema, options.defaultValues)
  const request = useSaveRequest<TRecord>(resource)
  const serverFieldErrors = useServerFieldErrors(
    form,
    options.fieldOfServerError,
  )
  // Запис, від якого рахуємо зміни й версію: після створення — створений, після «Взяти збережене» —
  // версія сервера.
  const [base, setBase] = React.useState(record)
  const [pending, setPending] = React.useState<PendingConflict<
    TValues,
    TRecord
  > | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isSaving, setSaving] = React.useState(false)
  const savingRef = React.useRef(false)
  // Підписка на змінені поля під час рендера: інакше react-hook-form їх не рахує.
  const dirtyFields: Readonly<Record<string, unknown>> =
    form.formState.dirtyFields
  const saved = useSavedCallback(form.formState.isDirty, options.onSaved)
  useFollowedRecord(
    options.followRecord ? record : undefined,
    form.formState.isDirty,
    (fresh) => {
      // Лише новіша за базу: власне збереження й «Взяти збережене» вже стали нею.
      if (base && Number(versionOf(fresh)) <= Number(versionOf(base))) return
      setBase(fresh)
      form.reset(toValues(fresh))
    },
  )

  const run = async (
    values: TValues,
    keys: readonly Path<TValues>[],
    target: TRecord | undefined,
  ) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      // З `returnPromise` ra-core повертає запис; `void` у типі — для виклику без нього.
      const result = await request(
        options.toPayload(values, keys, target),
        target,
      )
      if (!result) throw NO_RECORD
      form.reset(values)
      setBase(result)
      void queryClient.invalidateQueries({ queryKey: [resource] })
      saved(result)
    } catch (failure: unknown) {
      const current = target && conflictRecord(failure, options.recordSchema)
      if (current) setPending({ record: current, values, keys })
      else if (!serverFieldErrors(failure)) setError(errorMessage(failure))
      // Запис передали чи заборонили: доступ — із перечитаної картки, а не з запису форми.
      if (isApiError(failure) && DENIED_STATUSES.has(failure.status))
        void queryClient.invalidateQueries({ queryKey: [resource] })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // `handleSubmit` — у момент відправки, а не під час рендера: обробник читає ref запиту.
  const submit = (event?: React.BaseSyntheticEvent) =>
    form.handleSubmit(async (values) => {
      const keys = (
        base ? dirtyKeys(dirtyFields) : Object.keys(values)
      ) as Path<TValues>[]
      if (!keys.length) {
        toast.info(t("forms.noChanges"))
        options.onUnchanged?.()
        return
      }
      await run(values, keys, base)
    })(event)

  const conflict = React.useMemo(
    () =>
      pending ? { theirs: toValues(pending.record), keys: pending.keys } : null,
    [pending, toValues],
  )

  return {
    form,
    submit,
    isSaving,
    error,
    conflict,
    overwrite: () => {
      if (!pending) return
      setPending(null)
      setBase(pending.record)
      void run(pending.values, pending.keys, pending.record)
    },
    reload: () => {
      if (!pending) return
      setPending(null)
      setBase(pending.record)
      form.reset(toValues(pending.record))
      // Картка під формою теж показує збережене зараз.
      void queryClient.invalidateQueries({ queryKey: [resource] })
      toast(t("recordForm.reloaded"))
    },
    dismissConflict: () => {
      setPending(null)
    },
    discard: () => {
      form.reset()
      setError(null)
    },
  }
}
