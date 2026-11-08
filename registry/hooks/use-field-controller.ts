import * as React from "react"
import {
  get,
  set,
  useWatch,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type Field,
  type FieldError,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  type ReadFormState,
} from "react-hook-form"

/**
 * Легке з'єднання поля з формою для `FormField` з `erp/form` (UI05c, ADR-0063). Дає те саме, що
 * `useController` з react-hook-form 7.90 (MIT): значення, `onChange`, `onBlur`, `ref` і стан поля.
 * Різниця одна: поле читає й порівнює лише свою помилку, торкання, зміну й перевірку. `useController`
 * бере весь стан форми через `useFormState`, а той копіює його разом із `defaultValues` усіх рядків
 * документа щоразу, коли поле з'являється, зникає чи змінює ім'я (ADR-0060, п. 10).
 *
 * Реєстрація поля повторює `useController` крок у крок і спирається на ті самі внутрішні частини
 * `control` (`_subscribe`, `_fields`, `_names`, `_proxyFormState`): оновлюючи react-hook-form, проганяйте
 * `field-controller.test.tsx`. Це не повна заміна `useController`: правил (`rules`), `defaultValue`,
 * `disabled` і `shouldUnregister` окремого поля немає, бо `FormField` їх не передає.
 */

type FormControl<
  TValues extends FieldValues,
  TTransformed extends FieldValues,
> = Control<TValues, unknown, TTransformed>

/** Частини стану форми, з яких поле бере свій стан. */
type FieldStateKey = keyof Pick<
  ReadFormState,
  "errors" | "dirtyFields" | "touchedFields" | "validatingFields"
>

interface FieldSnapshot {
  readonly error: FieldError | undefined
  readonly isDirty: boolean
  readonly isTouched: boolean
  readonly isValidating: boolean
  readonly isFormDisabled: boolean
  /**
   * `reset` замінює реєстр полів форми. Поле тоді має зареєструватися знову й наново віддати `ref`,
   * інакше відправка не знайде його для фокуса на помилці. `useController` перемальовується на кожну
   * зміну стану форми, тож робить це мимохідь; легке поле — коли змінились ці посилання.
   */
  readonly fieldRefs: unknown
  readonly names: unknown
}

const sameSnapshot = (a: FieldSnapshot, b: FieldSnapshot) =>
  (Object.keys(a) as (keyof FieldSnapshot)[]).every((key) =>
    Object.is(a[key], b[key]),
  )

function readSnapshot<
  TValues extends FieldValues,
  TTransformed extends FieldValues,
>(
  control: FormControl<TValues, TTransformed>,
  name: FieldPath<TValues>,
): FieldSnapshot {
  const { error, isDirty, isTouched, isValidating } =
    control.getFieldState(name)
  return {
    error,
    isDirty,
    isTouched,
    isValidating,
    isFormDisabled: Boolean(control._formState.disabled),
    fieldRefs: control._fields,
    names: control._names,
  }
}

/** Ім'я масиву рядків, якому належить поле: `lines.3.price` → `lines`. */
const arrayNameOf = (name: string) =>
  name.substring(0, name.search(/\.\d+(\.|$)/)) || name

const childOf = (value: unknown, key: string): unknown =>
  value == null ? value : (value as Record<string, unknown>)[key]

/** Як `useController`: поле під `null` (`contact: null`) отримує `null`, а не `undefined`. */
function nullAncestorValue(
  formValues: unknown,
  defaultValues: unknown,
  name: string,
) {
  let values = formValues
  let defaults = defaultValues
  for (const segment of name.split(".").slice(0, -1)) {
    values = childOf(values, segment)
    defaults = childOf(defaults, segment)
    if (values === null || defaults === null) return null
  }
  return undefined
}

/**
 * Значення з події поля вводу або саме значення (`onChange(value)` складного поля), як `getEventValue`
 * react-hook-form: об'єкт (не масив і не дата) з непорожнім `target` — подія.
 */
function eventValue(event: unknown): unknown {
  const isEvent =
    typeof event === "object" &&
    event !== null &&
    !Array.isArray(event) &&
    !(event instanceof Date) &&
    "target" in event &&
    Boolean(event.target)
  if (!isEvent) return event
  const target = Object(event.target) as {
    type?: unknown
    checked?: unknown
    value?: unknown
  }
  return target.type === "checkbox" ? target.checked : target.value
}

/**
 * Копія початкового значення поля для `shouldUnregister`. Значення, якого `structuredClone` не копіює
 * (функція, проксі), лишається як є, як у `cloneObject` react-hook-form.
 */
