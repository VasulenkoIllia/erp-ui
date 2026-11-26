import * as React from "react"

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PhotoGallery } from "@/registry/erp/photo-gallery"
import {
  ProductCard,
  ProductGrid,
  ProductVariants,
  type VariantColumn,
} from "@/registry/erp/product-grid"

describe("PhotoGallery", () => {
  const photos = [
    { sources: ["copy-1.jpg", "supplier-1.jpg"], href: "large-1.jpg" },
    { sources: [null, "supplier-2.jpg"] },
  ]

  it("головне фото з мініатюрами, велике в новій вкладці, без referrer і ліниво", async () => {
    render(<PhotoGallery photos={photos} name="Чашка" badge={<span>1</span>} />)
    const main = screen.getByRole("img", { name: "Чашка" })
    expect(main).toHaveAttribute("src", "copy-1.jpg")
    expect(main).toHaveAttribute("loading", "lazy")
    expect(main).toHaveAttribute("referrerpolicy", "no-referrer")
    const link = screen.getByRole("link", {
      name: "Відкрити велике фото «Чашка» у новій вкладці",
    })
    expect(link).toHaveAttribute("href", "large-1.jpg")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer")
    const second = screen.getByRole("button", { name: "Фото 2 з 2" })
    expect(second).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(second)
    expect(second).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("img", { name: "Чашка" })).toHaveAttribute(
      "src",
      "supplier-2.jpg",
    )
    // Без href — без посилання.
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("своя копія не завантажилась — посилання постачальника, далі «Фото не завантажилось»", () => {
    render(<PhotoGallery photos={photos.slice(0, 1)} name="Чашка" />)
    fireEvent.error(screen.getByRole("img", { name: "Чашка" }))
    const fallback = screen.getByRole("img", { name: "Чашка" })
    expect(fallback).toHaveAttribute("src", "supplier-1.jpg")
    fireEvent.error(fallback)
    expect(screen.queryByRole("img", { name: "Чашка" })).not.toBeInTheDocument()
    expect(screen.getByText("Фото не завантажилось")).toBeInTheDocument()
  })

  it("без фото — «Без фото», мініатюр немає", () => {
    render(<PhotoGallery photos={[]} name="Ручка" />)
    expect(screen.getByText("Без фото")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("та сама адреса двічі пробується раз; фото без адрес — «Без фото»", () => {
    const { rerender } = render(
      <PhotoGallery
        photos={[{ sources: ["same.jpg", null, "same.jpg"] }]}
        name="Чашка"
      />,
    )
    fireEvent.error(screen.getByRole("img", { name: "Чашка" }))
    expect(screen.getByText("Фото не завантажилось")).toBeInTheDocument()
    rerender(
      <PhotoGallery
        photos={[{ sources: [null, undefined] }, { sources: [""] }]}
        name="Чашка"
      />,
    )
    expect(screen.getByText("Без фото")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("велике фото — лише за адресою http(s)", () => {
    const { rerender } = render(
      <PhotoGallery
        photos={[{ sources: ["a.jpg"], href: "javascript:alert(1)" }]}
        name="Чашка"
      />,
    )
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    rerender(
      <PhotoGallery
        photos={[{ sources: ["a.jpg"], href: "/photos/large/a.jpg" }]}
        name="Чашка"
      />,
    )
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/photos/large/a.jpg",
    )
  })
})

interface Item {
  id: string
  name: string
}

const ITEMS: Item[] = Array.from({ length: 100 }, (_, index) => ({
  id: String(index),
  name: `Товар ${String(index)}`,
}))

describe("ProductGrid", () => {
  it("сотня карток не перемальовується без зміни записів; змінений — лише він", () => {
    const renderItem = vi.fn((item: Item) => <ProductCard title={item.name} />)
    function Page({ items, query }: { items: Item[]; query: string }) {
      const stable = React.useCallback((item: Item) => renderItem(item), [])
      return (
        <>
          <input aria-label="Пошук" value={query} readOnly />
          <ProductGrid
            items={items}
            getKey={(item) => item.id}
            renderItem={stable}
            label="Результати"
          />
        </>
      )
    }
    const { rerender } = render(<Page items={ITEMS} query="" />)
    expect(renderItem).toHaveBeenCalledTimes(100)
    expect(screen.getAllByRole("listitem")).toHaveLength(100)
    expect(
      screen.getByRole("heading", { level: 3, name: "Товар 0" }),
    ).toBeInTheDocument()
    rerender(<Page items={ITEMS} query="ч" />)
    expect(renderItem).toHaveBeenCalledTimes(100)
    const changed = ITEMS.map((item, index) =>
      index === 5 ? { ...item, name: "Нова назва" } : item,
    )
    rerender(<Page items={changed} query="ч" />)
    expect(renderItem).toHaveBeenCalledTimes(101)
    expect(
      screen.getByRole("article", { name: "Нова назва" }),
    ).toBeInTheDocument()
  })

  it("перше завантаження — скелетони, список зайнятий", async () => {
    render(
      <ProductGrid
        items={[]}
        getKey={(item: Item) => item.id}
        renderItem={(item) => <ProductCard title={item.name} />}
        label="Результати"
        loading
        skeletonCount={3}
      />,
    )
    expect(screen.getByRole("list", { name: "Результати" })).toHaveAttribute(
      "aria-busy",
      "true",
    )
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Завантаження карток",
      )
    })
  })
})

interface Variant {
  sku: string
  size: string | null
  price: number | null
}

const COLUMNS: VariantColumn<Variant>[] = [
  { id: "sku", header: "Артикул", value: (row) => row.sku },
  { id: "size", header: "Розмір", value: (row) => row.size },
  { id: "price", header: "Ціна", value: (row) => row.price, numeric: true },
  { id: "note", header: "Примітка", value: () => null, keep: true },
]

describe("ProductVariants", () => {
  it("таблиця з'являється, коли її відкрили; порожні колонки сховано", () => {
    render(
      <ProductCard
        title="Чашка"
        variants={
          <ProductVariants
            summary="2 варіанти"
            label="Варіанти: Чашка"
            columns={COLUMNS}
            rows={[
              { sku: "A-1", size: null, price: 10 },
              { sku: "A-2", size: null, price: null },
            ]}
            getRowId={(row) => row.sku}
          />
        }
      />,
    )
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    const details = screen.getByText("2 варіанти").closest("details")
    if (!details) throw new Error("no details")
    details.open = true
    fireEvent(details, new Event("toggle"))
    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent)
    expect(headers).toEqual(["Артикул", "Ціна", "Примітка"])
    expect(screen.getAllByRole("row")).toHaveLength(3)
  })
})
