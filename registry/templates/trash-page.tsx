import { useAuthenticated } from "@/registry/lib/ra-core"

import { PageHeader } from "@/registry/erp/page-header"
import { PageSkeleton } from "@/registry/erp/page-state"
import { BackToList } from "@/registry/erp/record-link"
import { TrashView, type TrashViewProps } from "@/registry/erp/trash-view"
import { usePageHeading } from "@/registry/hooks/use-page-heading"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukTrash } from "@/registry/lib/i18n-uk-trash"

export interface TrashPageProps<T> extends Omit<
  TrashViewProps<T>,
  "headingRef"
> {
  /** Назва списку словами модуля: «Організації» — у заголовку «Кошик: Організації». */
  listTitle: string
  /** Список ресурсу: «Назад до списку» і кнопка «Кошик» у його шапці (erp/trash-link). */
  listPath: string
  /** Підпис «Назад до списку» словами модуля. */
  backLabel: string
}

/**
 * Сторінка кошика ресурсу в модулі (PF16, ADR-0095): «Назад до списку», заголовок «Кошик: <список>»,
 * строк зберігання від сервера й видалені записи з «Відновити» (erp/trash-view). Модуль дає назву списку,
 * підпис запису, схему рядка й адресу картки; маршрут — `<список>/trash`.
 *
 *   <TrashPage resource={ORGANIZATIONS} schema={organizationRowSchema} rowLabel={(o) => o.name}
 *     listTitle={t("organizations.title")} listPath={paths.organizations}
 *     backLabel={t("organization.back")} recordHref={paths.organization} />
 */
export function TrashPage<T>({
  listTitle,
  listPath,
  backLabel,
  ...view
}: TrashPageProps<T>) {
  const t = useErpUiT(ukTrash)
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const title = t("trash.pageTitle", { list: listTitle })
  const heading = usePageHeading(title)
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <BackToList to={listPath} label={backLabel} />
      <PageHeader title={title} headingRef={heading} />
      {isPending ? (
        <PageSkeleton rows={4} />
      ) : (
        <TrashView {...view} headingRef={heading} />
      )}
    </div>
  )
}
