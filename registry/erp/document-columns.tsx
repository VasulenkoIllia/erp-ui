import type { DataTableColumn } from "@/registry/lib/data-table-core"
import type { useFormat } from "@/registry/lib/format"

/**
 * Колонки списку документів, однакові в документних модулях (ADR-0086): модуль дає назву своїми словами й
 * `format` поточної мови, а не копіює опис колонки.
 *
 *   const format = useFormat()
 *   documentDateColumn<Invoice>(t("invoices.columns.date"), format)
 */

/** «Дата» документа: дата без часу, перше сортування — спершу новіші; на вузькому — четвертою. */
export function documentDateColumn<D extends { readonly date: string }>(
  header: string,
  format: ReturnType<typeof useFormat>,
): DataTableColumn<D> & { id: "date" } {
  return {
    id: "date",
    header,
    cell: (document) => (
      <span className="tabular-nums">{format.date(document.date, "date")}</span>
    ),
    sortField: "date",
    firstSortOrder: "DESC",
    minWidth: 8,
    priority: 4,
  }
}
