/**
 * Розширення документа (ADR-0020, ADR-0086): що проект змінює в документі модуля без правки файлів
 * модуля — поля, статуси й дії графа, список із діями рядка й масовими, картка, форма з групами полів,
 * аркуш друку й поля рядків документа. Документні модулі (B3, K2, K4) збирають свої типи розширення з
 * цього: `SalesDocumentExtension`, `InvoiceDocumentExtension`, `MoneyDocumentExtension` — псевдоніми,
 * ключі (`Ids`) — свої в кожного документа.
 *
 *   export type InvoiceDocumentExtension =
 *     DocumentExtension<Invoice, InvoiceIds, InvoiceStatus, InvoiceTransitionId> & DocumentLinesExtension
 */
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionField,
  ExtensionFilter,
  ExtensionTab,
} from "@/registry/lib/extension-fields"
import type {
  ExtensionFormChanges,
  ExtensionFormGroup,
} from "@/registry/lib/extension-form"
import type { Keyed, KeyedChanges } from "@/registry/lib/extensions"
import type {
  ExtensionStatusChanges,
  ExtensionTransitionChanges,
} from "@/registry/lib/statuses"
import type { ExtensionSheetBlock } from "@/registry/erp/print-sheet-blocks"
import type {
  ExtensionBulkAction,
  ExtensionRowAction,
} from "@/registry/templates/list-report-slots"
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
  /** Масові дії панелі вибраного; без своїх — `never`. */
  bulkAction: string
}

/** Ключі документа з аркушем друку. */
export interface DocumentSheetIds extends DocumentIds {
  /** Блоки аркуша: шапка компанії, назва, сторони, поля розширення (`fields`), рядки, підсумки, підписи. */
  sheetBlock: string
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
   * Дії в рядку списку — компоненти проекту з правом `access` у колонці «Дії» (`templates/list-report-slots`).
   * Своїх дій рядка в модулів немає: нова стає на початок чи в кінець.
   */
  readonly rowActions?: KeyedChanges<ExtensionRowAction<D>, never>
  /** Масові дії панелі вибраного: своя — компонент проекту з правом `access`; дію модуля — сховати чи переставити. */
  readonly bulkActions?: KeyedChanges<ExtensionBulkAction, Ids["bulkAction"]>
  /**
   * Форма створення й зміни шапки (`lib/extension-form`): `add` — поле розширення з `fields`, `hide` і
   * `move` — поля модуля, `change` — підпис і підказка поля модуля.
   */
  readonly form?: ExtensionFormChanges<Ids["formField"]>
  /**
   * Групи полів форми шапки із заголовком (`fieldset`) під полями без групи: поле модуля чи розширення
   * стає в першу групу, що його називає, у порядку групи. Своїх груп у модулів немає.
   */
  readonly formGroups?: KeyedChanges<
    ExtensionFormGroup<Ids["formField"]>,
    never
  >
}

/** Аркуш друку документа: свої блоки, сховати чи переставити блок модуля, поля розширення на аркуші. */
export interface DocumentPrintExtension<D, K extends string = string> {
  /** Блоки аркуша: новий — компонент проекту (`erp/print-sheet-blocks`), блок модуля — сховати чи переставити. */
  readonly blocks?: KeyedChanges<ExtensionSheetBlock<D>, K>
  /**
   * Поля розширення з `fields` на аркуші рядками «Підпис: значення» мовою документа — блок `fields`
   * (типово після сторін; місце — `blocks.move`). Порожнє значення не друкується.
   */
  readonly fields?: readonly Keyed[]
}

/** Розширення документа з карткою своєї «Історії», блокуванням «Редагує …» і друком (B3, K2). */
export interface DocumentExtension<
  D,
  Ids extends DocumentSheetIds,
  S extends string = string,
  T extends string = string,
> extends DocumentPartsExtension<D, Ids, S, T> {
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
  /** `false` — без «Редагує …» (ADR-0051): бекенд без блокувань і так нічого не зламає. */
  readonly editLock?: boolean
  /** Стрічка картки замість «Історії»: `timelineModule.aside` модуля N1 чи свій компонент (ADR-0054). */
  readonly aside?: ExtensionAside<D>
  /** Аркуш друку: назва — рядками модуля (`strings`), тут — блоки й поля розширення. */
  readonly print?: DocumentPrintExtension<D, Ids["sheetBlock"]>
}

/** Документ із редактором рядків (пропозиції, замовлення, рахунки): поля розширення в рядку. */
export interface DocumentLinesExtension {
  /**
   * Нові поля рядка товару чи послуги (УКТЗЕД, код за класифікатором): схема й підпис, як у `fields`.
   * Поле стоїть у рядку редактора під назвою, на картці й на аркуші; значення — у рядку документа
   * (`lines[].<ключ>`). Розділ і нотатка полів не мають.
   */
  readonly lineFields?: readonly ExtensionField[]
}
