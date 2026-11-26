import type { GalleryPhoto } from "@/registry/erp/photo-gallery"

/**
 * Товари сторінки «Фото» (UI11, ADR-0101): каталог постачальників для пошуку за фото. Шість зразків
 * покривають стани перегляду фото: кілька фото, запасне джерело, жодне не завантажилось, без фото.
 * Для сотні карток зразки повторюються з новими кодами.
 */
export interface DemoVariant {
  sku: string
  color: string | null
  size: string | null
  stock: number | null
  arrival: string | null
  price: number | null
}

export type DemoOffer = "print" | "sale"

export interface DemoProduct {
  id: string
  code: string
  supplier: string
  name: string
  category: string
  photos: GalleryPhoto[]
  priceFrom: number | null
  priceTo: number | null
  stock: number | null
  offers: DemoOffer[]
  variants: DemoVariant[]
}

/** Своєї зменшеної копії на сервері ще немає: перегляд бере посилання постачальника. */
const MISSING_COPY = "photos/missing-copy.jpg"

const photo = (file: string, own?: string): GalleryPhoto => ({
  sources: [own, `photos/${file}`],
  href: `photos/${file}`,
  key: file,
})

const colors = (
  sku: string,
  list: readonly string[],
  price: number,
): DemoVariant[] =>
  list.map((color, index) => ({
    sku: `${sku}-${String(index + 1).padStart(2, "0")}`,
    color,
    size: null,
    stock: index === 2 ? null : 40 * (index + 1),
    arrival: null,
    price,
  }))

const SAMPLES: Omit<DemoProduct, "id">[] = [
  {
    code: "MG-310",
    supplier: "Постачальник А",
    name: "Чашка керамічна 310 мл",
    category: "Посуд › Чашки",
    photos: [photo("mug.svg", MISSING_COPY), photo("mug-side.svg")],
    priceFrom: 86,
    priceTo: 112,
    stock: 1840,
    offers: ["print"],
    variants: colors("MG-310", ["синій", "білий", "чорний", "червоний"], 86),
  },
  {
    code: "BT-500",
    supplier: "Постачальник Б",
    name: "Пляшка для води 500 мл",
    category: "Спорт › Пляшки",
    photos: [photo("bottle.svg")],
    priceFrom: 145,
    priceTo: 145,
    stock: 320,
    offers: ["sale"],
    variants: [
      {
        sku: "BT-500-GR",
        color: "зелений",
        size: null,
        stock: 120,
        arrival: "12.12.2026, 400 шт.",
        price: 145,
      },
      {
        sku: "BT-500-BK",
        color: "чорний",
        size: null,
        stock: 200,
        arrival: null,
        price: 145,
      },
    ],
  },
  {
    code: "BG-12",
    supplier: "Постачальник А",
    name: "Сумка-шопер з бавовни",
    category: "Сумки › Шопери",
    photos: [
      { sources: [MISSING_COPY, "photos/missing-supplier.jpg"], key: "bag" },
    ],
    priceFrom: 64,
    priceTo: 79,
    stock: 0,
    offers: [],
    variants: colors("BG-12", ["натуральний", "чорний"], 64),
  },
  {
    code: "PN-07",
    supplier: "Постачальник В",
    name: "Ручка кулькова металева",
    category: "Канцелярія › Ручки",
    photos: [],
    priceFrom: 23,
    priceTo: 31,
    stock: null,
    offers: ["print", "sale"],
    variants: colors("PN-07", ["червоний", "синій", "срібний"], 23),
  },
  {
    code: "CP-88",
    supplier: "Постачальник Б",
    name: "Кепка п'ятипанельна",
    category: "Одяг › Кепки",
    photos: [photo("cap.svg"), photo("bag.svg")],
    priceFrom: 132,
    priceTo: 160,
    stock: 75,
    offers: ["print"],
    variants: ["S", "M", "L"].map((size, index) => ({
      sku: `CP-88-${size}`,
      color: "фіолетовий",
      size,
      stock: 25,
      arrival: index === 2 ? "03.01.2027, 50 шт." : null,
      price: 132 + index * 14,
    })),
  },
  {
    code: "MG-450",
    supplier: "Постачальник В",
    name: "Термочашка 450 мл",
    category: "Посуд › Термочашки",
    photos: [photo("mug-side.svg")],
    priceFrom: 210,
    priceTo: 210,
    stock: 12,
    offers: [],
    variants: colors("MG-450", ["синій"], 210),
  },
]

/** `count` товарів: зразки по колу, коди з номером повтору. */
export function demoProducts(count: number): DemoProduct[] {
  return Array.from({ length: count }, (_, index) => index).flatMap((index) => {
    const sample = SAMPLES[index % SAMPLES.length]
    if (!sample) return []
    const round = Math.floor(index / SAMPLES.length)
    const code = round ? `${sample.code}-${String(round + 1)}` : sample.code
    return [{ ...sample, id: `product-${String(index + 1)}`, code }]
  })
}

export const SAMPLE_COUNT = SAMPLES.length
