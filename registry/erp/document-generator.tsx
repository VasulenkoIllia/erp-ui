import * as React from "react"
import { FileTextIcon } from "lucide-react"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import type { LocalizedText } from "@/registry/lib/auth"
import type { TemplateDocument } from "@/registry/lib/document-template"
import { useErpUiT } from "@/registry/lib/i18n"
import { lazyWithPreload } from "@/registry/lib/lazy"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/registry/ui/dialog"
import { Skeleton } from "@/registry/ui/skeleton"

/**
 * Документ із шаблону .docx (UI44, ADR-0087): людина вибирає шаблон Word проекту чи свій файл, бачить
 * мітки шаблону, уже заповнені даними документа, виправляє значення, дивиться на сам файл і завантажує
 * його. Заповнення — у браузері, бекенд не потрібен.
 *
 * - `DocumentGeneratorButton` — кнопка «Документ із шаблону» з діалогом. На картку модуля її ставить
 *   розширення проекту дією в слоті (`actions`, ADR-0086), модуль своєї кнопки не має.
 * - `DocumentGenerator` — той самий генератор без діалогу (сторінка проекту, демо).
 * - Бібліотеки .docx і перегляд — окремим чанком: він вантажиться, коли генератор відкривають, а
 *   наведення чи фокус на кнопці вантажить його заздалегідь. Збій завантаження — «Спробувати ще».
 * - Мітки й дані документа — `lib/document-template` (`TemplateDocument`, `templateDetailOf`), змінні —
 *   `erp/document-template-variables`.
 */
export interface DocumentTemplateOption {
  readonly id: string
  readonly label: LocalizedText
  /** Файл шаблону: статичний файл проекту чи відповідь API. Помилка — «Шаблон не завантажився». */
  readonly load: () => Promise<Blob>
}

export interface DocumentGeneratorProps {
  readonly document: TemplateDocument
  /** Шаблони проекту; людина може й вибрати свій файл .docx. */
  readonly templates?: readonly DocumentTemplateOption[]
  /** Назва файла без розширення, до неї додається назва шаблону: «РХ-2026-0012 Договір.docx». */
  readonly fileName: string
  /** Мова значень (суми, дати, прописом); без неї — мова компанії, як у друку. */
  readonly language?: string
  /** Шаблон на старті; без нього — перший шаблон проекту, а без шаблонів — свій файл. */
  readonly initialTemplateId?: string
}

const DocumentGeneratorPanel = lazyWithPreload(() =>
  import("./document-generator-panel").then(
    (module) => module.DocumentGeneratorPanel,
  ),
)

/** Завантажити чанк генератора заздалегідь: наведення на кнопку, відкриття картки. */
export const preloadDocumentGenerator = () => {
  void DocumentGeneratorPanel.preload()
}

function GeneratorSkeleton() {
  return (
    <div
      className="grid gap-3"
      aria-busy="true"
      data-slot="document-generator-skeleton"
    >
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

/** Генератор без діалогу: панель лінивим чанком із межею помилок. */
export function DocumentGenerator(props: DocumentGeneratorProps) {
  return (
    <ErrorBoundary headingLevel={3}>
      <React.Suspense fallback={<GeneratorSkeleton />}>
        <DocumentGeneratorPanel {...props} />
      </React.Suspense>
    </ErrorBoundary>
  )
}

export interface DocumentGeneratorButtonProps extends DocumentGeneratorProps {
  /** Назва кнопки; за замовчуванням «Документ із шаблону». */
  readonly label?: string
  /**
   * Діалог відкрили чи закрили: так проект вантажить дані документа (картку контрагента), лише коли
   * генератор потрібен, а не з кожною карткою.
   */
  readonly onOpenChange?: (isOpen: boolean) => void
}

/** Кнопка «Документ із шаблону» з генератором у діалогі. */
export function DocumentGeneratorButton({
  label,
  onOpenChange,
  ...props
}: DocumentGeneratorButtonProps) {
  const t = useErpUiT()
  return (
    <Dialog
      onOpenChange={(isOpen) => {
        onOpenChange?.(isOpen)
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" />}
        onPointerEnter={preloadDocumentGenerator}
        onFocus={preloadDocumentGenerator}
      >
        <FileTextIcon aria-hidden />
        {label ?? t("documentGenerator.action")}
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-6xl"
        data-slot="document-generator-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("documentGenerator.title")}</DialogTitle>
          <DialogDescription>
            {t("documentGenerator.description")}
          </DialogDescription>
        </DialogHeader>
        {/* Закритий діалог Base UI не монтує: генератор живе, поки видно діалог, і під час анімації закриття. */}
        <DocumentGenerator {...props} />
      </DialogContent>
    </Dialog>
  )
}
