/**
 * Рядки фото українською (частина UI11, ADR-0101, ADR-0103): поле кількох фото з обрізанням і порядком,
 * смуга мініатюр, перегляд фото товару, сітка карток. Вантажаться разом із цими компонентами (ADR-0094). Англійська —
 * lib/i18n-en-photos.
 */
export const ukPhotos = {
  photos: {
    input: {
      choose: "Вибрати фото",
      add: "Додати фото",
      dropHint: "Перетягніть фото сюди або вставте скриншот",
      limit_one: "До {{count}} фото: JPEG, PNG чи WebP, кожне до {{size}}",
      limit_few: "До {{count}} фото: JPEG, PNG чи WebP, кожне до {{size}}",
      limit_many: "До {{count}} фото: JPEG, PNG чи WebP, кожне до {{size}}",
      limit_other: "До {{count}} фото: JPEG, PNG чи WebP, кожне до {{size}}",
      cropHint:
        "Обведіть потрібну частину фото рамкою або торкніться двох кутів по черзі.",
      output: "На виході {{width}} × {{height}} px",
      wholePhoto: "Усе фото",
      remove: "Прибрати фото",
      removeAll: "Прибрати всі",
      loading_one: "Читаємо {{count}} фото…",
      loading_few: "Читаємо {{count}} фото…",
      loading_many: "Читаємо {{count}} фото…",
      loading_other: "Читаємо {{count}} фото…",
      added: "Додано фото «{{name}}»",
      addedSeveral_one: "Додано {{count}} фото",
      addedSeveral_few: "Додано {{count}} фото",
      addedSeveral_many: "Додано {{count}} фото",
      addedSeveral_other: "Додано {{count}} фото",
      removed: "Фото «{{name}}» прибрано",
      cleared: "Фото прибрано",
      earlier: "Раніше",
      later: "Пізніше",
      earlierLabel: "Раніше: фото «{{name}}»",
      laterLabel: "Пізніше: фото «{{name}}»",
      moved: "Фото «{{name}}» тепер {{index}} з {{count}}",
      movedMain: "Фото «{{name}}» тепер головне",
      errors: {
        type: "«{{name}}» не фото JPEG, PNG чи WebP.",
        size: "«{{name}}» більший за {{size}}.",
        unreadable: "Не вдалося прочитати «{{name}}» як фото.",
        duplicate: "«{{name}}» уже додано.",
        tooMany_one: "Більше {{count}} фото додати не можна.",
        tooMany_few: "Більше {{count}} фото додати не можна.",
        tooMany_many: "Більше {{count}} фото додати не можна.",
        tooMany_other: "Більше {{count}} фото додати не можна.",
      },
    },
    crop: {
      area: "Обрізання фото «{{name}}»",
      role: "область обрізання",
      keys: "Стрілки зсувають рамку, Shift зі стрілками змінює її розмір, Delete повертає все фото, Escape скасовує перший кут.",
      frame:
        "Рамка {{width}} × {{height}} px, від лівого краю {{x}}, від верху {{y}}, фото {{photoWidth}} × {{photoHeight}}",
      whole: "Усе фото, {{width}} × {{height}} px",
      corner: "Перший кут вибрано, торкніться другого",
    },
    strip: {
      label: "Вибрані фото",
      position: "Фото {{index}} з {{count}}:",
      cropped: "обрізано",
      main: "головне",
      removeShort: "Прибрати",
      remove: "Прибрати фото {{index}}: {{name}}",
    },
    gallery: {
      noPhoto: "Без фото",
      failed: "Фото не завантажилось",
      show: "Фото {{index}} з {{count}}",
      thumbs: "Фото: {{name}}",
      open: "Відкрити велике фото «{{name}}» у новій вкладці",
    },
    grid: {
      loading: "Завантаження карток",
    },
  },
}
