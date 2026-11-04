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
  DEFAULT_LANGUAGE,
  ERP_UI_NAMESPACE,
  LOCALES,
  toLanguage,
  type ErpUiTranslate,
  type Language,
} from "@/registry/lib/i18n"

/** Атрибут аркуша: на сторінці з ним друкується лише він (`tokens/base.css`). */
export const PRINT_ROOT_ATTRIBUTE = "data-print-root"

/** Ширина аркуша A4, мм, як у `@page` (`tokens/base.css`). */
export const A4_WIDTH_MM = 210

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
  // Без Font Loading API (старий WebView) чекаємо лише зображень.
  const fonts = (document.fonts as FontFaceSet | undefined)?.ready
  await Promise.all([fonts, ...images])
}

async function untilReady(root: ParentNode, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  // Очікування не зупиняє друк: без Font Loading API чи `decode` (старий WebView, jsdom) друкуємо одразу.
  const assets = printAssetsReady(root).catch(() => undefined)
  await Promise.race([assets, timeout]).finally(() => {
    clearTimeout(timer)
  })
}

/**
 * Заголовок сторінки до друку — один на всі виклики: друк без `afterprint` (частина мобільних браузерів)
 * не робить назву документа «попереднім» заголовком наступного друку, а порядок слухачів неважливий.
 * Заголовок, який змінила сама сторінка (перехід), — уже не наш: його не перезаписуємо старим.
 */
let titleBeforePrint: string | null = null
let printTitle: string | null = null

function setPrintTitle(title: string) {
  if (document.title !== printTitle) titleBeforePrint = document.title
  printTitle = printFileName(title)
  document.title = printTitle
}

function restoreTitle() {
  if (titleBeforePrint !== null && document.title === printTitle)
    document.title = titleBeforePrint
  titleBeforePrint = null
  printTitle = null
}

const printRoot = (): ParentNode =>
  document.querySelector(`[${PRINT_ROOT_ATTRIBUTE}]`) ?? document

export interface PrintPageOptions {
  /** Назва документа: з неї браузер бере назву файла PDF. */
  title?: string
  /** Де шукати зображення, які треба дочекатися; за замовчуванням аркуш, без нього — уся сторінка. */
  root?: ParentNode
  timeoutMs?: number
  /** Скасувати друк, поки чекаємо зображень: людина пішла зі сторінки, діалог відкрився б для іншої. */
  signal?: AbortSignal
}

/** Друк сторінки: дочекатися шрифтів і зображень (не довше `timeoutMs`) і відкрити діалог друку. */
export async function printPage({
  title,
  root = printRoot(),
  timeoutMs = PRINT_READY_TIMEOUT_MS,
  signal,
}: PrintPageOptions = {}): Promise<void> {
  await untilReady(root, timeoutMs)
  if (signal?.aborted) return
  if (title) setPrintTitle(title)
  // Той самий слухач додається один раз, хоч скільки було друків без `afterprint`; без `once`, бо
  // разовий слухач поглинув би постійний того самого `usePrintTitle`.
  window.addEventListener("afterprint", restoreTitle)
  try {
    window.print()
  } catch (error) {
    restoreTitle()
    throw error
  }
}

/**
 * Назва документа в заголовку сторінки й тоді, коли друк відкрили з меню браузера чи Ctrl+P: діалог
 * друку бере назву файла PDF звідти.
 */
export function usePrintTitle(title: string | undefined): void {
  React.useEffect(() => {
    if (!title) return
    const before = () => {
      setPrintTitle(title)
    }
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", restoreTitle)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", restoreTitle)
      restoreTitle()
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
 * для інтерфейсу, разом із `lang`, локаллю й сумою прописом (WCAG 3.1.2).
 */
export function usePrintLanguage(language?: string | null): PrintLanguage {
  const { i18n } = useTranslation()
  const requested = toLanguage(
    language ?? i18n.resolvedLanguage ?? i18n.language,
  )
  const { t, ready } = useTranslation(ERP_UI_NAMESPACE as never, {
    lng: requested,
    useSuspense: false,
  })
  const resolved =
    ready && !i18n.hasResourceBundle(requested, ERP_UI_NAMESPACE)
      ? DEFAULT_LANGUAGE
      : requested
  // Значення контексту аркуша: новий об'єкт щоразу перемальовував би всі рядки аркуша.
  return React.useMemo(
    () => ({
      language: resolved,
      locale: LOCALES[resolved],
      // Як у useErpUiT: власні типи ключів, без CustomTypeOptions проекту; з ними приведення потрібне.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- див. коментар вище
      t: t as unknown as ErpUiTranslate,
      isLoading: !ready,
    }),
    [resolved, t, ready],
  )
}

/** Мова аркуша для блоків друку (`erp/print-document`); дає її `erp/print-preview`. */
export const PrintSheetContext = React.createContext<PrintLanguage | null>(null)

/** Мова аркуша; поза `erp/print-preview` — мова інтерфейсу. */
export function usePrintSheet(): PrintLanguage {
  const fallback = usePrintLanguage()
  return React.useContext(PrintSheetContext) ?? fallback
}
