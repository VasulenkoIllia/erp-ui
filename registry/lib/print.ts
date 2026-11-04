/**
 * Друк (PF08, ADR-0062): HTML і стилі друку браузера, без бібліотек; архівний юридичний PDF — справа
 * сервера (SPEC §12). Стилі друку будь-якої сторінки — `tokens/base.css`, аркуш — `erp/print-preview`.
 *
 * - На сторінці з аркушем (`data-print-root`) друкується лише він, без аркуша — сторінка без оболонки.
 * - Мова друку — мова документа, окремо від мови інтерфейсу (SPEC §11): `usePrintLanguage`.
 * - Назву файла PDF браузер бере із заголовка сторінки: на час друку це назва документа.
 */
import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  ERP_UI_NAMESPACE,
  LOCALES,
  toLanguage,
  type ErpUiTranslate,
  type Language,
} from "@/registry/lib/i18n"

/** Атрибут аркуша: на сторінці з ним друкується лише він (`tokens/base.css`). */
export const PRINT_ROOT_ATTRIBUTE = "data-print-root"

/** Аркуш A4, мм, і поля паперу, як у `@page` (`tokens/base.css`). */
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
export const PRINT_MARGIN_MM = 12

const PX_PER_MM = 96 / 25.4
export const mmToPx = (mm: number) => mm * PX_PER_MM

/** Найдовше чекати шрифти й зображення аркуша (логотип, печатку) перед друком. */
export const PRINT_READY_TIMEOUT_MS = 3000

/** Символи, яких не буває в назві файла. */
const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|]+/g

/** Назва файла PDF із назви документа: «Рахунок № 2026/0001» → «Рахунок № 2026-0001». */
export const printFileName = (title: string) =>
  title.replace(FILE_NAME_FORBIDDEN, "-").replace(/\s+/g, " ").trim()

/** Шрифти й зображення, які ще вантажаться: незавантажених логотипа й печатки браузер не надрукує. */
async function printAssetsReady(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"), (image) =>
    // Зіпсоване зображення не зупиняє друк: аркуш друкується без нього.
    image.decode().catch(() => undefined),
  )
  await Promise.all([document.fonts.ready, ...images])
}

async function untilReady(root: ParentNode, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([printAssetsReady(root), timeout]).finally(() => {
    clearTimeout(timer)
  })
}

/** Заголовок сторінки на час друку; повертає відновлення. */
function setPrintTitle(title: string | undefined): () => void {
  if (!title) return () => undefined
  const previous = document.title
  document.title = printFileName(title)
  return () => {
    document.title = previous
  }
}

export interface PrintPageOptions {
  /** Назва документа: з неї браузер бере назву файла PDF. */
  title?: string
  /** Де шукати зображення, які треба дочекатися; за замовчуванням уся сторінка. */
  root?: ParentNode
  timeoutMs?: number
}

/** Друк сторінки: дочекатися шрифтів і зображень (не довше `timeoutMs`) і відкрити діалог друку. */
export async function printPage({
  title,
  root = document,
  timeoutMs = PRINT_READY_TIMEOUT_MS,
}: PrintPageOptions = {}): Promise<void> {
  await untilReady(root, timeoutMs)
  const restore = setPrintTitle(title)
  window.addEventListener("afterprint", restore, { once: true })
  window.print()
}

/**
 * Назва документа в заголовку сторінки й тоді, коли друк відкрили з меню браузера чи Ctrl+P: діалог
 * друку бере назву файла PDF звідти.
 */
export function usePrintTitle(title: string | undefined): void {
  React.useEffect(() => {
    if (!title) return
    let restore: (() => void) | null = null
    const before = () => {
      restore ??= setPrintTitle(title)
    }
    const after = () => {
      restore?.()
      restore = null
    }
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
      after()
    }
  }, [title])
}

export interface PrintLanguage {
  language: Language
  /** Локаль Intl мови документа: суми, дати, кількості. */
  locale: string
  /** Рядки кіта мовою документа. */
  t: ErpUiTranslate
  /** Рядки мови ще вантажаться: аркуш показує скелет, щоб не блимнути запасною мовою. */
  isLoading: boolean
}

/**
 * Рядки кіта мовою документа, а не інтерфейсу (SPEC §11): англійська вантажиться окремим чанком, тож
 * англійський рахунок в українському інтерфейсі спершу довантажує її. Довантажує й перемальовує
 * react-i18next: він чекає й на завантаження, яке вже почалось (власний `loadLanguages` удруге
 * завершується одразу, і аркуш лишився б запасною мовою). Не довантажилась — запасна українська, як і
 * для інтерфейсу.
 */
export function usePrintLanguage(language?: string): PrintLanguage {
  const { i18n } = useTranslation()
  const resolved = toLanguage(
    language ?? i18n.resolvedLanguage ?? i18n.language,
  )
  const { t, ready } = useTranslation(ERP_UI_NAMESPACE as never, {
    lng: resolved,
    useSuspense: false,
  })
  return {
    language: resolved,
    locale: LOCALES[resolved],
    // Як у useErpUiT: власні типи ключів, без CustomTypeOptions проекту; з ними приведення потрібне.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- див. коментар вище
    t: t as unknown as ErpUiTranslate,
    isLoading: !ready,
  }
}

/** Мова аркуша для блоків друку (`erp/print-document`); дає її `erp/print-preview`. */
export const PrintSheetContext = React.createContext<PrintLanguage | null>(null)

/** Мова аркуша; поза `erp/print-preview` — мова інтерфейсу. */
export function usePrintSheet(): PrintLanguage {
  const fallback = usePrintLanguage()
  return React.useContext(PrintSheetContext) ?? fallback
}
