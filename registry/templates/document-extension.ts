/**
 * Розширення документа (ADR-0020, ADR-0086): що проект змінює в документі модуля без правки файлів
 * модуля — поля, статуси й дії графа, список, картка й форма. Документні модулі (B3, K2, K4) збирають
 * свої типи розширення з цього: `SalesDocumentExtension`, `InvoiceDocumentExtension`,
 * `MoneyDocumentExtension` — псевдоніми, ключі (`Ids`) — свої в кожного документа.
 *
 *   export type InvoiceDocumentExtension =
 *     DocumentExtension<Invoice, InvoiceIds, InvoiceStatus, InvoiceTransitionId>
 */
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionField,
  ExtensionFilter,
  ExtensionTab,
} from "@/registry/lib/extension-fields"
import type { ExtensionFormChanges } from "@/registry/lib/extension-form"
import type { Keyed, KeyedChanges } from "@/registry/lib/extensions"
import type {
  ExtensionStatusChanges,
  ExtensionTransitionChanges,
} from "@/registry/lib/statuses"
import type {
  ExtensionAction,
  ExtensionAside,
  ExtensionSection,
} from "@/registry/templates/object-page"

/** Ключі документа модуля: ними сторінки модуля перевіряють свої списки, а розширення — свої зміни. */
export interface DocumentIds {
  column: string
  filter: string
  /** Вкладки списку: «Усі» і статуси; статус розширення — теж вкладка з його ключем. */
  tab: string
  /** Ключові поля шапки картки. */
  field: string
  section: string
  action: string
  /** Поля форми шапки (ключ — ім'я поля запису). */
  formField: string
}

/**
 * Частини документа, які змінює розширення: поля, статуси й дії, список, картка й форма. `D` — запис,
 * `S` і `T` — статуси й дії графа модуля.
 */
export interface DocumentPartsExtension<
  D,
  Ids extends DocumentIds,
  S extends string = string,
  T extends string = string,
> {
  /** Нові поля шапки: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /**
   * Статуси документа: додати, сховати з вибору; `change` — підпис, тон чи іконка статусу модуля без
   * заміни. Новий статус досяжний дією `transitions`.
   */
  readonly statuses?: ExtensionStatusChanges<S>
  /**
   * Дозволені переходи (ADR-0057): нова дія зі своїм статусом; `change` — підпис, `from` і причина дії
   * модуля, але не `to`.
   */
  readonly transitions?: ExtensionTransitionChanges<T>
  /** Колонки списку; нова — з поля розширення (ключ — ключ поля); `change` — назва, ширина чи пріоритет. */
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    Ids["column"],
    ExtensionColumnChange
  >
  /** Фільтри панелі списку; новий — з поля розширення (список, так/ні, дата). */
  readonly filters?: KeyedChanges<ExtensionFilter, Ids["filter"]>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, Ids["tab"]>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, Ids["field"]>
  /** Секції картки — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<D>, Ids["section"]>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<D>, Ids["action"]>
  /**
   * Форма створення й зміни шапки (`lib/extension-form`): `add` — поле розширення з `fields`, `hide` і
   * `move` — поля модуля, `change` — підпис і підказка поля модуля.
   */
  readonly form?: ExtensionFormChanges<Ids["formField"]>
}

/** Розширення документа з карткою своєї «Історії» й блокуванням «Редагує …» (B3, K2). */
export interface DocumentExtension<
  D,
  Ids extends DocumentIds,
  S extends string = string,
  T extends string = string,
> extends DocumentPartsExtension<D, Ids, S, T> {
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
  /** `false` — без «Редагує …» (ADR-0051): бекенд без блокувань і так нічого не зламає. */
  readonly editLock?: boolean
  /** Стрічка картки замість «Історії»: `timelineModule.aside` модуля N1 чи свій компонент (ADR-0054). */
  readonly aside?: ExtensionAside<D>
}
