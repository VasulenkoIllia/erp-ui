/**
 * Тип розширення модуля A4 — публічний API модуля (ADR-0020, ADR-0025, ADR-0050): несумісна зміна —
 * мажорна версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/A4-import-export.ts(x)` і передається у фабрику
 * `createImportExportModule({ extension })`. Ключі модуля (`…ColumnId`, `…FilterId`, `…TargetId`) у
 * мінорних версіях можуть доповнюватися: на них не будують вичерпних `Record` чи `switch` без `default`.
 */
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionFilter,
} from "@/lib/extension-fields"
import type { KeyedChanges } from "@/lib/extensions"
import type { ModuleStrings } from "@/lib/i18n-namespaces"

import type ukMessages from "./i18n/uk.json"
import type { ImportExportTargetDefinition } from "./targets"

/** Цілі модуля: ресурси B1 і A6. Без цих модулів у проекті ціль ховають. */
export type ImportExportTargetId =
  "contacts" | "organizations" | "taxes" | "units" | "tags" | "reasons"

export type ImportRunColumnId =
  | "fileName"
  | "target"
  | "status"
  | "startedAt"
  | "startedBy"
  | "created"
  | "updated"
  | "skipped"
  | "failed"

export type ImportRunFilterId = "target" | "status"

/** Що проект міняє в цілі модуля: нове поле — `fields` цілком, `CONTACTS_TARGET.fields` плюс своє. */
export type ImportExportTargetChange = Pick<
  ImportExportTargetDefinition,
  "label" | "fields" | "matchField"
>

export interface ImportHistoryExtension {
  /** `false` — без сторінки й пункту навігації: бекенд не веде історію запусків. */
  readonly page?: boolean
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    ImportRunColumnId,
    ExtensionColumnChange
  >
  readonly filters?: KeyedChanges<ExtensionFilter, ImportRunFilterId>
}

/** Рядки модуля (простір імен `A4-import-export`, `i18n/uk.json`). */
export type ImportExportMessages = typeof ukMessages

export interface ImportExportExtension {
  /** Цілі: свої (`add`), сховані (`hide`), змінені (`change`), порядок (`move`). */
  readonly targets?: KeyedChanges<
    ImportExportTargetDefinition,
    ImportExportTargetId,
    ImportExportTargetChange
  >
  readonly history?: ImportHistoryExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`. */
  readonly strings?: ModuleStrings<ImportExportMessages>
}
