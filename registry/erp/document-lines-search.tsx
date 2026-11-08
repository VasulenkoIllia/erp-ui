import * as React from "react"
import { Autocomplete } from "@base-ui/react/autocomplete"
import { SearchIcon } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import type { DocumentBodyLine } from "@/registry/lib/document-lines"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import {
  ariaKeyShortcuts,
  isMacPlatform,
  SHORTCUTS,
} from "@/registry/lib/shortcuts"
import { cn } from "@/registry/lib/utils"
import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
} from "@/registry/ui/combobox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/registry/ui/input-group"

/**
 * Пошук у рядках `erp/document-lines-editor` (UI05d, ADR-0064): від порога віртуальних рядків пошук
 * браузера не бачить рядків поза екраном, тож редактор має свій. Запит шукає в назвах товарів, назвах
 * розділів і тексті нотаток без урахування регістру й діакритики; число — ще й номер рядка, першим.
 * Під полем — список знайдених рядків із номером і розділом, вибір ставить фокус у рядок
 * (`RepeatingRowsHandle.focusRow`). Рядки читаються з форми, коли змінюється запит чи відкривається
 * список: пошук не підписаний на введення в рядках.
 */

/** Знайдений рядок: місце, поле зі збігом і текст для списку. */
export interface DocumentLineMatch {
  readonly index: number
  /** Поле рядка зі збігом; `null` — збіг за номером рядка, фокус на перше поле. */
  readonly field: "name" | "title" | "text" | null
  readonly text: string
  /** Розділ, до якого належить рядок; у самого розділу й рядків до першого розділу — `null`. */
  readonly section: string | null
}

export interface DocumentLinesFound {
  readonly matches: readonly DocumentLineMatch[]
  /** Усі збіги; у списку — не більше `SEARCH_LIMIT`. */
  readonly total: number
}

/** Скільки збігів показує список: решту знаходить точніший запит. */
export const SEARCH_LIMIT = 50

const NOTHING: DocumentLinesFound = { matches: [], total: 0 }

const LINE_FIELD = { item: "name", section: "title", note: "text" } as const

const textOf = (line: DocumentBodyLine) =>
  line.kind === "item"
    ? line.name
    : line.kind === "section"
      ? line.title
      : line.text

/** Рядки за запитом у порядку документа; номер рядка (запит із самих цифр) — першим. */
export function findDocumentLines(
  lines: readonly DocumentBodyLine[],
  query: string,
  contains: (text: string, query: string) => boolean,
  limit = SEARCH_LIMIT,
): DocumentLinesFound {
  const trimmed = query.trim()
  if (!trimmed) return NOTHING
  const lineNumber = /^\d+$/.test(trimmed) ? Number(trimmed) : 0
  const matches: DocumentLineMatch[] = []
  let byNumber: DocumentLineMatch | null = null
  let total = 0
  let section: string | null = null
  lines.forEach((line, index) => {
    const text = textOf(line)
    const own = line.kind === "section" ? null : section
    if (line.kind === "section") section = line.title
    if (index + 1 === lineNumber)
      byNumber = { index, field: null, text, section: own }
    if (!contains(text, trimmed)) return
    total += 1
    if (matches.length < limit)
      matches.push({ index, field: LINE_FIELD[line.kind], text, section: own })
  })
  if (!byNumber) return { matches, total }
  return { matches: [byNumber, ...matches].slice(0, limit), total: total + 1 }
}

export interface DocumentLinesSearchProps {
  form: UseFormReturn<DocumentLinesValues>
  /** Вибраний рядок: редактор ставить на нього фокус. */
  onFind: (match: DocumentLineMatch) => void
  inputRef?: React.Ref<HTMLInputElement>
  className?: string
}

const matchKey = (match: DocumentLineMatch) =>
  `${String(match.index)}-${match.field ?? "line"}`

export function DocumentLinesSearch({
  form,
  onFind,
  inputRef,
  className,
}: DocumentLinesSearchProps) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const { contains } = Autocomplete.useFilter({ sensitivity: "base", locale })
  const [query, setQuery] = React.useState("")
  const [found, setFound] = React.useState(NOTHING)
  const search = (text: string) => {
    setFound(findDocumentLines(form.getValues("lines"), text, contains))
  }
  return (
    <Autocomplete.Root
      items={found.matches}
      filter={null}
      value={query}
      onValueChange={(value, details) => {
        // Вибір рядка лишає запит у полі: до наступного збігу — той самий список.
        if (details.reason === "item-press") return
        setQuery(value)
        search(value)
      }}
      onOpenChange={(open) => {
        // Рядки могли змінитись, поки список був закритий.
        if (open) search(query)
      }}
      itemToStringValue={(match: DocumentLineMatch) => match.text}
      autoHighlight
      openOnInputClick
    >
      <InputGroup
        className={className}
        onKeyDown={(event) => {
          // Enter без вибраного рядка не відправляє форму документа: поле — лише пошук.
          if (event.key === "Enter") event.preventDefault()
        }}
      >
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <Autocomplete.Input
          ref={inputRef}
          render={<InputGroupInput type="search" />}
          aria-label={t("documentLines.search.label")}
          aria-keyshortcuts={ariaKeyShortcuts(
            SHORTCUTS.documentSearch,
            isMacPlatform(),
          )}
          placeholder={t("documentLines.search.placeholder")}
          autoComplete="off"
        />
      </InputGroup>
      <ComboboxContent className="w-lg">
        <Autocomplete.Status className="sr-only">
          {found.total
            ? t("documentLines.search.found", { count: found.total })
            : null}
        </Autocomplete.Status>
        <ComboboxEmpty>{t("documentLines.search.empty")}</ComboboxEmpty>
        <ComboboxList>
          {(match: DocumentLineMatch) => (
            <Autocomplete.Item
              key={matchKey(match)}
              value={match}
              onClick={() => {
                onFind(match)
              }}
              className="flex min-h-control cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
            >
              <span className="shrink-0 font-medium tabular-nums">
                {t("documentLines.row", { index: match.index + 1 })}
              </span>
              {/* Коми — для скрінрідера: частини назви пункту інакше злипаються («Рядок 451Етап 19»). */}
              <span className="sr-only">, </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  !match.text && "text-muted-foreground",
                )}
              >
                {match.text || t("documentLines.search.noText")}
              </span>
              {match.section ? (
                <>
                  <span className="sr-only">, </span>
                  <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                    {match.section}
                  </span>
                </>
              ) : null}
            </Autocomplete.Item>
          )}
        </ComboboxList>
        {found.total > found.matches.length ? (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {t("documentLines.search.more", {
              shown: found.matches.length,
              total: found.total,
            })}
          </p>
        ) : null}
      </ComboboxContent>
    </Autocomplete.Root>
  )
}