function copyOf(value: unknown): unknown {
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

/** Те, що форма бачить замість елемента: фокус на помилці й перевірка браузера. */
interface FieldRefProxy {
  focus: () => void
  select: () => void
  setCustomValidity: (message: string) => void
  reportValidity: () => void
}

function proxyOf(element: unknown): FieldRefProxy {
  const target = element as Partial<HTMLInputElement>
  return {
    focus: () => target.focus?.(),
    select: () => target.select?.(),
    setCustomValidity: (message) => target.setCustomValidity?.(message),
    reportValidity: () => target.reportValidity?.(),
  }
}

const fieldOf = (fieldRefs: unknown, name: string) =>
  get(fieldRefs, name) as Field | undefined

const asFieldRef = (proxy: FieldRefProxy) =>
  proxy as unknown as Field["_f"]["ref"]

/** Підписка поля лише на його стан. */
interface FieldStore {
  /** `onChange` — лише коли знімок змінився відносно останнього показаного. */
  readonly subscribe: (
    onChange: (snapshot: FieldSnapshot) => void,
  ) => () => void
  readonly getSnapshot: () => FieldSnapshot
  /**
   * Як проксі `useFormState`: форма рахує торкання, зміну й перевірку полів, лише коли їх хтось читає,
   * тож поле позначає частину стану, щойно рендер її прочитав, і відтоді чує її зміни.
   */
  readonly track: (key: FieldStateKey) => void
}

function createFieldStore<
  TValues extends FieldValues,
  TTransformed extends FieldValues,
>(
  control: FormControl<TValues, TTransformed>,
  name: FieldPath<TValues>,
): FieldStore {
  // Помилку `FormField` читає завжди; решту — лише якщо читає поле. Вимкнення форми (`_disableForm`
  // шле лише `{ disabled }`) поле чує завжди: `field.disabled` з нього. У типі `ReadFormState` ключа
  // немає, але фільтр підписки react-hook-form дивиться на будь-який ключ стану.
  const tracked = { errors: true, disabled: true } as Partial<ReadFormState>
  let cached: FieldSnapshot | undefined
  // Той самий знімок, поки нічого не змінилось: поле без змін не перемальовується.
  const getSnapshot = () => {
    const next = readSnapshot(control, name)
    if (!cached || !sameSnapshot(cached, next)) cached = next
    return cached
  }
  return {
    subscribe: (onChange) => {
      // Останній знімок, який брав рендер чи цей обробник, — той, що на екрані.
      const notifyIfChanged = () => {
        const shown = cached
        const next = getSnapshot()
        if (next !== shown) onChange(next)
      }
      const unsubscribe = control._subscribe({
        name,
        exact: true,
        formState: tracked,
        callback: notifyIfChanged,
      })
      // Стан змінився між рендером і підпискою (помилка з ефекту сусіда): одразу, як `resyncIfNeeded`
      // у `useFormState`.
      notifyIfChanged()
      return unsubscribe
    },
    getSnapshot,
    track: (key) => {
      tracked[key] = true
      if (control._proxyFormState[key] !== "all")
        control._proxyFormState[key] = true
    },
  }
}

/** Стан поля, як `fieldState` з `useController`: кожна властивість позначає прочитану частину стану. */
const fieldStateOf = (
  store: FieldStore,
  snapshot: FieldSnapshot,
): ControllerFieldState =>
  Object.defineProperties({} as ControllerFieldState, {
    invalid: {
      enumerable: true,
      get: () => (store.track("errors"), Boolean(snapshot.error)),
    },
    error: {
      enumerable: true,
      get: () => (store.track("errors"), snapshot.error),
    },
    isDirty: {
      enumerable: true,
      get: () => (store.track("dirtyFields"), snapshot.isDirty),
    },
    isTouched: {
      enumerable: true,
      get: () => (store.track("touchedFields"), snapshot.isTouched),
    },
    isValidating: {
      enumerable: true,
      get: () => (store.track("validatingFields"), snapshot.isValidating),
    },
  } satisfies Record<keyof ControllerFieldState, PropertyDescriptor>)

/**
 * Стан поля. Підписка — у `useLayoutEffect` зі звичайним `setState`, як у `useController`, а не
 * `useSyncExternalStore`: той малює поле синхронно разом з усіма відкладеними оновленнями форми, і
 * помилка сервера з'явилась би раніше за зведення помилок, а фокус пішов би не туди (ADR-0063).
 */
function useFieldState<
  TValues extends FieldValues,
  TTransformed extends FieldValues,
>(control: FormControl<TValues, TTransformed>, name: FieldPath<TValues>) {
  const store = React.useMemo(
    () => createFieldStore(control, name),
    [control, name],
  )
  const [shown, setShown] = React.useState(() => ({
    store,
    snapshot: store.getSnapshot(),
  }))
  // Нове ім'я (рядок зсунувся) — стан нового поля одразу, без зайвого рендеру.
  const snapshot = shown.store === store ? shown.snapshot : store.getSnapshot()
  React.useLayoutEffect(
    () =>
      store.subscribe((next) => {
        setShown({ store, snapshot: next })
      }),
    [store],
  )
  const fieldState = React.useMemo(
    () => fieldStateOf(store, snapshot),
    [store, snapshot],
  )
  return { fieldState, isFormDisabled: snapshot.isFormDisabled }
}

/** Реєстрація поля у формі, як у `useController`: позначка «поле на екрані» та `ref` для фокуса. */
function useFieldRegistration<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed extends FieldValues,
>(
  control: FormControl<TValues, TTransformed>,
  name: TName,
  value: FieldPathValue<TValues, TName>,
) {
  const isArrayField = control._names.array.has(arrayNameOf(name))
  // Поле реєструється в кожному рендері (після `reset` — знову), а обробники беруть першу реєстрацію
  // чи ту, що оновили нижче. Перевірку після зміни форма запускає сама, обробник її не чекає.
  const registration = React.useRef(control.register(name, { value }))
  const proxy = React.useRef<FieldRefProxy | null>(null)

  const onChange = React.useCallback(
    (event: unknown) => {
      const next = eventValue(event) as FieldPathValue<TValues, TName>
      if (!fieldOf(control._fields, name))
        registration.current = control.register(name, { value: next })
      void registration.current.onChange({
        target: { value: next, name },
        type: "change",
      })
    },
    [control, name],
  )
  const onBlur = React.useCallback(() => {
    const current = get(control._formValues, name) as FieldPathValue<
      TValues,
      TName
    >
    if (!fieldOf(control._fields, name))
      registration.current = control.register(name, { value: current })
    void registration.current.onBlur({
      target: { value: current, name },
      type: "blur",
    })
  }, [control, name])
  // Залежить від реєстру полів: після `reset` React віддає елемент заново, і форма знову бачить `ref`.
  const fieldRefs = control._fields
  const ref = React.useCallback(
    (element: unknown) => {
      if (element) proxy.current = proxyOf(element)
      const field = fieldOf(fieldRefs, name)
      if (field?._f && element && proxy.current) {
        field._f.ref = asFieldRef(proxy.current)
        field._f._c = true
      }
    },
    [fieldRefs, name],
  )

  React.useEffect(() => {
    const shouldUnregister = Boolean(control._options.shouldUnregister)
    registration.current = control.register(name)
    const setMounted = (mounted: boolean) => {
      const field = fieldOf(control._fields, name)
      if (field?._f) {
        field._f.mount = mounted
        field._f._c = mounted
      }
    }
    setMounted(true)
    if (shouldUnregister) {
      const initial = copyOf(
        get(
          control._options.values ?? control._defaultValues,
          name,
          get(control._options.defaultValues, name),
        ),
      )
      set(control._defaultValues, name, initial)
      if (get(control._formValues, name) === undefined)
        set(control._formValues, name, initial)
    }
    if (!isArrayField) control.register(name)
    const field = fieldOf(control._fields, name)
    if (proxy.current && field?._f) field._f.ref = asFieldRef(proxy.current)
    return () => {
      const shouldRemove = isArrayField
        ? shouldUnregister && !control._state.action
        : shouldUnregister
      if (shouldRemove) control.unregister(name)
      else setMounted(false)
    }
  }, [control, name, isArrayField])

  React.useEffect(() => {
    control._setDisabledField({ disabled: undefined, name })
  }, [control, name])

  return { onChange, onBlur, ref }
}

export interface UseFieldControllerProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed extends FieldValues = TValues,
> {
  control: Control<TValues, unknown, TTransformed>
  name: TName
}

export function useFieldController<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed extends FieldValues = TValues,
>({
  control,
  name,
}: UseFieldControllerProps<TValues, TName, TTransformed>): {
  field: ControllerRenderProps<TValues, TName>
  fieldState: ControllerFieldState
} {
  const defaultValue = React.useMemo(() => {
    const resolved: unknown = get(
      control._formValues,
      name,
      get(control._defaultValues, name),
    )
    return (
      resolved === undefined
        ? nullAncestorValue(control._formValues, control._defaultValues, name)
        : resolved
    ) as FieldPathValue<TValues, TName>
  }, [control, name])
  const value = useWatch({ control, name, defaultValue, exact: true })
  const { fieldState, isFormDisabled } = useFieldState(control, name)
  const { onChange, onBlur, ref } = useFieldRegistration(control, name, value)
  const field = React.useMemo<ControllerRenderProps<TValues, TName>>(
    () => ({
      name,
      value,
      ...(isFormDisabled ? { disabled: true } : {}),
      onChange,
      onBlur,
      ref,
    }),
    [name, value, isFormDisabled, onChange, onBlur, ref],
  )
  return { field, fieldState }
}
