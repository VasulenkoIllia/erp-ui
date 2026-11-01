import { useMemo } from "react"

import type { RecordField } from "@/registry/erp/record-header"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import {
  extendSchema,
  useExtensionFields,
  type ExtensionColumn,
  type ExtensionField,
} from "@/registry/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type Keyed,
  type KeyedChanges,
} from "@/registry/lib/extensions"
import type {
  ExtensionAction,
  ExtensionAside,
  ExtensionSection,
} from "@/registry/templates/object-page"

import { invoiceSchema, type Invoice } from "@/data/invoices"

/**
 * Точки розширення рахунків стрес-сторінки (ADR-0020) — так їх матиме модуль (B1 на кроці 1.4, K2 у
 * хвилі 2): тип розширення з ключами модуля і злиття з колонками списку, полями, секціями й діями
 * картки. Розширення проекту — `src/extensions/K2-invoices.ts`: модуль його не імпортує, а
 * отримує там, де його підключають (`lazy-pages.ts`, моки в `mocks/handlers.ts`).
 */

export type InvoiceColumnId =
  "number" | "client" | "date" | "dueDate" | "amount" | "status" | "actions"
/** Ключові поля шапки картки. */
export type InvoiceFieldId = "client" | "date" | "dueDate" | "amount"
export type InvoiceSectionId = "lines"
export type InvoiceActionId = "approve" | "edit"

export interface InvoicesExtension {
  /** Нові поля рахунку: схема, підписи, значення для моків. */
  fields?: readonly ExtensionField[]
  /** Колонки списку з полів розширення. */
  columns?: KeyedChanges<ExtensionColumn, InvoiceColumnId>
  /** Ключові поля в шапці картки: ключ — поле розширення. */
  recordFields?: KeyedChanges<Keyed, InvoiceFieldId>
  /** Секції картки — компоненти проекту. */
  sections?: KeyedChanges<ExtensionSection<Invoice>, InvoiceSectionId>
  /** Дії в шапці картки — компоненти проекту. */
  actions?: KeyedChanges<ExtensionAction<Invoice>, InvoiceActionId>
  /** Стрічка картки замість «Історії» (ADR-0054). */
  aside?: ExtensionAside<Invoice>
}

/** Без розширення рахунки такі, як у кіті. */
export const NO_INVOICES_EXTENSION: InvoicesExtension = {}

/** Номер — назва картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS = ["number"]

/** Колонки списку з колонками розширення; `columns` модуля — стабільні (`useMemo`). */
export function useExtendedInvoiceColumns(
  columns: readonly (DataTableColumn<Invoice> & { id: InvoiceColumnId })[],
  extension: InvoicesExtension,
): readonly DataTableColumn<Invoice>[] {
  const fields = useExtensionFields(extension.fields)
  return useMemo(
    () =>
      applyKeyedChanges(
        columns,
        mapKeyedChanges(extension.columns, fields.column),
        { locked: LOCKED_COLUMNS },
      ),
    [columns, extension.columns, fields],
  )
}

/** Схема рахунку з полями розширення: без неї картка відкинула б нові поля відповіді. */
export function useInvoiceSchema(extension: InvoicesExtension) {
  return useMemo(
    () => extendSchema(invoiceSchema, extension.fields),
    [extension.fields],
  )
}

/** Ключові поля шапки картки з полями розширення. */
export function useExtendedRecordFields(
  fields: readonly (RecordField & { id: InvoiceFieldId })[],
  record: Invoice | undefined,
  extension: InvoicesExtension,
): readonly RecordField[] {
  const extensionFields = useExtensionFields(extension.fields)
  if (!record) return fields
  return applyKeyedChanges(
    fields,
    mapKeyedChanges(extension.recordFields, (field) =>
      extensionFields.displayEntry(field, record),
    ),
  )
}
