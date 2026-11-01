/**
 * Вигляд оформленого тексту: той самий у показі, у полі лише для читання й у редакторі (ADR-0052).
 * Окремий файл без React і без Tiptap: його беруть і легкий показ, і лінивий чанк редактора.
 */
/** Вікно посилання: фокус у ньому не виходить із поля. */
export const richTextLinkSlot = "rich-text-link"

export const richTextContentClass =
  "min-w-0 wrap-anywhere [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-2 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground [&_li]:my-0.5 [&_li>p]:my-0 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&>:first-child]:mt-0 [&>:last-child]:mb-0"

export const richTextMentionClass =
  "rounded-sm bg-muted px-0.5 font-medium text-foreground forced-colors:outline-1 forced-colors:outline-solid"

/** Рамка поля: стани такі самі, як у `ui/textarea`. */
export const richTextFrameClass =
  "@container flex w-full min-w-0 flex-col rounded-lg border border-input bg-transparent transition-colors outline-none dark:bg-input/30"

export const richTextInvalidClass =
  "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40"

/** Тіло поля: мінімальна висота не стрибає, коли лінивий редактор змінює заглушку. */
export const richTextBodyClass =
  "min-h-24 px-2.5 py-2 text-base outline-none @lg:min-h-32 md:text-sm"
