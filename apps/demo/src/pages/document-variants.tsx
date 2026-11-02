import { useTranslation } from "react-i18next"

import { DocumentActionBar } from "@/registry/erp/document-action-bar"

import { DOCUMENT_RESOURCE, useDocumentTransitions } from "./document-model"
import { Section } from "./Section"

/** Ресурс, на який у демо немає прав: так виглядає панель для ролі лише з переглядом. */
const READ_ONLY_RESOURCE = "archive"

/**
 * Варіанти панелі без запитів: усі кнопки неактивні чи їх немає, тож натискання нікуди не йде.
 * Очікування, помилку, офлайн, відмову й конфлікт показує картка вище зі сценаріями моків.
 */
const VARIANTS = [
  {
    id: "noPermission",
    resource: READ_ONLY_RESOURCE,
    record: { id: "variant-1", version: 1, status: "submitted" },
    narrow: false,
  },
  {
    id: "denied",
    resource: DOCUMENT_RESOURCE,
    record: {
      id: "variant-2",
      version: 1,
      status: "paid",
      deniedActions: { cancel: "linked", reverse: "reversed" },
    },
    narrow: true,
  },
  {
    id: "none",
    resource: DOCUMENT_RESOURCE,
    record: { id: "variant-3", version: 1, status: "reversed" },
    narrow: false,
  },
] as const

export function DocumentVariants() {
  const { t } = useTranslation()
  const transitions = useDocumentTransitions()
  return (
    <Section
      title={t("documentPage.variantsTitle")}
      description={t("documentPage.variantsDescription")}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {VARIANTS.map(({ id, resource, record, narrow }) => (
          <figure key={id} className="space-y-2 rounded-lg border p-3">
            <figcaption className="text-sm font-medium">
              {t(`documentPage.variants.${id}`)}
            </figcaption>
            <DocumentActionBar
              resource={resource}
              record={record}
              transitions={transitions}
              className={narrow ? "max-w-60" : undefined}
            />
          </figure>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {t("documentPage.extension")}
      </p>
    </Section>
  )
}
