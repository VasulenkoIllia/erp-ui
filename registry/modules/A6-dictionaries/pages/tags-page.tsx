import { TagIcon } from "lucide-react"
import { useMemo } from "react"

import { StatusBadge } from "@/components/erp/status-badge"

import type { DictionaryColumn } from "../components/dictionary-columns"
import { DictionaryPage } from "../components/dictionary-page"
import { TagFormDialog } from "../components/tag-form"
import { TAGS, type Tag } from "../contract"
import type { DictionaryFilterId, TagColumnId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"

interface TagIds {
  column: TagColumnId
  filter: DictionaryFilterId
  tab: never
}

/** Теги (ADR-0047): колонка показує тег таким, яким його побачать на записі. */
export function TagsPage() {
  const t = useDictionariesT()
  const { extension } = useDictionariesModule()
  const columns = useMemo(
    (): readonly DictionaryColumn<Tag, TagColumnId>[] => [
      {
        id: "preview",
        header: t("tags.columns.preview"),
        cell: (tag) => (
          <StatusBadge
            status={{ id: tag.id, label: tag.name, tone: tag.tone }}
          />
        ),
        minWidth: 10,
        grow: 1,
      },
    ],
    [t],
  )
  return (
    <DictionaryPage<Tag, TagIds>
      resource={TAGS}
      strings="tags"
      icon={TagIcon}
      columns={columns}
      extension={extension.tags}
      form={TagFormDialog}
    />
  )
}
