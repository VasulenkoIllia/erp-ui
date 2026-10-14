import { lazyWithPreload } from "@/registry/lib/lazy"

// Поле суми тягне react-number-format: окремим чанком (той самий, що в панелі фільтрів), сторінка
// прогріває його, поки браузер вільний (ADR-0009).
export const MoneyInput = lazyWithPreload(() =>
  import("@/registry/erp/number-input").then((m) => m.MoneyInput),
)

/** Прогріти редактори комірок стрес-сторінки. */
export const preloadInlineEditors = () => MoneyInput.preload()
